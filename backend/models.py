from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
import uuid


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class VideoGenerationRequest(BaseModel):
    prompt: str = Field(..., description="Text prompt for video generation", min_length=1, max_length=500)
    num_frames: int = Field(85, description="Number of frames to generate", ge=1, le=163)
    guidance_scale: float = Field(4.5, description="Guidance scale for generation", ge=1.0, le=20.0)
    num_inference_steps: int = Field(64, description="Number of inference steps", ge=10, le=100)
    fps: int = Field(30, description="Frames per second for output video", ge=1, le=60)
    width: int = Field(848, description="Video width", ge=256, le=1024)
    height: int = Field(480, description="Video height", ge=256, le=1024)
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")


class JobSubmissionResponse(BaseModel):
    job_id: str = Field(..., description="Unique job identifier")
    status: JobStatus = Field(..., description="Current job status")
    created_at: datetime = Field(..., description="Job creation timestamp")
    estimated_completion_time: Optional[int] = Field(None, description="Estimated completion time in seconds")


class JobStatusResponse(BaseModel):
    job_id: str = Field(..., description="Unique job identifier")
    status: JobStatus = Field(..., description="Current job status")
    created_at: datetime = Field(..., description="Job creation timestamp")
    started_at: Optional[datetime] = Field(None, description="Job start timestamp")
    completed_at: Optional[datetime] = Field(None, description="Job completion timestamp")
    progress: Optional[float] = Field(None, description="Job progress percentage (0-100)")
    error_message: Optional[str] = Field(None, description="Error message if job failed")
    output_url: Optional[str] = Field(None, description="URL to download generated video")
    parameters: VideoGenerationRequest = Field(..., description="Job parameters")


class JobListRequest(BaseModel):
    page: int = Field(1, description="Page number", ge=1)
    page_size: int = Field(10, description="Number of jobs per page", ge=1, le=100)
    status_filter: Optional[JobStatus] = Field(None, description="Filter jobs by status")


class JobListResponse(BaseModel):
    jobs: List[JobStatusResponse] = Field(..., description="List of jobs")
    total_count: int = Field(..., description="Total number of jobs")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Number of jobs per page")
    total_pages: int = Field(..., description="Total number of pages")


class SystemStatusResponse(BaseModel):
    available_gpus: int = Field(..., description="Number of available GPUs")
    active_jobs: int = Field(..., description="Number of currently processing jobs")
    queue_length: int = Field(..., description="Number of jobs in queue")
    system_load: Dict[str, Any] = Field(..., description="System resource utilization")


class Job:
    """Internal job representation"""
    
    def __init__(self, 
                 job_id: str = None,
                 prompt: str = None,
                 parameters: VideoGenerationRequest = None,
                 status: JobStatus = JobStatus.PENDING,
                 created_at: datetime = None,
                 started_at: datetime = None,
                 completed_at: datetime = None,
                 progress: float = 0.0,
                 error_message: str = None,
                 output_path: str = None,
                 gpu_id: int = None):
        
        self.job_id = job_id or str(uuid.uuid4())
        self.prompt = prompt
        self.parameters = parameters
        self.status = status
        self.created_at = created_at or datetime.utcnow()
        self.started_at = started_at
        self.completed_at = completed_at
        self.progress = progress
        self.error_message = error_message
        self.output_path = output_path
        self.gpu_id = gpu_id
    
    def to_dict(self) -> dict:
        """Convert job to dictionary for Redis storage"""
        data = {
            "job_id": self.job_id or "",
            "prompt": self.prompt or "",
            "status": self.status.value if self.status else JobStatus.PENDING.value,
            "progress": self.progress or 0.0,
        }
        
        # Add non-None values only
        if self.parameters:
            data["parameters"] = self.parameters.model_dump()
        if self.created_at:
            data["created_at"] = self.created_at.isoformat()
        if self.started_at:
            data["started_at"] = self.started_at.isoformat()
        if self.completed_at:
            data["completed_at"] = self.completed_at.isoformat()
        if self.error_message:
            data["error_message"] = self.error_message
        if self.output_path:
            data["output_path"] = self.output_path
        if self.gpu_id is not None:
            data["gpu_id"] = self.gpu_id
            
        return data
    
    @classmethod
    def from_dict(cls, data: dict) -> "Job":
        """Create job from dictionary stored in Redis"""
        job = cls()
        job.job_id = data.get("job_id")
        job.prompt = data.get("prompt")
        
        if data.get("parameters"):
            job.parameters = VideoGenerationRequest(**data["parameters"])
        
        job.status = JobStatus(data.get("status", JobStatus.PENDING))
        
        # Parse datetime strings
        if data.get("created_at"):
            job.created_at = datetime.fromisoformat(data["created_at"])
        if data.get("started_at"):
            job.started_at = datetime.fromisoformat(data["started_at"])
        if data.get("completed_at"):
            job.completed_at = datetime.fromisoformat(data["completed_at"])
            
        job.progress = data.get("progress", 0.0)
        job.error_message = data.get("error_message")
        job.output_path = data.get("output_path")
        job.gpu_id = data.get("gpu_id")
        
        return job
    
    def to_status_response(self, base_url: str = "") -> JobStatusResponse:
        """Convert job to API response"""
        output_url = None
        if self.status == JobStatus.COMPLETED and self.output_path:
            output_url = f"{base_url}/api/jobs/{self.job_id}/download"
        
        return JobStatusResponse(
            job_id=self.job_id,
            status=self.status,
            created_at=self.created_at,
            started_at=self.started_at,
            completed_at=self.completed_at,
            progress=self.progress,
            error_message=self.error_message,
            output_url=output_url,
            parameters=self.parameters
        ) 