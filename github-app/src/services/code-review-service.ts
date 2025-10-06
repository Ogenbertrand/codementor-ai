import { Context } from 'probot';
import { 
  CodeReviewComment, 
  FileDiff, 
  GitHubPullRequest,
  REVIEW_MAX_FILE_SIZE,
  REVIEW_MAX_FILES_PER_PR,
  SUPPORTED_EXTENSIONS
} from '@codementor-ai/shared';
import { GitHubService } from './github-service';
import { VectorDBService } from './vector-db-service';
import { AIService } from './ai-service';
import { NotificationService } from './notification-service';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { EventEmitter } from '@codementor-ai/shared';

export class CodeReviewService {
  private logger: Logger;
  private aiService: AIService;
  private eventEmitter: EventEmitter;

  constructor(
    private githubService: GitHubService,
    private vectorDBService: VectorDBService,
    private notificationService: NotificationService
  ) {
    this.logger = new Logger('code-review-service');
    this.aiService = new AIService();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Handle pull request opened event
   */
  async handlePullRequestOpened(context: Context<'pull_request.opened'>): Promise<void> {
    const { repository, pull_request } = context.payload;
    
    try {
      const octokit = await this.githubService.getInstallationOctokit(context.payload.installation?.id || 0);
      
      // Get PR details and files
      const prDetails = await this.githubService.getPullRequest(
        repository.owner.login,
        repository.name,
        pull_request.number,
        octokit
      );

      const files = await this.githubService.getPullRequestFiles(
        repository.owner.login,
        repository.name,
        pull_request.number,
        octokit
      );

      // Filter files for review
      const reviewableFiles = this.filterReviewableFiles(files);
      
      if (reviewableFiles.length === 0) {
        this.logger.info('No reviewable files found', { 
          repository: repository.full_name,
          pullRequest: pull_request.number 
        });
        return;
      }

      // Get repository context
      const repoContext = await this.vectorDBService.getReviewContext(
        repository.full_name,
        reviewableFiles
      );

      // Generate AI review
      const review = await this.aiService.generateCodeReview({
        prNumber: pull_request.number,
        repository: repository.full_name,
        files: reviewableFiles,
        context: { repoContext }
      });

      // Post review comments
      await this.postReviewComments(
        repository.owner.login,
        repository.name,
        pull_request.number,
        pull_request.head.sha,
        review.comments,
        octokit
      );

      // Store review context for future use
      await this.vectorDBService.storeReviewComments(
        repository.full_name,
        review.comments
      );

      // Emit notification event
      this.eventEmitter.emit('reviewComplete', {
        repository: repository.full_name,
        pullRequest: pull_request.number,
        reviewId: review.reviewId,
        commentCount: review.comments.length
      });

      // Send notification to MCP server
      await this.notificationService.notifyReviewComplete(
        repository.full_name,
        pull_request.number,
        review.reviewId,
        review.statistics
      );

    } catch (error) {
      this.logger.error('Error handling pull request opened', { 
        repository: repository.full_name,
        pullRequest: pull_request.number,
        error 
      });
      
      // Post error comment to PR
      await this.postErrorComment(
        repository.owner.login,
        repository.name,
        pull_request.number,
        'An error occurred during code review. Please check the logs.',
        context.octokit
      );
    }
  }

  /**
   * Handle pull request synchronize event (new commits)
   */
  async handlePullRequestSynchronize(context: Context<'pull_request.synchronize'>): Promise<void> {
    const { repository, pull_request } = context.payload;
    
    this.logger.info('Handling pull request synchronize', { 
      repository: repository.full_name,
      pullRequest: pull_request.number 
    });

    // Re-run review for new changes
    await this.handlePullRequestOpened(context as any);
  }

  /**
   * Handle pull request reopened event
   */
  async handlePullRequestReopened(context: Context<'pull_request.reopened'>): Promise<void> {
    const { repository, pull_request } = context.payload;
    
    this.logger.info('Handling pull request reopened', { 
      repository: repository.full_name,
      pullRequest: pull_request.number 
    });

    // Re-run review
    await this.handlePullRequestOpened(context as any);
  }

  /**
   * Handle manual review trigger
   */
  async handleManualReviewTrigger(context: Context<'issue_comment.created'>): Promise<void> {
    const { repository, issue } = context.payload;
    
    if (!issue.pull_request) {
      return; // Not a pull request
    }

    this.logger.info('Manual review triggered', { 
      repository: repository.full_name,
      issue: issue.number 
    });

    // Get PR context and run review
    const octokit = await this.githubService.getInstallationOctokit(context.payload.installation?.id || 0);
    const prDetails = await this.githubService.getPullRequest(
      repository.owner.login,
      repository.name,
      issue.number,
      octokit
    );

    // Create a mock context for the review
    const mockContext = {
      payload: {
        repository,
        pull_request: prDetails,
        installation: context.payload.installation
      },
      octokit
    };

    await this.handlePullRequestOpened(mockContext as any);
  }

  /**
   * Filter files that should be reviewed
   */
  private filterReviewableFiles(files: FileDiff[]): FileDiff[] {
    return files
      .filter(file => {
        // Check file extension
        const ext = file.filename.substring(file.filename.lastIndexOf('.'));
        if (!SUPPORTED_EXTENSIONS.includes(ext as any)) {
          return false;
        }

        // Check file size (approximate)
        const estimatedSize = (file.additions + file.deletions) * 100; // Rough estimate
        if (estimatedSize > REVIEW_MAX_FILE_SIZE) {
          return false;
        }

        // Must have patch data
        if (!file.patch) {
          return false;
        }

        return true;
      })
      .slice(0, REVIEW_MAX_FILES_PER_PR); // Limit number of files
  }

  /**
   * Post review comments to GitHub
   */
  private async postReviewComments(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    comments: CodeReviewComment[],
    octokit: any
  ): Promise<void> {
    if (comments.length === 0) {
      this.logger.info('No comments to post', { owner, repo, pullNumber });
      return;
    }

    // Group comments by severity for better organization
    const groupedComments = this.groupCommentsBySeverity(comments);

    // Create review summary comment
    await this.githubService.createReviewComment(
      owner,
      repo,
      pullNumber,
      commitId,
      this.formatReviewSummary(comments),
      undefined,
      undefined,
      octokit
    );

    // Post individual comments for high and critical severity issues
    const highPriorityComments = comments.filter(c => c.severity === 'error' || c.severity === 'critical');
    
    for (const comment of highPriorityComments.slice(0, 10)) { // Limit to 10 individual comments
      await this.githubService.createReviewComment(
        owner,
        repo,
        pullNumber,
        commitId,
        this.formatIndividualComment(comment),
        comment.filePath,
        comment.lineNumber,
        octokit
      );
    }

    this.logger.info('Review comments posted', { 
      owner, 
      repo, 
      pullNumber, 
      totalComments: comments.length,
      highPriorityComments: highPriorityComments.length 
    });
  }

  /**
   * Group comments by severity
   */
  private groupCommentsBySeverity(comments: CodeReviewComment[]): Record<string, CodeReviewComment[]> {
    return comments.reduce((groups, comment) => {
      const severity = comment.severity;
      if (!groups[severity]) {
        groups[severity] = [];
      }
      groups[severity].push(comment);
      return groups;
    }, {} as Record<string, CodeReviewComment[]>);
  }

  /**
   * Format review summary
   */
  private formatReviewSummary(comments: CodeReviewComment[]): string {
    const severityCount = comments.reduce((acc, comment) => {
      acc[comment.severity] = (acc[comment.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let summary = '## 🤖 CodeMentor AI Review\n\n';
    
    summary += `**Total Issues Found:** ${comments.length}\n\n`;

    if (severityCount.critical > 0) {
      summary += `**🔴 Critical:** ${severityCount.critical}\n`;
    }
    if (severityCount.error > 0) {
      summary += `**🟡 High Priority:** ${severityCount.error}\n`;
    }
    if (severityCount.warning > 0) {
      summary += `**🟠 Medium Priority:** ${severityCount.warning}\n`;
    }
    if (severityCount.info > 0) {
      summary += `**🔵 Info:** ${severityCount.info}\n`;
    }

    summary += '\n---\n\n';
    summary += '**Legend:**\n';
    summary += '- 🔴 Critical: Must fix before merge\n';
    summary += '- 🟡 High: Should fix, but not blocking\n';
    summary += '- 🟠 Medium: Consider fixing\n';
    summary += '- 🔵 Info: Minor suggestions\n\n';
    summary += 'Individual comments have been posted for high and critical priority issues.';

    return summary;
  }

  /**
   * Format individual comment
   */
  private formatIndividualComment(comment: CodeReviewComment): string {
    let formatted = `**${this.getSeverityEmoji(comment.severity)} ${comment.title}**\n\n`;
    formatted += `${comment.description}\n\n`;
    
    if (comment.suggestion) {
      formatted += `**💡 Suggestion:**\n${comment.suggestion}\n\n`;
    }

    if (comment.suggestedCode) {
      formatted += `**📝 Code Fix:**\n\`\`\`\n${comment.suggestedCode}\n\`\`\`\n\n`;
    }

    formatted += `**Category:** ${comment.category} | **Confidence:** ${Math.round(comment.confidence * 100)}%`;

    return formatted;
  }

  /**
   * Get emoji for severity
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'error':
        return '🟡';
      case 'warning':
        return '🟠';
      case 'info':
        return '🔵';
      default:
        return '⚪';
    }
  }

  /**
   * Post error comment
   */
  private async postErrorComment(
    owner: string,
    repo: string,
    pullNumber: number,
    message: string,
    octokit: any
  ): Promise<void> {
    try {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: `## ⚠️ CodeMentor AI Error\n\n${message}\n\nPlease contact the development team if this issue persists.`
      });
    } catch (error) {
      this.logger.error('Error posting error comment', { owner, repo, pullNumber, error });
    }
  }

  /**
   * Get event emitter for external notifications
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}