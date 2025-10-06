import OpenAI from 'openai';
import { 
  AIReviewRequest, 
  AIReviewResponse, 
  CodeReviewComment, 
  ReviewSeverity, 
  ReviewCategory,
  AI_PROMPTS,
  REVIEW_CONFIDENCE_THRESHOLD,
  SUPPORTED_EXTENSIONS
} from '@codementor-ai/shared';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { RateLimiter } from '@codementor-ai/shared';

export class AIService {
  private openai: OpenAI;
  private logger: Logger;
  private rateLimiter: RateLimiter;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey
    });
    this.logger = new Logger('ai-service');
    this.rateLimiter = new RateLimiter(config.openaiRateLimitRPM, 60); // RPM to RPS
  }

  /**
   * Generate code review using OpenAI
   */
  async generateCodeReview(request: AIReviewRequest): Promise<AIReviewResponse> {
    await this.rateLimiter.acquire();
    
    const startTime = Date.now();
    
    try {
      const prompt = this.buildReviewPrompt(request);
      
      const completion = await this.openai.chat.completions.create({
        model: config.openaiModel,
        messages: [
          { role: 'system', content: AI_PROMPTS.CODE_REVIEW },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });

      const reviewContent = completion.choices[0]?.message?.content;
      if (!reviewContent) {
        throw new Error('No review content generated');
      }

      const comments = this.parseReviewContent(reviewContent, request);
      const filteredComments = comments.filter(c => c.confidence >= REVIEW_CONFIDENCE_THRESHOLD);

      const response: AIReviewResponse = {
        reviewId: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        comments: filteredComments,
        summary: this.generateSummary(filteredComments),
        statistics: this.calculateStatistics(filteredComments)
      };

      const duration = Date.now() - startTime;
      this.logger.info('Code review generated', { 
        repository: request.repository,
        prNumber: request.prNumber,
        commentCount: filteredComments.length,
        duration 
      });

      return response;
    } catch (error) {
      this.logger.error('Error generating code review', { 
        repository: request.repository,
        prNumber: request.prNumber,
        error 
      });
      throw error;
    }
  }

  /**
   * Generate fix suggestion for a specific issue
   */
  async generateFixSuggestion(
    comment: CodeReviewComment,
    fileContent: string,
    context: string[]
  ): Promise<string> {
    await this.rateLimiter.acquire();
    
    try {
      const prompt = `Code Review Comment: ${comment.title}\n${comment.description}\n\nCurrent Code:\n${fileContent}\n\nContext:\n${context.join('\n')}\n\nPlease provide a fixed code snippet that addresses the issue.`;

      const completion = await this.openai.chat.completions.create({
        model: config.openaiModel,
        messages: [
          { role: 'system', content: 'You are an expert code reviewer providing fix suggestions.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      });

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      this.logger.error('Error generating fix suggestion', { comment, error });
      throw error;
    }
  }

  /**
   * Build review prompt with context
   */
  private buildReviewPrompt(request: AIReviewRequest): string {
    let prompt = `Repository: ${request.repository}\n`;
    prompt += `Pull Request #${request.prNumber}\n\n`;
    
    if (request.context?.repoContext) {
      prompt += `Repository Context:\n`;
      request.context.repoContext.slice(0, 5).forEach(context => {
        prompt += `File: ${context.metadata.filePath}\n`;
        prompt += `Content: ${context.metadata.content.substring(0, 200)}...\n\n`;
      });
    }

    prompt += `Changed Files:\n`;
    request.files.forEach(file => {
      if (this.shouldReviewFile(file.filename)) {
        prompt += `\n--- ${file.filename} (${file.status}) ---\n`;
        if (file.patch) {
          prompt += `${file.patch}\n`;
        }
      }
    });

    return prompt;
  }

  /**
   * Parse AI review content into structured comments
   */
  private parseReviewContent(content: string, request: AIReviewRequest): CodeReviewComment[] {
    const comments: CodeReviewComment[] = [];
    const lines = content.split('\n');
    
    let currentComment: Partial<CodeReviewComment> | null = null;
    let currentSection: string | null = null;

    for (const line of lines) {
      if (line.startsWith('**File:') && line.includes('Line:')) {
        if (currentComment) {
          comments.push(currentComment as CodeReviewComment);
        }
        
        const fileMatch = line.match(/\*\*File:\s*([^,]+),\s*Line:\s*(\d+)\*\*/);
        if (fileMatch) {
          currentComment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            filePath: fileMatch[1].trim(),
            lineNumber: parseInt(fileMatch[2]),
            confidence: 0.8
          };
        }
      } else if (currentComment) {
        if (line.startsWith('**Severity:')) {
          const severity = line.replace('**Severity:', '').replace('**', '').trim().toLowerCase();
          currentComment.severity = this.parseSeverity(severity);
        } else if (line.startsWith('**Category:')) {
          const category = line.replace('**Category:', '').replace('**', '').trim().toLowerCase();
          currentComment.category = this.parseCategory(category);
        } else if (line.startsWith('**Title:')) {
          currentComment.title = line.replace('**Title:', '').replace('**', '').trim();
        } else if (line.startsWith('**Description:')) {
          currentSection = 'description';
          currentComment.description = '';
        } else if (line.startsWith('**Suggestion:')) {
          currentSection = 'suggestion';
          currentComment.suggestion = '';
        } else if (line.startsWith('**Confidence:')) {
          const confidence = line.match(/\*\*Confidence:\s*(\d+(?:\.\d+)?)\*\*/);
          if (confidence) {
            currentComment.confidence = parseFloat(confidence[1]);
          }
        } else if (currentSection === 'description' && !line.startsWith('**')) {
          currentComment.description += (currentComment.description ? '\n' : '') + line.trim();
        } else if (currentSection === 'suggestion' && !line.startsWith('**')) {
          currentComment.suggestion += (currentComment.suggestion ? '\n' : '') + line.trim();
        }
      }
    }

    if (currentComment) {
      comments.push(currentComment as CodeReviewComment);
    }

    return comments.filter(c => c.title && c.description);
  }

  /**
   * Parse severity from string
   */
  private parseSeverity(severity: string): ReviewSeverity {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'error':
      case 'high':
        return 'error';
      case 'warning':
      case 'medium':
        return 'warning';
      default:
        return 'info';
    }
  }

  /**
   * Parse category from string
   */
  private parseCategory(category: string): ReviewCategory {
    switch (category) {
      case 'bug':
      case 'bugs':
        return 'bug';
      case 'security':
        return 'security';
      case 'performance':
        return 'performance';
      case 'style':
        return 'style';
      case 'maintainability':
        return 'maintainability';
      case 'documentation':
        return 'documentation';
      default:
        return 'maintainability';
    }
  }

  /**
   * Generate review summary
   */
  private generateSummary(comments: CodeReviewComment[]): string {
    const severityCount = comments.reduce((acc, comment) => {
      acc[comment.severity] = (acc[comment.severity] || 0) + 1;
      return acc;
    }, {} as Record<ReviewSeverity, number>);

    const categoryCount = comments.reduce((acc, comment) => {
      acc[comment.category] = (acc[comment.category] || 0) + 1;
      return acc;
    }, {} as Record<ReviewCategory, number>);

    let summary = `Code Review Summary:\n`;
    summary += `Total Issues: ${comments.length}\n`;
    summary += `\nBy Severity:\n`;
    Object.entries(severityCount).forEach(([severity, count]) => {
      summary += `  ${severity}: ${count}\n`;
    });
    summary += `\nBy Category:\n`;
    Object.entries(categoryCount).forEach(([category, count]) => {
      summary += `  ${category}: ${count}\n`;
    });

    return summary;
  }

  /**
   * Calculate review statistics
   */
  private calculateStatistics(comments: CodeReviewComment[]): AIReviewResponse['statistics'] {
    return {
      totalComments: comments.length,
      criticalIssues: comments.filter(c => c.severity === 'critical').length,
      highConfidence: comments.filter(c => c.confidence > 0.8).length,
      autoFixable: comments.filter(c => c.suggestedCode).length
    };
  }

  /**
   * Check if file should be reviewed
   */
  private shouldReviewFile(fileName: string): boolean {
    const ext = fileName.substring(fileName.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.includes(ext as any);
  }
}