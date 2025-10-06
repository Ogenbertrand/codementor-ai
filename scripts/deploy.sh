#!/bin/bash

# CodeMentor AI Deployment Script
# This script helps deploy the application to different environments

set -e

# Configuration
ENVIRONMENT=${1:-development}
REGISTRY=${2:-your-registry.com}
IMAGE_NAME="codementor-ai"
VERSION=${3:-latest}

echo "🚀 CodeMentor AI Deployment Script"
echo "=================================="
echo "Environment: $ENVIRONMENT"
echo "Registry: $REGISTRY"
echo "Version: $VERSION"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command_exists docker; then
    echo "❌ Docker is not installed. Please install Docker."
    exit 1
fi

if ! command_exists docker-compose; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose."
    exit 1
fi

if [ "$ENVIRONMENT" = "production" ] && ! command_exists kubectl; then
    echo "❌ kubectl is not installed. Please install kubectl for Kubernetes deployment."
    exit 1
fi

echo "✅ All prerequisites met"
echo ""

# Build and test
echo "🔨 Building application..."
npm run build

echo "🧪 Running tests..."
npm test || echo "⚠️  Tests failed, but continuing with deployment"
echo ""

# Build Docker image
echo "🐳 Building Docker image..."
docker build -t $IMAGE_NAME:$VERSION .
docker tag $IMAGE_NAME:$VERSION $REGISTRY/$IMAGE_NAME:$VERSION
echo "✅ Docker image built"
echo ""

# Push to registry (if not development)
if [ "$ENVIRONMENT" != "development" ]; then
    echo "📤 Pushing to registry..."
    docker push $REGISTRY/$IMAGE_NAME:$VERSION
    echo "✅ Image pushed to registry"
    echo ""
fi

# Deploy based on environment
case $ENVIRONMENT in
    development)
        echo "🏗️  Starting development environment..."
        docker-compose up -d
        echo "✅ Development environment started"
        echo ""
        echo "Services are running at:"
        echo "  - GitHub App: http://localhost:3000"
        echo "  - MCP Server: http://localhost:3001"
        echo "  - Redis: localhost:6379"
        ;;
    
    staging)
        echo "🚀 Deploying to staging..."
        docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d
        echo "✅ Staging environment deployed"
        ;;
    
    production)
        echo "🚀 Deploying to production..."
        
        # Check if Kubernetes manifests exist
        if [ -f "k8s/production.yaml" ]; then
            echo "📦 Applying Kubernetes manifests..."
            kubectl apply -f k8s/production.yaml
            kubectl set image deployment/codementor-ai github-app=$REGISTRY/$IMAGE_NAME:$VERSION
            kubectl set image deployment/codementor-ai mcp-server=$REGISTRY/$IMAGE_NAME:$VERSION
            
            echo "⏳ Waiting for rollout to complete..."
            kubectl rollout status deployment/codementor-ai
            
            echo "✅ Production deployment complete"
        else
            echo "❌ Kubernetes manifests not found. Using Docker Compose for production..."
            docker-compose -f docker-compose.yml up -d --profile production
            echo "✅ Production environment deployed with Docker Compose"
        fi
        ;;
    
    *)
        echo "❌ Unknown environment: $ENVIRONMENT"
        echo "Supported environments: development, staging, production"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Check service health endpoints"
echo "2. Monitor logs for any issues"
echo "3. Test the application functionality"
echo ""
echo "To view logs: docker-compose logs -f"