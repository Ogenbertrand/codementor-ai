// MCP Protocol Constants
export const MCP_PROTOCOL_VERSION = '1.0.0';
export const MCP_DEFAULT_PORT = 3001;
export const MCP_WEBSOCKET_PATH = '/mcp';

// GitHub App Constants
export const GITHUB_APP_DEFAULT_PORT = 3000;
export const GITHUB_WEBHOOK_PATH = '/webhook';

// Vector DB Constants
export const VECTOR_DB_DEFAULT_DIMENSION = 1536; // OpenAI embedding dimension
export const VECTOR_DB_MAX_BATCH_SIZE = 100;
export const VECTOR_DB_SIMILARITY_THRESHOLD = 0.7;

// LLM Constants
export const LLM_DEFAULT_MODEL = 'gpt-4o';
export const LLM_MAX_TOKENS = 4000;
export const LLM_TEMPERATURE = 0.1;
export const LLM_MAX_RETRIES = 3;

// Review Constants
export const REVIEW_MAX_FILE_SIZE = 500 * 1024; // 500KB
export const REVIEW_MAX_FILES_PER_PR = 50;
export const REVIEW_MAX_COMMENTS_PER_FILE = 20;
export const REVIEW_CONFIDENCE_THRESHOLD = 0.6;

// Cache Constants
export const CACHE_TTL_SECONDS = 3600; // 1 hour
export const CACHE_MAX_SIZE_MB = 100;

// VS Code Extension Constants
export const EXTENSION_ID = 'codementor-ai';
export const EXTENSION_NAME = 'CodeMentor AI';
export const EXTENSION_PUBLISHER = 'CodeMentorAI';

// Error Codes
export const ERROR_CODES = {
  INVALID_REQUEST: 4000,
  UNAUTHORIZED: 4001,
  FORBIDDEN: 4003,
  NOT_FOUND: 4004,
  RATE_LIMITED: 4029,
  INTERNAL_ERROR: 5000,
  SERVICE_UNAVAILABLE: 5030,
  TIMEOUT: 5040
} as const;

// Event Types
export const EVENT_TYPES = {
  PR_OPENED: 'pull_request.opened',
  PR_SYNCHRONIZE: 'pull_request.synchronize',
  PR_REOPENED: 'pull_request.reopened',
  COMMENT_CREATED: 'issue_comment.created',
  REVIEW_SUBMITTED: 'pull_request_review.submitted',
  MCP_CONNECT: 'mcp.connect',
  MCP_DISCONNECT: 'mcp.disconnect',
  MCP_REQUEST: 'mcp.request',
  MCP_RESPONSE: 'mcp.response',
  NOTIFICATION_NEW_COMMENTS: 'notification.new_comments',
  NOTIFICATION_REVIEW_COMPLETE: 'notification.review_complete'
} as const;

// Logging Levels
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  TRACE: 'trace'
} as const;

// File Extensions for Code Review
export const SUPPORTED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
  '.cs', '.php', '.rb', '.go', '.rs', '.kt', '.swift', '.dart',
  '.vue', '.svelte', '.html', '.css', '.scss', '.sass', '.less'
] as const;

// AI Review Prompts
export const AI_PROMPTS = {
  CODE_REVIEW: `You are an expert senior software engineer conducting a thorough code review. Analyze the provided code changes for:

1. **Bugs**: Logical errors, potential crashes, edge cases
2. **Security**: Vulnerabilities, unsafe practices, injection risks
3. **Performance**: Inefficient algorithms, memory leaks, bottlenecks
4. **Maintainability**: Code complexity, duplication, readability
5. **Style**: Consistency with language conventions and project standards
6. **Documentation**: Missing or outdated comments/docs

For each issue found:
- Provide specific file path and line number
- Explain the problem clearly
- Suggest concrete improvements with code examples
- Rate severity (info, warning, error, critical)
- Rate confidence (0-1)

Be constructive and educational. Focus on high-impact issues.`,

  FIX_SUGGESTION: `As an expert developer, provide a fix for the following code review comment:

Comment: {comment}
Original Code: {originalCode}
File Context: {fileContext}

Provide:
1. Fixed code snippet
2. Explanation of the changes
3. Any additional context or best practices

Ensure the fix is correct, efficient, and follows best practices.`,

  CONTEXT_QUERY: `Given the following repository context and user query, provide relevant information to help understand the codebase:

Context: {context}
Query: {query}

Focus on:
- Code patterns and conventions
- Architecture decisions
- Related files and dependencies
- Historical context if relevant`
} as const;