import { z } from 'zod';

// GitHub Types
export const GitHubPullRequestSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
    repo: z.object({
      name: z.string(),
      full_name: z.string(),
      owner: z.object({
        login: z.string()
      })
    })
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
    repo: z.object({
      name: z.string(),
      full_name: z.string(),
      owner: z.object({
        login: z.string()
      })
    })
  }),
  user: z.object({
    login: z.string()
  }),
  created_at: z.string(),
  updated_at: z.string()
});

export const GitHubCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  path: z.string().nullable(),
  line: z.number().nullable(),
  commit_id: z.string(),
  user: z.object({
    login: z.string()
  }),
  created_at: z.string(),
  updated_at: z.string(),
  pull_request_review_id: z.number().nullable()
});

export const FileDiffSchema = z.object({
  filename: z.string(),
  status: z.enum(['added', 'removed', 'modified', 'renamed']),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  blob_url: z.string(),
  raw_url: z.string(),
  contents_url: z.string(),
  patch: z.string().optional()
});

// Code Review Types
export const ReviewSeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);
export const ReviewCategorySchema = z.enum(['bug', 'security', 'performance', 'style', 'maintainability', 'documentation']);

export const CodeReviewCommentSchema = z.object({
  id: z.string().uuid(),
  filePath: z.string(),
  lineNumber: z.number(),
  severity: ReviewSeveritySchema,
  category: ReviewCategorySchema,
  title: z.string(),
  description: z.string(),
  suggestion: z.string().optional(),
  originalCode: z.string().optional(),
  suggestedCode: z.string().optional(),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    rule: z.string().optional(),
    references: z.array(z.string()).optional()
  }).optional()
});

// MCP Protocol Types
export const MCPRequestSchema = z.object({
  id: z.string().uuid(),
  method: z.string(),
  params: z.record(z.any()).optional(),
  timestamp: z.string().datetime()
});

export const MCPResponseSchema = z.object({
  id: z.string().uuid(),
  result: z.any().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.any().optional()
  }).optional(),
  timestamp: z.string().datetime()
});

export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()).optional()
});

// Vector DB Types
export const VectorEmbeddingSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  metadata: z.object({
    content: z.string(),
    filePath: z.string(),
    lineStart: z.number(),
    lineEnd: z.number(),
    type: z.enum(['code', 'comment', 'documentation'])
  }),
  timestamp: z.string().datetime()
});

// AI Agent Types
export const AIFixSuggestionSchema = z.object({
  originalCode: z.string(),
  suggestedCode: z.string(),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  autoApplicable: z.boolean()
});

export const AIReviewRequestSchema = z.object({
  prNumber: z.number(),
  repository: z.string(),
  files: z.array(FileDiffSchema),
  context: z.object({
    repoContext: z.array(VectorEmbeddingSchema).optional(),
    previousReviews: z.array(CodeReviewCommentSchema).optional()
  }).optional()
});

export const AIReviewResponseSchema = z.object({
  reviewId: z.string().uuid(),
  comments: z.array(CodeReviewCommentSchema),
  summary: z.string(),
  statistics: z.object({
    totalComments: z.number(),
    criticalIssues: z.number(),
    highConfidence: z.number(),
    autoFixable: z.number()
  })
});

// WebSocket Message Types
export const WebSocketMessageSchema = z.object({
  type: z.enum(['notification', 'request', 'response', 'error']),
  payload: z.any(),
  timestamp: z.string().datetime(),
  source: z.string()
});

// Type exports
export type GitHubPullRequest = z.infer<typeof GitHubPullRequestSchema>;
export type GitHubComment = z.infer<typeof GitHubCommentSchema>;
export type FileDiff = z.infer<typeof FileDiffSchema>;
export type ReviewSeverity = z.infer<typeof ReviewSeveritySchema>;
export type ReviewCategory = z.infer<typeof ReviewCategorySchema>;
export type CodeReviewComment = z.infer<typeof CodeReviewCommentSchema>;
export type MCPRequest = z.infer<typeof MCPRequestSchema>;
export type MCPResponse = z.infer<typeof MCPResponseSchema>;
export type MCPTool = z.infer<typeof MCPToolSchema>;
export type VectorEmbedding = z.infer<typeof VectorEmbeddingSchema>;
export type AIFixSuggestion = z.infer<typeof AIFixSuggestionSchema>;
export type AIReviewRequest = z.infer<typeof AIReviewRequestSchema>;
export type AIReviewResponse = z.infer<typeof AIReviewResponseSchema>;
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;