import { Probot } from 'probot';
import { createAppAuth } from '@octokit/auth-app';
import { CodeReviewService } from './services/code-review-service';
import { GitHubService } from './services/github-service';
import { VectorDBService } from './services/vector-db-service';
import { NotificationService } from './services/notification-service';
import { Logger } from './utils/logger';
import { config } from './config';
import express from 'express';

const logger = new Logger('github-app');

export = (app: Probot) => {
  const githubService = new GitHubService(app);
  const vectorDBService = new VectorDBService(config.pineconeApiKey, config.pineconeIndex);
  const notificationService = new NotificationService();
  const codeReviewService = new CodeReviewService(githubService, vectorDBService, notificationService);

  // Handle pull request opened event
  app.on('pull_request.opened', async (context) => {
    logger.info('Pull request opened', { 
      repository: context.payload.repository.full_name,
      pullRequest: context.payload.pull_request.number 
    });

    try {
      await codeReviewService.handlePullRequestOpened(context);
    } catch (error) {
      logger.error('Error handling pull request opened', { error, context: context.payload });
    }
  });

  // Handle pull request synchronized event (new commits)
  app.on('pull_request.synchronize', async (context) => {
    logger.info('Pull request synchronized', { 
      repository: context.payload.repository.full_name,
      pullRequest: context.payload.pull_request.number 
    });

    try {
      await codeReviewService.handlePullRequestSynchronize(context);
    } catch (error) {
      logger.error('Error handling pull request synchronize', { error, context: context.payload });
    }
  });

  // Handle pull request reopened event
  app.on('pull_request.reopened', async (context) => {
    logger.info('Pull request reopened', { 
      repository: context.payload.repository.full_name,
      pullRequest: context.payload.pull_request.number 
    });

    try {
      await codeReviewService.handlePullRequestReopened(context);
    } catch (error) {
      logger.error('Error handling pull request reopened', { error, context: context.payload });
    }
  });

  // Handle issue comment created (for manual review triggers)
  app.on('issue_comment.created', async (context) => {
    const comment = context.payload.comment.body;
    
    // Check if comment contains review trigger
    if (comment.includes('@codementor-ai review') || comment.includes('/codementor review')) {
      logger.info('Manual review triggered', { 
        repository: context.payload.repository.full_name,
        issue: context.payload.issue.number 
      });

      try {
        await codeReviewService.handleManualReviewTrigger(context);
      } catch (error) {
        logger.error('Error handling manual review trigger', { error, context: context.payload });
      }
    }
  });

  // Health check endpoint - temporarily disabled due to Probot version compatibility
  // TODO: Implement health check endpoint properly

  logger.info('GitHub App initialized successfully');
};