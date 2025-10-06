import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { MCPServer } from './services/mcp-server';
import { WebhookService } from './services/webhook-service';
import { Logger } from './utils/logger';
import { authMiddleware } from './middleware/auth';
import { config } from './config';

dotenv.config();

const logger = new Logger('mcp-server');
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/mcp' });

// Initialize services
const mcpServer = new MCPServer();
const webhookService = new WebhookService(mcpServer);

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(authMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
    protocol: 'mcp',
    protocolVersion: '1.0.0'
  });
});

// MCP HTTP endpoints
app.post('/mcp/tools/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const { params, id } = req.body;

    logger.info('MCP tool request', { toolName, id });

    const result = await mcpServer.executeTool(toolName, params);
    
    res.json({
      id,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('MCP tool execution error', { error, toolName: req.params.toolName });
    res.status(500).json({
      id: req.body.id,
      error: {
        code: 5000,
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Webhook endpoint for notifications from GitHub App
app.post('/webhook/notifications', authMiddleware, async (req, res) => {
  try {
    const notification = req.body;
    await webhookService.handleNotification(notification);
    res.json({ success: true });
  } catch (error) {
    logger.error('Webhook notification error', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
});

app.get('/mcp/tools', (req, res) => {
  const tools = mcpServer.getAvailableTools();
  res.json({ tools });
});

// WebSocket connection handling
wss.on('connection', (ws, request) => {
  logger.info('WebSocket connection established');

  // Authenticate WebSocket connection
  const token = new URL(request.url!, `http://${request.headers.host}`).searchParams.get('token');
  if (!token || !mcpServer.validateToken(token)) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  // Handle WebSocket messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await mcpServer.handleWebSocketMessage(ws, message);
    } catch (error) {
      logger.error('WebSocket message handling error', { error });
      ws.send(JSON.stringify({
        type: 'error',
        error: {
          code: 5000,
          message: error instanceof Error ? error.message : 'Internal server error'
        }
      }));
    }
  });

  ws.on('close', (code, reason) => {
    logger.info('WebSocket connection closed', { code, reason: reason.toString() });
    mcpServer.handleWebSocketDisconnect(ws);
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error });
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    protocol: 'mcp',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }));
});

// Start server
const PORT = config.port;
server.listen(PORT, config.host, () => {
  logger.info(`MCP Server started`, { 
    host: config.host, 
    port: PORT,
    websocketPath: '/mcp'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});