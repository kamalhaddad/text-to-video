# Text-to-Video API System

A scalable text-to-video generation API built with the genmo/mochi-1-preview model, designed for Kubernetes deployment with multi-GPU support.

## System Architecture

- **Backend API**: FastAPI-based asynchronous job management system
- **Video Generation**: Integration with genmo/mochi-1-preview model
- **Frontend**: React-based user interface
- **Deployment**: Kubernetes with multi-GPU support
- **Storage**: Persistent volumes for model cache and generated videos

## Features

### API Endpoints
- `POST /api/jobs/submit` - Submit video generation job
- `GET /api/jobs/{job_id}/status` - Get job status
- `GET /api/jobs/list` - List all jobs with pagination
- `GET /api/jobs/{job_id}/download` - Download generated video

### System Capabilities
- Asynchronous job processing
- Multi-GPU concurrent video generation
- Job status tracking and management
- High availability with multiple replicas
- Automatic resource allocation

## Quick Start

### Prerequisites
- Kubernetes cluster with GPU nodes
- kubectl configured
- Docker installed
- At least 2 GPUs per replica (4 GPUs minimum for 2 replicas)

### Deployment

1. **Deploy the application**:
```bash
kubectl apply -f k8s/
```

2. **Check deployment status**:
```bash
kubectl get pods -l app=text-to-video-api
kubectl get services
```

3. **Access the application**:
- API: `http://<cluster-ip>:8000`
- Frontend: `http://<cluster-ip>:3000`

### Local Development

1. **Install dependencies**:
```bash
cd backend
pip install -r requirements.txt
```

2. **Run the backend**:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

3. **Run the frontend**:
```bash
cd frontend
npm install
npm start
```

## Configuration

### Environment Variables
- `MODEL_CACHE_DIR`: Directory for model caching (default: `/app/model_cache`)
- `OUTPUT_DIR`: Directory for generated videos (default: `/app/outputs`)
- `MAX_CONCURRENT_JOBS`: Maximum concurrent jobs per replica (default: 2)
- `REDIS_URL`: Redis connection string for job queue

### GPU Requirements
- Minimum 2 GPUs per replica
- Each job uses 1 GPU
- Model requires approximately 12GB VRAM
- Recommended: H100 or A100 GPUs

## API Usage Examples

### Submit a job
```bash
curl -X POST "http://localhost:8000/api/jobs/submit" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A cat walking in a garden", "num_frames": 84}'
```

### Check job status
```bash
curl "http://localhost:8000/api/jobs/{job_id}/status"
```

### Download video
```bash
curl "http://localhost:8000/api/jobs/{job_id}/download" -o video.mp4
```

## Monitoring and Logging

- Application logs available via `kubectl logs`
- GPU utilization monitoring through Kubernetes metrics
- Job status and performance metrics in application logs

## Troubleshooting

### Common Issues
1. **GPU allocation errors**: Ensure sufficient GPU resources are available
2. **Model download timeout**: Increase timeout values for initial model download
3. **Storage issues**: Verify persistent volumes are properly mounted

### Scaling
- Horizontal: Increase replicas in deployment.yaml
- Vertical: Adjust GPU allocation per replica
- Storage: Expand persistent volume sizes as needed 