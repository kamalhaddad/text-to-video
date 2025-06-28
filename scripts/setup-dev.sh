#!/bin/bash

# Development setup script for Text-to-Video API

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    log "Checking prerequisites for development setup..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check Node.js (for frontend development)
    if ! command -v node &> /dev/null; then
        warn "Node.js is not installed. Frontend development will require Node.js."
    fi
    
    # Check Python (for backend development)
    if ! command -v python3 &> /dev/null; then
        warn "Python 3 is not installed. Backend development will require Python 3."
    fi
    
    # Check nvidia-docker for GPU support
    if command -v nvidia-docker &> /dev/null || docker info 2>/dev/null | grep -q nvidia; then
        log "NVIDIA Docker support detected"
    else
        warn "NVIDIA Docker support not detected. GPU acceleration will not be available."
    fi
    
    log "Prerequisites check completed"
}

# Function to setup backend development environment
setup_backend() {
    log "Setting up backend development environment..."
    
    cd backend
    
    # Create virtual environment
    if [ ! -d "venv" ]; then
        log "Creating Python virtual environment..."
        python3 -m venv venv
    fi
    
    # Activate virtual environment and install dependencies
    log "Installing Python dependencies..."
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    
    cd ..
    
    log "Backend development environment setup completed"
    info "To activate the backend environment: cd backend && source venv/bin/activate"
}

# Function to setup frontend development environment
setup_frontend() {
    log "Setting up frontend development environment..."
    
    cd frontend
    
    # Install Node.js dependencies
    if command -v npm &> /dev/null; then
        log "Installing Node.js dependencies..."
        npm install
    else
        warn "npm not found. Please install Node.js to set up frontend development environment."
    fi
    
    cd ..
    
    log "Frontend development environment setup completed"
    info "To start frontend development server: cd frontend && npm start"
}

# Function to start development services
start_services() {
    log "Starting development services with Docker Compose..."
    
    # Create required directories
    mkdir -p volumes/model_cache
    mkdir -p volumes/video_outputs
    mkdir -p volumes/redis_data
    
    # Start services
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d redis
        log "Redis started. Starting API service..."
        docker-compose up -d api
        log "API started. Starting frontend service..."
        docker-compose up -d frontend
    else
        docker compose up -d redis
        log "Redis started. Starting API service..."
        docker compose up -d api
        log "API started. Starting frontend service..."
        docker compose up -d frontend
    fi
    
    log "All services started successfully"
    
    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 10
    
    # Check service health
    check_services
}

# Function to check service health
check_services() {
    log "Checking service health..."
    
    # Check Redis
    if docker ps | grep -q text-to-video-redis; then
        log "✓ Redis is running"
    else
        error "✗ Redis is not running"
    fi
    
    # Check API
    if curl -f http://localhost:8000/health &> /dev/null; then
        log "✓ API is healthy and responding"
    else
        warn "✗ API is not responding (may still be starting up)"
    fi
    
    # Check Frontend
    if curl -f http://localhost:3000 &> /dev/null; then
        log "✓ Frontend is responding"
    else
        warn "✗ Frontend is not responding"
    fi
}

# Function to show service status
show_status() {
    log "Current service status:"
    
    if command -v docker-compose &> /dev/null; then
        docker-compose ps
    else
        docker compose ps
    fi
    
    echo ""
    log "Service URLs:"
    info "Frontend: http://localhost:3000"
    info "API: http://localhost:8000"
    info "API Documentation: http://localhost:8000/docs"
    info "Redis: localhost:6379"
}

# Function to show logs
show_logs() {
    local service=${1:-"all"}
    
    if command -v docker-compose &> /dev/null; then
        if [ "$service" = "all" ]; then
            docker-compose logs -f
        else
            docker-compose logs -f $service
        fi
    else
        if [ "$service" = "all" ]; then
            docker compose logs -f
        else
            docker compose logs -f $service
        fi
    fi
}

# Function to stop services
stop_services() {
    log "Stopping development services..."
    
    if command -v docker-compose &> /dev/null; then
        docker-compose down
    else
        docker compose down
    fi
    
    log "All services stopped"
}

# Function to cleanup
cleanup() {
    log "Cleaning up development environment..."
    
    # Stop and remove containers
    if command -v docker-compose &> /dev/null; then
        docker-compose down -v --remove-orphans
    else
        docker compose down -v --remove-orphans
    fi
    
    # Remove unused Docker resources
    docker system prune -f
    
    log "Cleanup completed"
}

# Function to run tests
run_tests() {
    log "Running tests..."
    
    # Backend tests
    if [ -f "backend/requirements-test.txt" ]; then
        log "Running backend tests..."
        cd backend
        source venv/bin/activate
        python -m pytest tests/ -v
        cd ..
    fi
    
    # Frontend tests
    if [ -f "frontend/package.json" ]; then
        log "Running frontend tests..."
        cd frontend
        if command -v npm &> /dev/null; then
            npm test -- --watchAll=false
        fi
        cd ..
    fi
    
    log "Tests completed"
}

# Main function
main() {
    local command=${1:-"help"}
    
    case $command in
        "check")
            check_prerequisites
            ;;
        "setup")
            check_prerequisites
            setup_backend
            setup_frontend
            ;;
        "start")
            start_services
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs ${2:-"all"}
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            stop_services
            start_services
            ;;
        "cleanup")
            cleanup
            ;;
        "test")
            run_tests
            ;;
        "full")
            check_prerequisites
            setup_backend
            setup_frontend
            start_services
            show_status
            ;;
        "help"|*)
            echo "Text-to-Video API Development Setup"
            echo ""
            echo "Usage: $0 {command}"
            echo ""
            echo "Commands:"
            echo "  check      - Check prerequisites"
            echo "  setup      - Setup development environments"
            echo "  start      - Start development services"
            echo "  status     - Show service status and URLs"
            echo "  logs       - Show logs (specify service: redis|api|frontend|all)"
            echo "  stop       - Stop development services"
            echo "  restart    - Restart development services"
            echo "  test       - Run tests"
            echo "  cleanup    - Clean up containers and volumes"
            echo "  full       - Complete setup and start"
            echo ""
            echo "Examples:"
            echo "  $0 full                 # Complete setup and start all services"
            echo "  $0 logs api            # Show API logs"
            echo "  $0 status              # Show current status"
            echo ""
            echo "Quick Start:"
            echo "  1. Run: $0 full"
            echo "  2. Open: http://localhost:3000"
            echo "  3. API docs: http://localhost:8000/docs"
            ;;
    esac
}

# Run main function with all arguments
main "$@" 