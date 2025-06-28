import asyncio
import json
import logging
import os
import time
from datetime import datetime
from typing import Dict, List, Optional, Set
import redis.asyncio as redis
import psutil
import pynvml
from models import Job, JobStatus, VideoGenerationRequest, JobListResponse, SystemStatusResponse


class GPUManager:
    """Manages GPU allocation and monitoring"""
    
    def __init__(self):
        try:
            pynvml.nvmlInit()
            self.gpu_count = pynvml.nvmlDeviceGetCount()
            self.available_gpus: Set[int] = set(range(self.gpu_count))
            self.allocated_gpus: Dict[int, str] = {}  # gpu_id -> job_id
            self._lock = asyncio.Lock()
            logging.info(f"Initialized GPU manager with {self.gpu_count} GPUs")
        except Exception as e:
            logging.error(f"Failed to initialize GPU manager: {e}")
            self.gpu_count = 0
            self.available_gpus = set()
            self.allocated_gpus = {}
            self._lock = asyncio.Lock()
    
    async def allocate_gpu(self, job_id: str) -> Optional[int]:
        """Allocate a GPU for a job"""
        async with self._lock:
            if not self.available_gpus:
                return None
            
            gpu_id = self.available_gpus.pop()
            self.allocated_gpus[gpu_id] = job_id
            logging.info(f"Allocated GPU {gpu_id} to job {job_id}")
            return gpu_id
    
    async def release_gpu(self, gpu_id: int, job_id: str):
        """Release a GPU after job completion"""
        async with self._lock:
            if gpu_id in self.allocated_gpus and self.allocated_gpus[gpu_id] == job_id:
                del self.allocated_gpus[gpu_id]
                self.available_gpus.add(gpu_id)
                logging.info(f"Released GPU {gpu_id} from job {job_id}")
    
    async def get_gpu_info(self) -> Dict[str, any]:
        """Get GPU utilization information"""
        gpu_info = {
            "total_gpus": self.gpu_count,
            "available_gpus": len(self.available_gpus),
            "allocated_gpus": len(self.allocated_gpus),
            "gpu_details": []
        }
        
        try:
            for i in range(self.gpu_count):
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                name = pynvml.nvmlDeviceGetName(handle)
                # Handle both string and bytes return types
                if isinstance(name, bytes):
                    name = name.decode()
                memory_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
                
                gpu_info["gpu_details"].append({
                    "gpu_id": i,
                    "name": name,
                    "memory_total": memory_info.total,
                    "memory_used": memory_info.used,
                    "memory_free": memory_info.free,
                    "utilization_gpu": utilization.gpu,
                    "utilization_memory": utilization.memory,
                    "allocated_to_job": self.allocated_gpus.get(i)
                })
        except Exception as e:
            logging.error(f"Error getting GPU info: {e}")
        
        return gpu_info


class JobManager:
    """Manages job lifecycle, queue, and storage"""
    
    def __init__(self, redis_url: str = "redis://redis:6379/0"):
        self.redis_url = redis_url
        self.redis_client = None
        self.gpu_manager = GPUManager()
        self.processing_jobs: Dict[str, asyncio.Task] = {}
        self.max_concurrent_jobs = int(os.getenv("MAX_CONCURRENT_JOBS", "2"))
        self.output_dir = os.getenv("OUTPUT_DIR", "/app/outputs")
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Job queue
        self.job_queue = asyncio.Queue()
        self.job_processor_task = None
        
    async def initialize(self):
        """Initialize Redis connection and start job processor"""
        try:
            self.redis_client = redis.from_url(self.redis_url, decode_responses=True)
            await self.redis_client.ping()
            logging.info("Connected to Redis")
        except Exception as e:
            logging.error(f"Failed to connect to Redis: {e}")
            # Fallback to in-memory storage
            self._jobs_storage = {}
        
        # Start job processor
        self.job_processor_task = asyncio.create_task(self._process_job_queue())
        logging.info("Job manager initialized")
    
    async def cleanup(self):
        """Cleanup resources"""
        if self.job_processor_task:
            self.job_processor_task.cancel()
        
        if self.redis_client:
            await self.redis_client.close()
    
    async def submit_job(self, request: VideoGenerationRequest) -> Job:
        """Submit a new video generation job"""
        job = Job(
            prompt=request.prompt,
            parameters=request,
            status=JobStatus.PENDING
        )
        
        await self._store_job(job)
        await self.job_queue.put(job.job_id)
        
        logging.info(f"Submitted job {job.job_id} with prompt: {request.prompt[:50]}...")
        return job
    
    async def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID"""
        try:
            if self.redis_client:
                job_data = await self.redis_client.hgetall(f"job:{job_id}")
                if job_data:
                    # Convert string values back to appropriate types
                    for key, value in job_data.items():
                        if key == "parameters" and value:
                            job_data[key] = json.loads(value)
                    return Job.from_dict(job_data)
            else:
                return self._jobs_storage.get(job_id)
        except Exception as e:
            logging.error(f"Error getting job {job_id}: {e}")
        
        return None
    
    async def list_jobs(self, page: int = 1, page_size: int = 10, 
                       status_filter: Optional[JobStatus] = None) -> JobListResponse:
        """List jobs with pagination and filtering"""
        try:
            if self.redis_client:
                # Get all job keys
                job_keys = await self.redis_client.keys("job:*")
                jobs = []
                
                for key in job_keys:
                    job_data = await self.redis_client.hgetall(key)
                    if job_data:
                        # Convert string values back to appropriate types
                        for k, v in job_data.items():
                            if k == "parameters" and v:
                                job_data[k] = json.loads(v)
                        job = Job.from_dict(job_data)
                        
                        # Apply status filter
                        if not status_filter or job.status == status_filter:
                            jobs.append(job)
                
                # Sort by created_at descending
                jobs.sort(key=lambda x: x.created_at, reverse=True)
                
            else:
                jobs = list(self._jobs_storage.values())
                if status_filter:
                    jobs = [job for job in jobs if job.status == status_filter]
                jobs.sort(key=lambda x: x.created_at, reverse=True)
            
            # Pagination
            total_count = len(jobs)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            page_jobs = jobs[start_idx:end_idx]
            
            total_pages = (total_count + page_size - 1) // page_size
            
            job_responses = [job.to_status_response() for job in page_jobs]
            
            return JobListResponse(
                jobs=job_responses,
                total_count=total_count,
                page=page,
                page_size=page_size,
                total_pages=total_pages
            )
            
        except Exception as e:
            logging.error(f"Error listing jobs: {e}")
            return JobListResponse(
                jobs=[],
                total_count=0,
                page=page,
                page_size=page_size,
                total_pages=0
            )
    
    async def get_system_status(self) -> SystemStatusResponse:
        """Get system status including GPU and job information"""
        gpu_info = await self.gpu_manager.get_gpu_info()
        
        # Count active jobs
        active_jobs = len(self.processing_jobs)
        queue_length = self.job_queue.qsize()
        
        # System load
        cpu_percent = psutil.cpu_percent()
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        system_load = {
            "cpu_percent": cpu_percent,
            "memory_percent": memory.percent,
            "memory_available_gb": memory.available / (1024**3),
            "disk_free_gb": disk.free / (1024**3),
            "gpu_info": gpu_info
        }
        
        return SystemStatusResponse(
            available_gpus=gpu_info["available_gpus"],
            active_jobs=active_jobs,
            queue_length=queue_length,
            system_load=system_load
        )
    
    async def _store_job(self, job: Job):
        """Store job in Redis or fallback storage"""
        try:
            if self.redis_client:
                job_data = job.to_dict()
                # Convert parameters to JSON string for Redis storage
                if job_data["parameters"]:
                    job_data["parameters"] = json.dumps(job_data["parameters"])
                
                await self.redis_client.hset(f"job:{job.job_id}", mapping=job_data)
            else:
                self._jobs_storage[job.job_id] = job
        except Exception as e:
            logging.error(f"Error storing job {job.job_id}: {e}")
    
    async def _update_job_status(self, job_id: str, status: JobStatus, 
                                progress: float = None, error_message: str = None,
                                output_path: str = None):
        """Update job status"""
        job = await self.get_job(job_id)
        if job:
            job.status = status
            if progress is not None:
                job.progress = progress
            if error_message:
                job.error_message = error_message
            if output_path:
                job.output_path = output_path
            
            if status == JobStatus.PROCESSING and not job.started_at:
                job.started_at = datetime.utcnow()
            elif status in [JobStatus.COMPLETED, JobStatus.FAILED]:
                job.completed_at = datetime.utcnow()
            
            await self._store_job(job)
    
    async def _process_job_queue(self):
        """Main job processing loop"""
        logging.info("Started job processor")
        
        while True:
            try:
                # Wait for job in queue
                job_id = await self.job_queue.get()
                
                # Check if we can process more jobs
                if len(self.processing_jobs) >= self.max_concurrent_jobs:
                    # Put job back in queue and wait
                    await self.job_queue.put(job_id)
                    await asyncio.sleep(1)
                    continue
                
                # Allocate GPU
                gpu_id = await self.gpu_manager.allocate_gpu(job_id)
                if gpu_id is None:
                    # No GPU available, put job back in queue
                    await self.job_queue.put(job_id)
                    await asyncio.sleep(1)
                    continue
                
                # Start job processing
                task = asyncio.create_task(self._process_single_job(job_id, gpu_id))
                self.processing_jobs[job_id] = task
                
                # Clean up completed tasks
                completed_jobs = [
                    jid for jid, task in self.processing_jobs.items() 
                    if task.done()
                ]
                for jid in completed_jobs:
                    del self.processing_jobs[jid]
                
            except asyncio.CancelledError:
                logging.info("Job processor cancelled")
                break
            except Exception as e:
                logging.error(f"Error in job processor: {e}")
                await asyncio.sleep(1)
    
    async def _process_single_job(self, job_id: str, gpu_id: int):
        """Process a single video generation job"""
        try:
            logging.info(f"Processing job {job_id} on GPU {gpu_id}")
            
            # Update job status to processing
            await self._update_job_status(job_id, JobStatus.PROCESSING)
            
            job = await self.get_job(job_id)
            if not job:
                logging.error(f"Job {job_id} not found")
                return
            
            # Import and use video generator
            from video_generator import VideoGenerator
            device = f"cuda:{gpu_id}"
            generator = VideoGenerator(device=device)
            
            # Generate video with progress callback
            async def progress_callback(current: int, total: int, message: str):
                progress = (current / total) * 100 if total > 0 else 0
                await self._update_job_status(job_id, JobStatus.PROCESSING, progress=progress)
            
            # Run video generation in executor since it's now synchronous
            loop = asyncio.get_event_loop()
            output_path = await loop.run_in_executor(
                None,
                lambda: generator.generate_video(
                    prompt=job.prompt,
                    negative_prompt=getattr(job.parameters, 'negative_prompt', ''),
                    num_frames=getattr(job.parameters, 'num_frames', 49),
                    height=getattr(job.parameters, 'height', 480),
                    width=getattr(job.parameters, 'width', 720),
                    num_inference_steps=getattr(job.parameters, 'num_inference_steps', 50),
                    guidance_scale=getattr(job.parameters, 'guidance_scale', 6.0),
                    seed=getattr(job.parameters, 'seed', None),
                    progress_callback=None  # Can't use async callback in executor
                )
            )
            
            # Check if video generation was successful
            if output_path and os.path.exists(output_path):
                # Update job as completed
                await self._update_job_status(
                    job_id, 
                    JobStatus.COMPLETED, 
                    progress=100.0, 
                    output_path=output_path
                )
                logging.info(f"Successfully completed job {job_id}: {output_path}")
            else:
                # Video generation failed
                raise RuntimeError("Video generation failed - no output file created")
            
            logging.info(f"Completed job {job_id}")
            
        except Exception as e:
            logging.error(f"Error processing job {job_id}: {e}")
            await self._update_job_status(
                job_id, 
                JobStatus.FAILED, 
                error_message=str(e)
            )
        finally:
            # Release GPU
            await self.gpu_manager.release_gpu(gpu_id, job_id)
    
    async def get_job_output_path(self, job_id: str) -> Optional[str]:
        """Get the output file path for a completed job"""
        job = await self.get_job(job_id)
        if job and job.status == JobStatus.COMPLETED and job.output_path:
            return job.output_path
        return None 