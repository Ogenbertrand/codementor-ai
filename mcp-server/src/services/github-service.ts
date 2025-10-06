import { Octokit } from '@octokit/rest';
import { GitHubComment, FileDiff, GitHubPullRequest } from '@codementor-ai/shared';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { RateLimiter, withRetry } from '@codementor-ai/shared';

export class GitHubService {
  private octokit: Octokit;
  private logger: Logger;
  private rateLimiter: RateLimiter;

  constructor() {
    this.logger = new Logger('github-service');
    this.rateLimiter = new RateLimiter(10, 1); // 10 requests per second
    
    this.octokit = new Octokit({
      auth: config.githubToken,
      userAgent: 'CodeMentor-AI-MCP/1.0.0'
    });
  }

  /**
   * Get pull request comments
   */
  async getPullRequestComments(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{ comments: GitHubComment[] }> {
    await this.rateLimiter.acquire();
    
    try {
      const { data } = await withRetry(async () => {
        return this.octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: pullNumber
        });
      });

      // Also get review comments
      const { data: reviewComments } = await withRetry(async () => {
        return this.octokit.rest.pulls.listReviewComments({
          owner,
          repo,
          pull_number: pullNumber
        });
      });

      const allComments = [
        ...data.map(comment => ({
          id: comment.id,
          body: comment.body || '',
          path: null,
          line: null,
          commit_id: '',
          user: {
            login: comment.user?.login || 'unknown'
          },
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          pull_request_review_id: null
        })),
        ...reviewComments.map(comment => ({
          id: comment.id,
          body: comment.body || '',
          path: comment.path,
          line: comment.line,
          commit_id: comment.commit_id,
          user: {
            login: comment.user?.login || 'unknown'
          },
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          pull_request_review_id: comment.pull_request_review_id
        }))
      ];

      this.logger.info('Retrieved PR comments', { owner, repo, pullNumber, count: allComments.length });
      return { comments: allComments };
    } catch (error) {
      this.logger.error('Error getting PR comments', { owner, repo, pullNumber, error });
      throw error;
    }
  }

  /**
   * Create a comment on pull request
   */
  async createComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string,
    path?: string,
    line?: number,
    commitId?: string
  ): Promise<{ success: boolean; commentId: number }> {
    await this.rateLimiter.acquire();
    
    try {
      let result: any;

      if (path && line && commitId) {
        // Create review comment on specific line
        const { data } = await withRetry(async () => {
          return this.octokit.rest.pulls.createReviewComment({
            owner,
            repo,
            pull_number: pullNumber,
            commit_id: commitId,
            path,
            line,
            body
          });
        });
        result = data;
      } else {
        // Create issue comment
        const { data } = await withRetry(async () => {
          return this.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pullNumber,
            body
          });
        });
        result = data;
      }

      this.logger.info('Comment created', { owner, repo, pullNumber, commentId: result.id });
      return { success: true, commentId: result.id };
    } catch (error) {
      this.logger.error('Error creating comment', { owner, repo, pullNumber, error });
      throw error;
    }
  }

  /**
   * Get pull request files
   */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{ files: FileDiff[] }> {
    await this.rateLimiter.acquire();
    
    try {
      const { data } = await withRetry(async () => {
        return this.octokit.rest.pulls.listFiles({
          owner,
          repo,
          pull_number: pullNumber
        });
      });

      this.logger.info('Retrieved PR files', { owner, repo, pullNumber, count: data.length });
      return { files: data as FileDiff[] };
    } catch (error) {
      this.logger.error('Error getting PR files', { owner, repo, pullNumber, error });
      throw error;
    }
  }

  /**
   * Get file content
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<{ content: string; encoding: string; size: number }> {
    await this.rateLimiter.acquire();
    
    try {
      const { data } = await withRetry(async () => {
        return this.octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref
        });
      });

      if ('content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        this.logger.info('Retrieved file content', { owner, repo, path, ref, size: content.length });
        return {
          content,
          encoding: data.encoding,
          size: data.size
        };
      }

      throw new Error('File content not available');
    } catch (error) {
      this.logger.error('Error getting file content', { owner, repo, path, ref, error });
      throw error;
    }
  }

  /**
   * Update a comment
   */
  async updateComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string
  ): Promise<{ success: boolean; commentId: number }> {
    await this.rateLimiter.acquire();
    
    try {
      // Try to update as issue comment first
      try {
        const { data } = await withRetry(async () => {
          return this.octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: commentId,
            body
          });
        });
        this.logger.info('Issue comment updated', { owner, repo, commentId });
        return { success: true, commentId: data.id };
      } catch {
        // If that fails, try as review comment
        const { data } = await withRetry(async () => {
          return this.octokit.rest.pulls.updateReviewComment({
            owner,
            repo,
            comment_id: commentId,
            body
          });
        });
        this.logger.info('Review comment updated', { owner, repo, commentId });
        return { success: true, commentId: data.id };
      }
    } catch (error) {
      this.logger.error('Error updating comment', { owner, repo, commentId, error });
      throw error;
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
    sort: 'created' | 'updated' | 'popularity' | 'long-running' = 'created',
    perPage: number = 30,
    page: number = 1
  ): Promise<{ pullRequests: GitHubPullRequest[]; totalCount: number }> {
    await this.rateLimiter.acquire();
    
    try {
      const { data } = await withRetry(async () => {
        return this.octokit.rest.pulls.list({
          owner,
          repo,
          state,
          sort,
          per_page: Math.min(perPage, 100),
          page
        });
      });

      // Get total count from headers
      const totalCount = parseInt(data.headers?.['x-total-count'] || '0', 10) || data.data.length;

      this.logger.info('Listed pull requests', { 
        owner, 
        repo, 
        state, 
        count: data.data.length,
        totalCount 
      });

      return { 
        pullRequests: data.data as GitHubPullRequest[],
        totalCount 
      };
    } catch (error) {
      this.logger.error('Error listing pull requests', { owner, repo, error });
      throw error;
    }
  }
}