import WebSocket from 'ws';
import { 
  MCPRequest, 
  MCPResponse, 
  MCPTool, 
  GitHubComment, 
  WebSocketMessage,
  ERROR_CODES,
  EVENT_TYPES 
} from '@codementor-ai/shared';
import { Logger } from '../utils/logger';
import { GitHubService } from './github-service';
import { CacheService } from './cache-service';
import { config } from '../config';
import { validateToken } from '../middleware/auth';
import { RateLimiter } from '@codementor-ai/shared';

export class MCPServer {
  private logger: Logger;
  private tools: Map<string, MCPTool>;
  private clients: Map<WebSocket, { authenticated: boolean; userId?: string }>;
  private githubService: GitHubService;
  private cacheService: CacheService;
  private rateLimiter: RateLimiter;

  constructor() {
    this.logger = new Logger('mcp-server');
    this.tools = new Map();
    this.clients = new Map();
    this.githubService = new GitHubService();
    this.cacheService = new CacheService();
    this.rateLimiter = new RateLimiter(100, 60); // 100 requests per minute

    this.registerTools();
  }

  /**
   * Register available MCP tools
   */
  private registerTools(): void {
    // Get PR Comments Tool
    this.tools.set('get_pr_comments', {
      name: 'get_pr_comments',
      description: 'Get all comments from a GitHub pull request',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          pullNumber: { type: 'number', description: 'Pull request number' }
        },
        required: ['owner', 'repo', 'pullNumber']
      },
      outputSchema: {
        type: 'object',
        properties: {
          comments: {
            type: 'array',
            items: { $ref: '#/definitions/GitHubComment' }
          }
        }
      }
    });

    // Post PR Comment Tool
    this.tools.set('post_pr_comment', {
      name: 'post_pr_comment',
      description: 'Post a comment on a GitHub pull request',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          pullNumber: { type: 'number', description: 'Pull request number' },
          body: { type: 'string', description: 'Comment body' },
          path: { type: 'string', description: 'File path (optional)' },
          line: { type: 'number', description: 'Line number (optional)' },
          commitId: { type: 'string', description: 'Commit SHA (optional)' }
        },
        required: ['owner', 'repo', 'pullNumber', 'body']
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          commentId: { type: 'number' }
        }
      }
    });

    // Get PR Files Tool
    this.tools.set('get_pr_files', {
      name: 'get_pr_files',
      description: 'Get files changed in a pull request',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          pullNumber: { type: 'number', description: 'Pull request number' }
        },
        required: ['owner', 'repo', 'pullNumber']
      },
      outputSchema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { $ref: '#/definitions/FileDiff' }
          }
        }
      }
    });

    // Get File Content Tool
    this.tools.set('get_file_content', {
      name: 'get_file_content',
      description: 'Get content of a file from repository',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          path: { type: 'string', description: 'File path' },
          ref: { type: 'string', description: 'Branch or commit SHA' }
        },
        required: ['owner', 'repo', 'path', 'ref']
      },
      outputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          encoding: { type: 'string' },
          size: { type: 'number' }
        }
      }
    });

    // Update PR Comment Tool
    this.tools.set('update_pr_comment', {
      name: 'update_pr_comment',
      description: 'Update an existing PR comment',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          commentId: { type: 'number', description: 'Comment ID to update' },
          body: { type: 'string', description: 'New comment body' }
        },
        required: ['owner', 'repo', 'commentId', 'body']
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          commentId: { type: 'number' }
        }
      }
    });

    // List Repository Pull Requests Tool
    this.tools.set('list_pull_requests', {
      name: 'list_pull_requests',
      description: 'List pull requests in a repository',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
          state: { 
            type: 'string', 
            enum: ['open', 'closed', 'all'],
            description: 'PR state filter'
          },
          sort: { 
            type: 'string', 
            enum: ['created', 'updated', 'popularity', 'long-running'],
            description: 'Sort order'
          },
          perPage: { type: 'number', description: 'Results per page (max 100)' },
          page: { type: 'number', description: 'Page number' }
        },
        required: ['owner', 'repo']
      },
      outputSchema: {
        type: 'object',
        properties: {
          pullRequests: {
            type: 'array',
            items: { $ref: '#/definitions/GitHubPullRequest' }
          },
          totalCount: { type: 'number' }
        }
      }
    });

    this.logger.info('MCP tools registered', { toolCount: this.tools.size });
  }

  /**
   * Get available tools
   */
  getAvailableTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, params: any): Promise<any> {
    await this.rateLimiter.acquire();
    
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    this.logger.info('Executing tool', { toolName, params: Object.keys(params) });

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(toolName, params);
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        this.logger.debug('Tool result from cache', { toolName });
        return cached;
      }

      let result: any;

      switch (toolName) {
        case 'get_pr_comments':
          result = await this.githubService.getPullRequestComments(
            params.owner,
            params.repo,
            params.pullNumber
          );
          break;

        case 'post_pr_comment':
          result = await this.githubService.createComment(
            params.owner,
            params.repo,
            params.pullNumber,
            params.body,
            params.path,
            params.line,
            params.commitId
          );
          break;

        case 'get_pr_files':
          result = await this.githubService.getPullRequestFiles(
            params.owner,
            params.repo,
            params.pullNumber
          );
          break;

        case 'get_file_content':
          result = await this.githubService.getFileContent(
            params.owner,
            params.repo,
            params.path,
            params.ref
          );
          break;

        case 'update_pr_comment':
          result = await this.githubService.updateComment(
            params.owner,
            params.repo,
            params.commentId,
            params.body
          );
          break;

        case 'list_pull_requests':
          result = await this.githubService.listPullRequests(
            params.owner,
            params.repo,
            params.state,
            params.sort,
            params.perPage,
            params.page
          );
          break;

        default:
          throw new Error(`Tool not implemented: ${toolName}`);
      }

      // Cache the result
      await this.cacheService.set(cacheKey, result, config.cacheTtl);

      this.logger.info('Tool executed successfully', { toolName });
      return result;
    } catch (error) {
      this.logger.error('Tool execution failed', { toolName, error });
      throw error;
    }
  }

  /**
   * Handle WebSocket messages
   */
  async handleWebSocketMessage(ws: WebSocket, message: any): Promise<void> {
    const { type, id, method, params } = message;

    switch (type) {
      case 'request':
        try {
          const result = await this.executeTool(method, params);
          const response: WebSocketMessage = {
            type: 'response',
            payload: {
              id,
              result,
              timestamp: new Date().toISOString()
            },
            timestamp: new Date().toISOString(),
            source: 'mcp-server'
          };
          ws.send(JSON.stringify(response));
        } catch (error) {
          const errorResponse: WebSocketMessage = {
            type: 'error',
            payload: {
              id,
              error: {
                code: ERROR_CODES.INTERNAL_ERROR,
                message: error instanceof Error ? error.message : 'Internal server error'
              }
            },
            timestamp: new Date().toISOString(),
            source: 'mcp-server'
          };
          ws.send(JSON.stringify(errorResponse));
        }
        break;

      case 'subscribe':
        // Handle subscription to events
        this.handleSubscription(ws, method, params);
        break;

      default:
        this.logger.warn('Unknown WebSocket message type', { type });
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  handleWebSocketDisconnect(ws: WebSocket): void {
    this.clients.delete(ws);
    this.logger.info('Client disconnected', { clientCount: this.clients.size });
  }

  /**
   * Validate authentication token
   */
  validateToken(token: string): boolean {
    return validateToken(token);
  }

  /**
   * Handle subscription to events
   */
  private handleSubscription(ws: WebSocket, event: string, params: any): void {
    // Add client to subscription list
    this.clients.set(ws, { 
      authenticated: true, 
      userId: params.userId 
    });

    this.logger.info('Client subscribed to events', { 
      event, 
      clientCount: this.clients.size 
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: WebSocketMessage): void {
    const messageStr = JSON.stringify(message);
    
    for (const [client, info] of this.clients.entries()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    }
  
    this.logger.debug('Broadcast sent', { 
      type: message.type, 
      clientCount: this.clients.size 
    });
  }

  /**
   * Generate cache key for tool execution
   */
  private generateCacheKey(toolName: string, params: any): string {
    const paramsStr = JSON.stringify(params, Object.keys(params).sort());
    return `mcp:${toolName}:${Buffer.from(paramsStr).toString('base64')}`;
  }
}