import { Logger } from '../utils/logger';
import { EventEmitter } from '@codementor-ai/shared';
import { config } from '../config';

export class NotificationService {
  private logger: Logger;
  private eventEmitter: EventEmitter;
  private webhookUrl?: string;

  constructor() {
    this.logger = new Logger('notification-service');
    this.eventEmitter = new EventEmitter();
    this.webhookUrl = config.mcpServerUrl;
  }

  /**
   * Notify MCP server of new review comments
   */
  async notifyNewComments(
    repository: string,
    pullRequest: number,
    comments: any[]
  ): Promise<void> {
    if (!this.webhookUrl) {
      this.logger.warn('MCP server URL not configured, skipping notification');
      return;
    }

    try {
      const notification = {
        type: 'new_comments',
        repository,
        pullRequest,
        commentCount: comments.length,
        timestamp: new Date().toISOString()
      };

      // Send notification to MCP server
      await this.sendWebhookNotification(notification);
      
      // Also emit local event for any connected services
      this.eventEmitter.emit('notification', notification);

      this.logger.info('Notification sent', { repository, pullRequest, commentCount: comments.length });
    } catch (error) {
      this.logger.error('Failed to send notification', { error, repository, pullRequest });
    }
  }

  /**
   * Notify MCP server of review completion
   */
  async notifyReviewComplete(
    repository: string,
    pullRequest: number,
    reviewId: string,
    statistics: any
  ): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    try {
      const notification = {
        type: 'review_complete',
        repository,
        pullRequest,
        reviewId,
        statistics,
        timestamp: new Date().toISOString()
      };

      await this.sendWebhookNotification(notification);
      this.eventEmitter.emit('notification', notification);

      this.logger.info('Review completion notification sent', { repository, pullRequest, reviewId });
    } catch (error) {
      this.logger.error('Failed to send review completion notification', { error, repository, pullRequest });
    }
  }

  /**
   * Send webhook notification to MCP server
   */
  private async sendWebhookNotification(payload: any): Promise<void> {
    try {
      const response = await fetch(`${this.webhookUrl}/webhook/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.githubToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error('Webhook notification failed', { error, payload });
      throw error;
    }
  }

  /**
   * Get event emitter for local notifications
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}