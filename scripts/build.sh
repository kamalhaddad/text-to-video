#!/bin/bash

# Build and deployment script for Text-to-Video API

set -e

# Configuration
REGISTRY=${REGISTRY:-"your-registry.com"}
PROJECT=${PROJECT:-"text-to-video"}
TAG=${TAG:-"latest"}
CONTEXT=${CONTEXT:-"."}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if logged into Docker registry
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi
    
    log "Prerequisites check passed"
}

# Function to build backend image
build_backend() {
    log "Building backend image..."
    
    cd backend
    docker build -t ${REGISTRY}/${PROJECT}/api:${TAG} .
    cd ..
    
    log "Backend image built successfully: ${REGISTRY}/${PROJECT}/api:${TAG}"
}

# Function to build frontend image
build_frontend() {
    log "Building frontend image..."
    
    cd frontend
    docker build -t ${REGISTRY}/${PROJECT}/frontend:${TAG} .
    cd ..
    
    log "Frontend image built successfully: ${REGISTRY}/${PROJECT}/frontend:${TAG}"
}

# Function to push images
push_images() {
    log "Pushing images to registry..."
    
    docker push ${REGISTRY}/${PROJECT}/api:${TAG}
    docker push ${REGISTRY}/${PROJECT}/frontend:${TAG}
    
    log "Images pushed successfully"
}

# Function to update Kubernetes manifests
update_manifests() {
    log "Updating Kubernetes manifests with new image tags..."
    
    # Update API deployment
    sed -i.bak "s|image: text-to-video-api:.*|image: ${REGISTRY}/${PROJECT}/api:${TAG}|g" k8s/api-deployment.yaml
    
    # Update frontend deployment
    sed -i.bak "s|image: text-to-video-frontend:.*|image: ${REGISTRY}/${PROJECT}/frontend:${TAG}|g" k8s/frontend-deployment.yaml
    
    # Remove backup files
    rm -f k8s/*.bak
    
    log "Kubernetes manifests updated"
}

# Function to deploy to Kubernetes
deploy() {
    log "Deploying to Kubernetes..."
    
    # Apply namespace first
    kubectl apply -f k8s/namespace.yaml
    
    # Apply configurations
    kubectl apply -f k8s/configmap.yaml
    kubectl apply -f k8s/persistent-volumes.yaml
    
    # Apply services
    kubectl apply -f k8s/redis.yaml
    
    # Apply applications
    kubectl apply -f k8s/api-deployment.yaml
    kubectl apply -f k8s/frontend-deployment.yaml
    
    # Apply networking
    kubectl apply -f k8s/ingress.yaml
    
    # Apply monitoring (optional)
    kubectl apply -f k8s/monitoring.yaml || warn "Monitoring resources failed to apply (may not be supported)"
    
    log "Deployment applied successfully"
    
    # Wait for rollout
    log "Waiting for deployments to be ready..."
    kubectl rollout status deployment/text-to-video-api -n text-to-video --timeout=600s
    kubectl rollout status deployment/text-to-video-frontend -n text-to-video --timeout=300s
    kubectl rollout status deployment/redis -n text-to-video --timeout=300s
    
    log "All deployments are ready"
}

# Function to show status
show_status() {
    log "Current deployment status:"
    
    echo ""
    echo "Pods:"
    kubectl get pods -n text-to-video
    
    echo ""
    echo "Services:"
    kubectl get services -n text-to-video
    
    echo ""
    echo "Ingress:"
    kubectl get ingress -n text-to-video
    
    echo ""
    echo "PVCs:"
    kubectl get pvc -n text-to-video
}

# Function to get logs
get_logs() {
    local component=${1:-"api"}
    log "Getting logs for $component..."
    
    case $component in
        "api")
            kubectl logs -l app=text-to-video-api -n text-to-video --tail=100 -f
            ;;
        "frontend")
            kubectl logs -l app=text-to-video-frontend -n text-to-video --tail=100 -f
            ;;
        "redis")
            kubectl logs -l app=redis -n text-to-video --tail=100 -f
            ;;
        *)
            error "Unknown component: $component. Use 'api', 'frontend', or 'redis'"
            exit 1
            ;;
    esac
}

# Function to cleanup
cleanup() {
    log "Cleaning up deployment..."
    
    kubectl delete namespace text-to-video || warn "Namespace may not exist"
    
    log "Cleanup completed"
}

# Function to port-forward for local access
port_forward() {
    log "Setting up port forwarding..."
    
    echo "Frontend will be available at: http://localhost:3000"
    echo "API will be available at: http://localhost:8000"
    echo "Press Ctrl+C to stop port forwarding"
    
    # Run port forwarding in background
    kubectl port-forward svc/text-to-video-frontend 3000:80 -n text-to-video &
    kubectl port-forward svc/text-to-video-api 8000:8000 -n text-to-video &
    
    # Wait for interrupt
    trap 'kill $(jobs -p)' EXIT
    wait
}

# Main function
main() {
    local command=${1:-"help"}
    
    case $command in
        "build")
            check_prerequisites
            build_backend
            build_frontend
            ;;
        "push")
            check_prerequisites
            push_images
            ;;
        "deploy")
            check_prerequisites
            update_manifests
            deploy
            ;;
        "full")
            check_prerequisites
            build_backend
            build_frontend
            push_images
            update_manifests
            deploy
            ;;
        "status")
            show_status
            ;;
        "logs")
            get_logs ${2:-"api"}
            ;;
        "port-forward")
            port_forward
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|*)
            echo "Usage: $0 {build|push|deploy|full|status|logs|port-forward|cleanup}"
            echo ""
            echo "Commands:"
            echo "  build       - Build Docker images"
            echo "  push        - Push images to registry"
            echo "  deploy      - Deploy to Kubernetes"
            echo "  full        - Build, push, and deploy"
            echo "  status      - Show deployment status"
            echo "  logs        - Show logs (specify component: api|frontend|redis)"
            echo "  port-forward - Set up local port forwarding"
            echo "  cleanup     - Remove all resources"
            echo ""
            echo "Environment variables:"
            echo "  REGISTRY    - Docker registry (default: your-registry.com)"
            echo "  PROJECT     - Project name (default: text-to-video)"
            echo "  TAG         - Image tag (default: latest)"
            echo ""
            echo "Examples:"
            echo "  $0 full                    # Build, push, and deploy"
            echo "  $0 logs api               # Show API logs"
            echo "  REGISTRY=myregistry.com $0 build  # Build with custom registry"
            ;;
    esac
}

# Run main function with all arguments
main "$@" 