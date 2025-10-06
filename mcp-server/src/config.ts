import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server Configuration
  port: parseInt(process.env.MCP_PORT || '3001', 10),
  host: process.env.MCP_HOST || '0.0.0.0',
  
  // Authentication
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  apiKey: process.env.MCP_API_KEY || 'your-api-key',
  
  // GitHub Configuration
  githubToken: process.env.GITHUB_TOKEN || '',
  githubAppId: process.env.GITHUB_APP_ID || '',
  githubPrivateKey: process.env.GITHUB_PRIVATE_KEY || '',
  
  // Redis Configuration
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  
  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // WebSocket Configuration
  websocketPingInterval: parseInt(process.env.WS_PING_INTERVAL || '30000', 10), // 30 seconds
  websocketPongTimeout: parseInt(process.env.WS_PONG_TIMEOUT || '10000', 10), // 10 seconds
  
  // Cache Configuration
  cacheTtl: parseInt(process.env.CACHE_TTL || '3600', 10), // 1 hour
  
  // Validate configuration
  validate(): void {
    const requiredVars = [
      'JWT_SECRET',
      'MCP_API_KEY'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
};

// Validate configuration on import
config.validate();