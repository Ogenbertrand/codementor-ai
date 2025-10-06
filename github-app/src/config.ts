import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // GitHub App Configuration
  appId: process.env.GITHUB_APP_ID || '',
  privateKey: process.env.GITHUB_PRIVATE_KEY || '',
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
  
  // Server Configuration
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  
  // OpenAI Configuration
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
  
  // Pinecone Configuration
  pineconeApiKey: process.env.PINECONE_API_KEY || '',
  pineconeIndex: process.env.PINECONE_INDEX || 'codementor-ai',
  pineconeEnvironment: process.env.PINECONE_ENVIRONMENT || '',
  
  // Redis Configuration
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Review Configuration
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '512000', 10), // 500KB
  maxFilesPerPR: parseInt(process.env.MAX_FILES_PER_PR || '50', 10),
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.6'),
  
  // Rate Limiting
  githubRateLimitRPS: parseInt(process.env.GITHUB_RATE_LIMIT_RPS || '10', 10),
  openaiRateLimitRPM: parseInt(process.env.OPENAI_RATE_LIMIT_RPM || '60', 10),
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // MCP Server Configuration
  mcpServerUrl: process.env.MCP_SERVER_URL || 'http://localhost:3001',
  
  // GitHub Token for MCP Server communication
  githubToken: process.env.GITHUB_TOKEN || '',
  
  // Validate required configuration
  validate(): void {
    const requiredVars = [
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY',
      'GITHUB_WEBHOOK_SECRET',
      'OPENAI_API_KEY'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
};

// Validate configuration on import
config.validate();