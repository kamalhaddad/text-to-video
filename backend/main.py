import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

import aiofiles
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from job_manager import JobManager
from models import (
    JobListRequest, JobStatusResponse, JobSubmissionResponse,
    SystemStatusResponse, VideoGenerationRequest, JobStatus
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global job manager instance
job_manager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    global job_manager
    
    # Startup
    logger.info("Starting Text-to-Video API application...")
    
    # Initialize job manager
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    job_manager = JobManager(redis_url=redis_url)
    await job_manager.initialize()
    
    logger.info("Application startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down application...")
    if job_manager:
        await job_manager.cleanup()
    logger.info("Application shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Text-to-Video API",
    description="A scalable text-to-video generation API using genmo/mochi-1-preview",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files (for frontend)
if os.path.exists("/app/frontend/build"):
    app.mount("/static", StaticFiles(directory="/app/frontend/build/static"), name="static")


@app.get("/", response_class=JSONResponse)
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Text-to-Video API",
        "version": "1.0.0",
        "model": "genmo/mochi-1-preview",
        "endpoints": {
            "submit_job": "/api/jobs/submit",
            "job_status": "/api/jobs/{job_id}/status",
            "list_jobs": "/api/jobs/list",
            "download_video": "/api/jobs/{job_id}/download",
            "system_status": "/api/system/status"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Check if job manager is healthy
        if job_manager is None:
            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "error": "Job manager not initialized"}
            )
        
        # Get basic system status
        system_status = await job_manager.get_system_status()
        
        return {
            "status": "healthy",
            "available_gpus": system_status.available_gpus,
            "active_jobs": system_status.active_jobs,
            "queue_length": system_status.queue_length
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )


@app.post("/api/jobs/submit", response_model=JobSubmissionResponse)
async def submit_job(request: VideoGenerationRequest):
    """Submit a new video generation job"""
    try:
        logger.info(f"Received job submission: {request.prompt[:50]}...")
        
        if job_manager is None:
            raise HTTPException(status_code=503, detail="Service not available")
        
        # Submit job
        job = await job_manager.submit_job(request)
        
        return JobSubmissionResponse(
            job_id=job.job_id,
            status=job.status,
            created_at=job.created_at,
            estimated_completion_time=300  # Estimate 5 minutes
        )
        
    except Exception as e:
        logger.error(f"Error submitting job: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit job: {str(e)}")


@app.get("/api/jobs/{job_id}/status", response_model=JobStatusResponse)
async def get_job_status(job_id: str, request: Request):
    """Get the status of a specific job"""
    try:
        if job_manager is None:
            raise HTTPException(status_code=503, detail="Service not available")
        
        job = await job_manager.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Get base URL for download links
        base_url = f"{request.url.scheme}://{request.url.netloc}"
        
        return job.to_status_response(base_url)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job status for {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get job status: {str(e)}")


@app.get("/api/jobs/list")
async def list_jobs(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=100, description="Jobs per page"),
    status_filter: Optional[JobStatus] = Query(None, description="Filter by job status"),
    request: Request = None
):
    """List all jobs with pagination and filtering"""
    try:
        if job_manager is None:
            raise HTTPException(status_code=503, detail="Service not available")
        
        result = await job_manager.list_jobs(
            page=page,
            page_size=page_size,
            status_filter=status_filter
        )
        
        # Add base URL to job responses for download links
        if request:
            base_url = f"{request.url.scheme}://{request.url.netloc}"
            for job in result.jobs:
                if job.status == JobStatus.COMPLETED and job.job_id:
                    job.output_url = f"{base_url}/api/jobs/{job.job_id}/download"
        
        return result
        
    except Exception as e:
        logger.error(f"Error listing jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list jobs: {str(e)}")


@app.get("/api/jobs/{job_id}/download")
async def download_video(job_id: str):
    """Download the generated video for a completed job"""
    try:
        if job_manager is None:
            raise HTTPException(status_code=503, detail="Service not available")
        
        # Get job and check status
        job = await job_manager.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        
        if job.status != JobStatus.COMPLETED:
            raise HTTPException(
                status_code=400, 
                detail=f"Job is not completed. Current status: {job.status}"
            )
        
        if not job.output_path or not os.path.exists(job.output_path):
            raise HTTPException(status_code=404, detail="Video file not found")
        
        # Return file
        filename = os.path.basename(job.output_path)
        return FileResponse(
            job.output_path,
            media_type="video/mp4",
            filename=filename,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading video for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download video: {str(e)}")


@app.get("/api/system/status", response_model=SystemStatusResponse)
async def get_system_status():
    """Get system status including GPU and job information"""
    try:
        if job_manager is None:
            raise HTTPException(status_code=503, detail="Service not available")
        
        return await job_manager.get_system_status()
        
    except Exception as e:
        logger.error(f"Error getting system status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get system status: {str(e)}")


@app.delete("/api/jobs/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a pending or processing job"""
    try:
        if job_manager is None:
            raise HTTPException(status_code=503, detail="Service not available")
        
        job = await job_manager.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        
        if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel job with status: {job.status}"
            )
        
        # Update job status to failed (cancellation)
        await job_manager._update_job_status(
            job_id, 
            JobStatus.FAILED, 
            error_message="Job cancelled by user"
        )
        
        return {"message": f"Job {job_id} cancelled successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel job: {str(e)}")


# Serve frontend (if available)
@app.get("/app")
async def serve_frontend():
    """Serve the frontend application"""
    frontend_path = "/app/frontend/build/index.html"
    if os.path.exists(frontend_path):
        return FileResponse(frontend_path, media_type="text/html")
    else:
        return JSONResponse(
            status_code=404,
            content={"message": "Frontend not available"}
        )


# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    
    # Configuration
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WORKERS", "1"))
    
    # Run the application
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        workers=workers,
        log_level="info",
        access_log=True
    ) 