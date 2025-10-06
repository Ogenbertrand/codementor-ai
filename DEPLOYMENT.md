# CodeMentor AI Deployment Guide

This guide provides detailed instructions for deploying CodeMentor AI to various environments.

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Kubernetes cluster (for production)
- Domain name with SSL certificate
- GitHub App configured
- Environment variables set

### Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Run setup script
./scripts/setup.sh

# Deploy to development
./scripts/deploy.sh development
```

## 🏗️ Deployment Options

### 1. Development (Docker Compose)

Perfect for local development and testing.

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Services:**
- GitHub App: http://localhost:3000
- MCP Server: http://localhost:3001
- Redis: localhost:6379

### 2. Staging (Docker Compose with overrides)

For testing in a staging environment.

```bash
# Deploy to staging
docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d
```

### 3. Production (Kubernetes)

For scalable, production deployment.

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets (update with your values first)
kubectl apply -f k8s/secrets.yaml

# Deploy Redis
kubectl apply -f k8s/redis.yaml

# Deploy GitHub App
kubectl apply -f k8s/github-app.yaml

# Deploy MCP Server
kubectl apply -f k8s/mcp-server.yaml

# Deploy Ingress
kubectl apply -f k8s/ingress.yaml
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_APP_ID` | GitHub App ID | ✅ |
| `GITHUB_PRIVATE_KEY` | GitHub App private key | ✅ |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret | ✅ |
| `OPENAI_API_KEY` | OpenAI API key | ✅ |
| `PINECONE_API_KEY` | Pinecone API key | ❌ |
| `JWT_SECRET` | JWT signing secret | ✅ |
| `MCP_API_KEY` | API key for MCP server | ✅ |
| `REDIS_URL` | Redis connection URL | ❌ |

### GitHub App Setup

1. Go to [GitHub App Settings](https://github.com/settings/apps)
2. Create new app with:
   - **Name**: CodeMentor AI
   - **Homepage URL**: `https://your-domain.com`
   - **Webhook URL**: `https://your-domain.com/webhook`
   - **Permissions**:
     - Pull requests: Read & Write
     - Issues: Read & Write
     - Contents: Read
   - **Events**: Pull requests, Issue comments

3. Install app on repositories
4. Download private key

### SSL Certificate

For production, use Let's Encrypt with cert-manager:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

# Create cluster issuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## 📊 Monitoring

### Health Checks

- GitHub App: `GET /health`
- MCP Server: `GET /health`
- Redis: `redis-cli ping`

### Logging

View logs using:

```bash
# Docker Compose
docker-compose logs -f [service-name]

# Kubernetes
kubectl logs -f deployment/github-app -n codementor-ai
kubectl logs -f deployment/mcp-server -n codementor-ai
```

### Metrics

Key metrics to monitor:
- Review generation time
- API response times
- Error rates
- Memory usage
- CPU utilization

## 🔒 Security

### Best Practices

1. **Secrets Management**
   - Use Kubernetes secrets
   - Rotate keys regularly
   - Never commit secrets to git

2. **Network Security**
   - Use HTTPS only
   - Implement rate limiting
   - Restrict IP access

3. **Container Security**
   - Use non-root users
   - Scan images for vulnerabilities
   - Keep dependencies updated

### RBAC Configuration

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: codementor-ai
  name: codementor-ai-role
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps"]
  verbs: ["get", "list", "watch"]
```

## 🚀 Scaling

### Horizontal Pod Autoscaler

The deployment includes HPA configuration:

```yaml
minReplicas: 2
maxReplicas: 10
targetCPUUtilization: 70%
```

### Vertical Scaling

Adjust resource requests/limits based on usage:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "200m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Build and test
      run: |
        npm install
        npm run build
        npm test
    
    - name: Build Docker image
      run: |
        docker build -t $REGISTRY/codementor-ai:$GITHUB_SHA .
        docker push $REGISTRY/codementor-ai:$GITHUB_SHA
    
    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/github-app \
          github-app=$REGISTRY/codementor-ai:$GITHUB_SHA
```

## 🛠️ Troubleshooting

### Common Issues

1. **Pod not starting**
   ```bash
   kubectl describe pod <pod-name> -n codementor-ai
   kubectl logs <pod-name> -n codementor-ai
   ```

2. **Service not accessible**
   ```bash
   kubectl get services -n codementor-ai
   kubectl get ingress -n codementor-ai
   ```

3. **High memory usage**
   - Check for memory leaks
   - Increase memory limits
   - Implement caching

4. **Slow response times**
   - Check Redis connectivity
   - Optimize database queries
   - Scale horizontally

### Debugging Commands

```bash
# Check pod status
kubectl get pods -n codementor-ai

# Check service endpoints
kubectl get endpoints -n codementor-ai

# Port forwarding for local testing
kubectl port-forward service/github-app 3000:80 -n codementor-ai
kubectl port-forward service/mcp-server 3001:80 -n codementor-ai

# Execute into pod
kubectl exec -it <pod-name> -n codementor-ai -- /bin/sh
```

## 📋 Maintenance

### Regular Tasks

1. **Update dependencies**
   ```bash
   npm update
   npm audit fix
   ```

2. **Rotate secrets**
   - Update GitHub App private key
   - Rotate API keys
   - Update JWT secrets

3. **Monitor performance**
   - Review resource usage
   - Optimize slow queries
   - Scale as needed

4. **Security updates**
   - Update base images
   - Patch vulnerabilities
   - Review access logs

### Backup Strategy

```bash
# Backup Redis data
kubectl exec -it redis-0 -n codementor-ai -- redis-cli BGSAVE

# Backup configuration
kubectl get configmaps -n codementor-ai -o yaml > config-backup.yaml
kubectl get secrets -n codementor-ai -o yaml > secrets-backup.yaml
```

## 🎯 Performance Optimization

### Database Optimization

1. **Redis optimization**
   ```yaml
   redis:
     command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
   ```

2. **Connection pooling**
   - Use connection pools for Redis
   - Implement circuit breakers
   - Set appropriate timeouts

### Application Optimization

1. **Caching strategy**
   - Cache AI responses
   - Cache GitHub API responses
   - Use Redis for session storage

2. **Request optimization**
   - Implement request batching
   - Use compression
   - Optimize images

## 📞 Support

For deployment issues:
1. Check logs first
2. Review configuration
3. Test connectivity
4. Contact support team

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [GitHub Apps Documentation](https://docs.github.com/en/developers/apps)
- [VS Code Extension API](https://code.visualstudio.com/api)

---

**Happy deploying! 🚀**