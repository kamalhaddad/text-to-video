# Text-to-Video API Deployment Guide

This guide provides step-by-step instructions for deploying the Text-to-Video API system using the genmo/mochi-1-preview model on Kubernetes with GPU support.

## System Overview

The system consists of:
- **Backend API**: FastAPI-based service with asynchronous job management
- **Frontend UI**: React-based user interface
- **Redis**: Job queue and caching
- **GPU Integration**: Multi-GPU support with automatic allocation
- **Kubernetes Deployment**: Scalable container orchestration

## Prerequisites

### Hardware Requirements
- **Minimum**: 2 x H100 GPUs (or equivalent)
- **Recommended**: 8 x H100 GPUs for full capacity
- **Memory**: 32GB+ RAM per GPU node
- **Storage**: 1TB+ NVMe storage
- **Network**: High-bandwidth internet for model downloads

### Software Requirements
- Kubernetes cluster with GPU nodes
- kubectl configured
- Docker with GPU support (nvidia-docker)
- Container registry access
- Ingress controller (nginx recommended)

### GPU Node Configuration
Ensure your Kubernetes GPU nodes have:
```bash
# NVIDIA GPU Operator installed
kubectl get pods -n gpu-operator

# GPU resources available
kubectl describe nodes | grep nvidia.com/gpu
```

## Quick Deployment

### Option 1: Production Deployment

1. **Configure Registry**:
```bash
export REGISTRY="your-registry.com"
export PROJECT="text-to-video"
export TAG="v1.0.0"
```

2. **Build and Deploy**:
```bash
./scripts/build.sh full
```

3. **Verify Deployment**:
```bash
kubectl get pods -n text-to-video
kubectl get services -n text-to-video
```

### Option 2: Local Development

1. **Setup Development Environment**:
```bash
./scripts/setup-dev.sh full
```

2. **Access Services**:
- Frontend: http://localhost:3000
- API: http://localhost:8000/docs
- System Status: http://localhost:8000/api/system/status

## Detailed Deployment Steps

### Step 1: Prepare Environment

1. **Clone Repository**:
```bash
git clone <repository-url>
cd text-to-video
```

2. **Configure Environment**:
```bash
# Set your container registry
export REGISTRY="your-registry.com"
export PROJECT="text-to-video"
export TAG="latest"

# Configure storage class (adjust for your cluster)
sed -i 's/storageClassName: fast-ssd/storageClassName: your-storage-class/g' k8s/persistent-volumes.yaml
```

### Step 2: Build Container Images

1. **Build Backend**:
```bash
cd backend
docker build -t ${REGISTRY}/${PROJECT}/api:${TAG} .
cd ..
```

2. **Build Frontend**:
```bash
cd frontend
docker build -t ${REGISTRY}/${PROJECT}/frontend:${TAG} .
cd ..
```

3. **Push Images**:
```bash
docker push ${REGISTRY}/${PROJECT}/api:${TAG}
docker push ${REGISTRY}/${PROJECT}/frontend:${TAG}
```

### Step 3: Deploy to Kubernetes

1. **Create Namespace**:
```bash
kubectl apply -f k8s/namespace.yaml
```

2. **Deploy Storage**:
```bash
kubectl apply -f k8s/persistent-volumes.yaml
kubectl apply -f k8s/configmap.yaml
```

3. **Deploy Services**:
```bash
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
```

4. **Configure Networking**:
```bash
kubectl apply -f k8s/ingress.yaml
```

5. **Enable Monitoring** (optional):
```bash
kubectl apply -f k8s/monitoring.yaml
```

### Step 4: Verify Deployment

1. **Check Pod Status**:
```bash
kubectl get pods -n text-to-video
kubectl describe pods -l app=text-to-video-api -n text-to-video
```

2. **Check GPU Allocation**:
```bash
kubectl describe nodes | grep -A 5 "Allocated resources"
```

3. **Test API Health**:
```bash
kubectl port-forward svc/text-to-video-api 8000:8000 -n text-to-video &
curl http://localhost:8000/health
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | `redis://redis:6379/0` |
| `MAX_CONCURRENT_JOBS` | Max concurrent video generations | `2` |
| `MODEL_CACHE_DIR` | Model cache directory | `/app/model_cache` |
| `OUTPUT_DIR` | Video output directory | `/app/outputs` |

### GPU Configuration

**Per Replica Requirements**:
- Minimum: 2 GPUs
- Memory: 12GB VRAM per job
- Recommended: H100 or A100 GPUs

**Scaling Configuration**:
```yaml
# Current configuration supports:
replicas: 2          # 2 API replicas
gpu_per_replica: 2   # 2 GPUs per replica
max_jobs_per_gpu: 1  # 1 job per GPU
# Total capacity: 4 concurrent video generations
```

### Storage Configuration

Adjust storage requirements based on usage:

```yaml
# Model cache (stores Mochi model)
model-cache-pvc: 50Gi

# Video outputs (stores generated videos)
video-outputs-pvc: 200Gi

# Redis data (job queue and metadata)
redis-data-pvc: 10Gi
```

## Scaling

### Horizontal Scaling

1. **Scale API Replicas**:
```bash
kubectl scale deployment text-to-video-api --replicas=4 -n text-to-video
```

2. **Scale Frontend Replicas**:
```bash
kubectl scale deployment text-to-video-frontend --replicas=3 -n text-to-video
```

### Vertical Scaling

Adjust resource requests/limits in `k8s/api-deployment.yaml`:
```yaml
resources:
  requests:
    memory: "32Gi"  # Increase memory
    cpu: "8"        # Increase CPU
    nvidia.com/gpu: 4  # Increase GPUs
```

## Monitoring and Troubleshooting

### Health Checks

1. **API Health**:
```bash
curl http://<ingress-ip>/health
```

2. **System Status**:
```bash
curl http://<ingress-ip>/api/system/status
```

### Logs

1. **API Logs**:
```bash
kubectl logs -f deployment/text-to-video-api -n text-to-video
```

2. **Frontend Logs**:
```bash
kubectl logs -f deployment/text-to-video-frontend -n text-to-video
```

3. **Redis Logs**:
```bash
kubectl logs -f deployment/redis -n text-to-video
```

### Common Issues

**GPU Not Available**:
```bash
# Check GPU operator
kubectl get pods -n gpu-operator

# Check node GPU status
kubectl describe nodes | grep nvidia.com/gpu
```

**Model Download Timeout**:
```bash
# Check internet connectivity from pods
kubectl exec -it <api-pod> -n text-to-video -- curl -I https://huggingface.co

# Increase startup probe timeout
kubectl patch deployment text-to-video-api -n text-to-video -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","startupProbe":{"failureThreshold":60}}]}}}}'
```

**Storage Issues**:
```bash
# Check PVC status
kubectl get pvc -n text-to-video

# Check storage class
kubectl get storageclass
```

## Performance Optimization

### Model Loading

1. **Pre-load Models**:
```bash
# Use init container to pre-download models
kubectl apply -f k8s/patches/preload-models.yaml
```

2. **Shared Model Cache**:
Ensure `model-cache-pvc` uses `ReadWriteMany` for sharing across replicas.

### Network Optimization

1. **Use CDN** for frontend assets
2. **Enable compression** in nginx ingress
3. **Configure proper timeouts** for long-running video generation

### GPU Optimization

1. **GPU Affinity**: Ensure pods with GPU requirements are scheduled on GPU nodes
2. **Resource Limits**: Set appropriate GPU memory limits
3. **Batch Processing**: Configure optimal batch sizes for video generation

## Security Considerations

### Network Policies

Network policies are included to restrict traffic between components:
```bash
kubectl get networkpolicies -n text-to-video
```

### RBAC

Implement proper RBAC for service accounts:
```bash
kubectl apply -f k8s/rbac.yaml
```

### Secrets Management

For production, use Kubernetes secrets for sensitive data:
```bash
kubectl create secret generic text-to-video-secrets \
  --from-literal=redis-password=<password> \
  -n text-to-video
```

## Backup and Recovery

### Data Backup

1. **Model Cache**: Backup shared model cache
2. **Video Outputs**: Implement retention policies
3. **Redis Data**: Regular Redis snapshots

### Disaster Recovery

1. **Multi-zone Deployment**: Deploy across availability zones
2. **Persistent Volume Snapshots**: Regular storage snapshots
3. **Configuration Backup**: Version control all K8s manifests

## Maintenance

### Updates

1. **Rolling Updates**:
```bash
# Update image tag
kubectl set image deployment/text-to-video-api api=new-image:tag -n text-to-video

# Monitor rollout
kubectl rollout status deployment/text-to-video-api -n text-to-video
```

2. **Rollback**:
```bash
kubectl rollout undo deployment/text-to-video-api -n text-to-video
```

### Cleanup

```bash
# Remove all resources
kubectl delete namespace text-to-video

# Or use the cleanup script
./scripts/build.sh cleanup
```

## Support

For issues and support:
1. Check logs using the provided commands
2. Verify resource allocation and GPU availability
3. Review the troubleshooting section
4. Consult the API documentation at `/docs` endpoint

## Performance Metrics

Expected performance with recommended hardware:
- **Video Generation Time**: 5-8 minutes per video
- **Concurrent Jobs**: 4-8 (depending on GPU count)
- **Throughput**: ~10-15 videos per hour
- **Model Loading Time**: 2-3 minutes (first time)
- **API Response Time**: <100ms (excluding video generation)