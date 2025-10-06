# CodeMentor AI

An LLM-powered code review tool that provides expert-level code reviews on GitHub Pull Requests with seamless VS Code integration.

## 🚀 Features

- **AI-Powered Code Reviews**: Advanced code analysis using OpenAI GPT-4o
- **GitHub Integration**: Automatic reviews on PR events (opened, synchronized, reopened)
- **RAG Context**: Repository-aware reviews using vector embeddings
- **VS Code Extension**: Real-time comment display and fix application
- **Multi-language Support**: Supports TypeScript, JavaScript, Python, Java, C++, and more
- **Configurable Severity Levels**: Critical, Error, Warning, and Info categories
- **Auto-fix Suggestions**: AI-generated code fixes with one-click application

## 📋 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   GitHub App    │    │   MCP Server    │    │ VS Code Extension│
│   (Webhook)     │◄──►│ (Protocol API)  │◄──►│   (Client)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Service    │    │  Vector DB      │    │  GitHub API     │
│   (OpenAI)      │    │  (Pinecone)     │    │  (Octokit)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Components

1. **GitHub App** (`/github-app`): Webhook server that listens for PR events
2. **MCP Server** (`/mcp-server`): Model Context Protocol implementation for VS Code communication
3. **VS Code Extension** (`/vscode-extension`): Client for displaying comments and applying fixes
4. **Shared Types** (`/shared`): Common types and utilities

## 🛠️ Installation

### Prerequisites

- Node.js 20+ and npm 10+
- GitHub Personal Access Token with repo permissions
- OpenAI API key
- Redis (optional, for caching)
- Pinecone account (optional, for vector DB)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/codementor-ai.git
cd codementor-ai
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build All Components

```bash
npm run build
```

### 4. Configure Environment Variables

Create `.env` files in each component directory:

#### GitHub App Configuration

```bash
# github-app/.env
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nyour_private_key\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX=codementor-ai
REDIS_URL=redis://localhost:6379
PORT=3000
```

#### MCP Server Configuration

```bash
# mcp-server/.env
MCP_PORT=3001
JWT_SECRET=your_jwt_secret
MCP_API_KEY=your_api_key
GITHUB_TOKEN=your_github_token
REDIS_URL=redis://localhost:6379
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

#### VS Code Extension Configuration

Configure through VS Code settings:

```json
{
  "codementor-ai.serverUrl": "http://localhost:3001",
  "codementor-ai.apiKey": "your_api_key",
  "codementor-ai.gitHubToken": "your_github_token",
  "codementor-ai.autoRefresh": true,
  "codementor-ai.refreshInterval": 30
}
```

### 5. Set Up GitHub App

1. Go to [GitHub App Settings](https://github.com/settings/apps)
2. Create a new GitHub App with:
   - **Name**: CodeMentor AI
   - **Homepage URL**: Your app URL
   - **Webhook URL**: `https://your-domain.com/webhook`
   - **Webhook Secret**: Generate a secure secret
   - **Permissions**:
     - Pull requests: Read & Write
     - Issues: Read & Write
     - Contents: Read
   - **Events**: Pull requests, Issue comments

3. Download the private key and update your `.env` file
4. Install the app on your repositories

### 6. Run Services

#### Development Mode

```bash
# Run all services
npm run dev

# Or run individually
npm run dev:github-app
npm run dev:mcp-server
```

#### Production Mode

```bash
# Build all components
npm run build

# Start services
npm run start:github-app
npm run start:mcp-server
```

### 7. Package VS Code Extension

```bash
cd vscode-extension
npm run package
```

Install the generated `.vsix` file in VS Code:
1. Open VS Code
2. Go to Extensions
3. Click "..." → "Install from VSIX"
4. Select the generated file

## 🎯 Usage

### GitHub Integration

1. Create a pull request in a repository where CodeMentor AI is installed
2. The app will automatically analyze the code and post review comments
3. Comments will appear with severity indicators (🔴 🟡 🟠 🔵)

### VS Code Extension

1. Open a project with an active pull request
2. Connect to CodeMentor AI using the status bar or command palette
3. View comments in the CodeMentor AI panel
4. Click on comments to navigate to the code
5. Use "Apply Fix" to automatically apply suggested changes
6. Use "Resolve Comment" to mark issues as resolved

### Manual Review Trigger

Comment on a PR with `@codementor-ai review` or `/codementor review` to trigger a manual review.

## 🔧 Configuration

### GitHub App Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_APP_ID` | GitHub App ID | - |
| `GITHUB_PRIVATE_KEY` | GitHub App private key | - |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `PINECONE_API_KEY` | Pinecone API key (optional) | - |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `PORT` | Server port | `3000` |

### MCP Server Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PORT` | MCP server port | `3001` |
| `JWT_SECRET` | JWT signing secret | - |
| `MCP_API_KEY` | API key for authentication | - |
| `GITHUB_TOKEN` | GitHub personal access token | - |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |

### VS Code Extension Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `serverUrl` | MCP server URL | `http://localhost:3001` |
| `apiKey` | API key for MCP server | - |
| `gitHubToken` | GitHub personal access token | - |
| `autoRefresh` | Auto-refresh comments | `true` |
| `refreshInterval` | Refresh interval in seconds | `30` |
| `showNotifications` | Show notifications | `true` |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run tests for specific component
npm test -- --testPathPattern=github-app
```

## 🚀 Deployment

### GitHub App Deployment

#### Using Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

#### Using PM2

```bash
npm install -g pm2
pm2 start dist/index.js --name codementor-github-app
```

#### Using Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel --prod`
3. Set environment variables in Vercel dashboard

### MCP Server Deployment

#### Docker Compose

```yaml
version: '3.8'
services:
  mcp-server:
    build: ./mcp-server
    ports:
      - "3001:3001"
    environment:
      - MCP_PORT=3001
      - JWT_SECRET=${JWT_SECRET}
      - MCP_API_KEY=${MCP_API_KEY}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## 📊 Monitoring

### Health Checks

- GitHub App: `GET /health`
- MCP Server: `GET /health`

### Logging

All components use Winston for structured logging:
- Logs are written to `logs/` directory
- Console output with colorized levels
- JSON format for production

### Metrics

Key metrics to monitor:
- Review generation time
- API response times
- Error rates
- Comment resolution rate
- User engagement

## 🔒 Security

### Authentication

- GitHub App uses JWT tokens
- MCP Server uses API keys and JWT
- VS Code Extension uses secure storage

### Best Practices

- Use environment variables for secrets
- Enable HTTPS in production
- Regularly rotate API keys
- Monitor for suspicious activity
- Implement rate limiting

## 🐛 Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check server URLs and API keys
   - Verify firewall settings
   - Ensure services are running

2. **No Comments Appearing**
   - Check GitHub App installation
   - Verify webhook delivery
   - Check PR meets review criteria

3. **Permission Errors**
   - Verify GitHub token permissions
   - Check repository access
   - Review app installation scope

4. **AI Service Errors**
   - Check OpenAI API key
   - Verify rate limits
   - Review model availability

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=debug
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Development Guidelines

- Use TypeScript for all code
- Follow ESLint configuration
- Add tests for new features
- Update documentation
- Use conventional commits

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Probot](https://probot.github.io/) for GitHub App framework
- [OpenAI](https://openai.com/) for AI capabilities
- [Pinecone](https://www.pinecone.io/) for vector database
- [VS Code](https://code.visualstudio.com/) for extension platform

## 📞 Support

- Create an issue for bug reports
- Check documentation for common questions
- Join our community discussions

---

**Made with ❤️ by the CodeMentor AI Team**