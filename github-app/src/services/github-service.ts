import { Probot } from 'probot';
import { Octokit } from '@octokit/rest';
import { FileDiff, GitHubPullRequest } from '@codementor-ai/shared';
import { Logger } from '../utils/logger';
import { RateLimiter, withRetry } from '@codementor-ai/shared';

export class GitHubService {
  private logger: Logger;
  private rateLimiter: RateLimiter;

  constructor(private probot: Probot) {
    this.logger = new Logger('github-service');
    this.rateLimiter = new RateLimiter(10, 1); // 10 requests per second
  }

  /**
   * Get pull request details
   */
  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    octokit: Octokit
  ): Promise<GitHubPullRequest> {
    await this.rateLimiter.acquire();
    
    const { data } = await withRetry(async () => {
      return octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber
      });
    });

    return data as GitHubPullRequest;
  }

  /**
   * Get pull request files and diffs
   */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    octokit: Octokit
  ): Promise<FileDiff[]> {
    await this.rateLimiter.acquire();
    
    const { data } = await withRetry(async () => {
      return octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber
      });
    });

    return data as FileDiff[];
  }

  /**
   * Get file content from repository
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
    octokit: Octokit
  ): Promise<string> {
    await this.rateLimiter.acquire();
    
    try {
      const { data } = await withRetry(async () => {
        return octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref
        });
      });

      if ('content' in data) {
        return Buffer.from(data.content, 'base64').toString('utf8');
      }
      
      throw new Error('File content not available');
    } catch (error) {
      this.logger.error('Error fetching file content', { owner, repo, path, ref, error });
      throw error;
    }
  }

  /**
   * Create a review comment on a pull request
   */
  async createReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    body: string,
    path?: string,
    line?: number,
    octokit: Octokit
  ): Promise<void> {
    await this.rateLimiter.acquire();
    
    const commentData: any = {
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      body
    };

    if (path && line) {
      commentData.path = path;
      commentData.line = line;
    }

    await withRetry(async () => {
      return octokit.rest.pulls.createReviewComment(commentData);
    });

    this.logger.info('Review comment created', { owner, repo, pullNumber, path, line });
  }

  /**
   * Create a review with multiple comments
   */
  async createReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    body: string,
    comments: Array<{
      path: string;
      line: number;
      body: string;
    }>,
    octokit: Octokit
  ): Promise<void> {
    await this.rateLimiter.acquire();
    
    await withRetry(async () => {
      return octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        body,
        comments,
        event: 'COMMENT'
      });
    });

    this.logger.info('Review created', { 
      owner, 
      repo, 
      pullNumber, 
      commentCount: comments.length 
    });
  }

  /**
   * Get repository tree (for context gathering)
   */
  async getRepositoryTree(
    owner: string,
    repo: string,
    treeSha: string,
    recursive: boolean = true,
    octokit: Octokit
  ): Promise<any> {
    await this.rateLimiter.acquire();
    
    const { data } = await withRetry(async () => {
      return octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: recursive ? '1' : undefined
      });
    });

    return data;
  }

  /**
   * Get repository information
   */
  async getRepository(
    owner: string,
    repo: string,
    octokit: Octokit
  ): Promise<any> {
    await this.rateLimiter.acquire();
    
    const { data } = await withRetry(async () => {
      return octokit.rest.repos.get({
        owner,
        repo
      });
    });

    return data;
  }

  /**
   * Get Octokit instance for installation
   */
  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    return this.probot.auth(installationId) as Promise<Octokit>;
  }
}