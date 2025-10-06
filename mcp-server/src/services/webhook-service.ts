import { Logger } from '../utils/logger';
import { EventEmitter, WebSocketMessage } from '@codementor-ai/shared';
import { MCPServer } from './mcp-server';

export class WebhookService {
  private logger: Logger;
  private eventEmitter: EventEmitter;

  constructor(private mcpServer: MCPServer) {
    this.logger = new Logger('webhook-service');
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Handle incoming webhook notifications
   */
  async handleNotification(payload: any): Promise<void> {
    try {
      this.logger.info('Received webhook notification', { type: payload.type });

      switch (payload.type) {
        case 'new_comments':
          await this.handleNewComments(payload);
          break;
        
        case 'review_complete':
          await this.handleReviewComplete(payload);
          break;
        
        default:
          this.logger.warn('Unknown notification type', { type: payload.type });
      }
    } catch (error) {
      this.logger.error('Error handling webhook notification', { error, payload });
      throw error;
    }
  }

  /**
   * Handle new comments notification
   */
  private async handleNewComments(payload: any): Promise<void> {
    const { repository, pullRequest, commentCount } = payload;

    // Broadcast to all connected VS Code clients
    const message: WebSocketMessage = {
      type: 'notification',
      payload: {
        type: 'new_comments',
        repository,
        pullRequest,
        commentCount,
        message: `${commentCount} new review comments available`
      },
      timestamp: new Date().toISOString(),
      source: 'github-app'
    };

    this.mcpServer.broadcast(message);
    
    this.logger.info('New comments notification broadcasted', { repository, pullRequest, commentCount });
  }

  /**
   * Handle review completion notification
   */
  private async handleReviewComplete(payload: any): Promise<void> {
    const { repository, pullRequest, reviewId, statistics } = payload;

    // Broadcast review completion to all connected clients
    const message: WebSocketMessage = {
      type: 'notification',
      payload: {
        type: 'review_complete',
        repository,
        pullRequest,
        reviewId,
        statistics,
        message: `Code review completed with ${statistics.totalComments} comments`
      },
      timestamp: new Date().toISOString(),
      source: 'github-app'
    };

    this.mcpServer.broadcast(message);
    
    this.logger.info('Review completion notification broadcasted', { repository, pullRequest, reviewId });
  }

  /**
   * Get event emitter
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}