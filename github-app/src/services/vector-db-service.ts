import { PineconeClient } from '@pinecone-database/pinecone';
import { VectorEmbedding, CodeReviewComment, FileDiff } from '@codementor-ai/shared';
import { Logger } from '../utils/logger';
import { config } from '../config';
import { generateId, hashContent } from '@codementor-ai/shared';

export class VectorDBService {
  private client: PineconeClient;
  private index: any;
  private logger: Logger;

  constructor(apiKey: string, indexName: string) {
    this.logger = new Logger('vector-db-service');
    this.client = new PineconeClient();
    
    if (apiKey && indexName) {
      this.initializeClient(apiKey, indexName).catch(error => {
        this.logger.error('Failed to initialize Pinecone client', { error });
      });
    }
  }

  private async initializeClient(apiKey: string, indexName: string): Promise<void> {
    await this.client.init({
      apiKey,
      environment: config.pineconeEnvironment
    });

    this.index = this.client.Index(indexName);
    this.logger.info('Pinecone client initialized successfully');
  }

  /**
   * Index repository files for context
   */
  async indexRepositoryFiles(
    repository: string,
    files: Array<{ path: string; content: string }>
  ): Promise<void> {
    if (!this.index) {
      this.logger.warn('Pinecone not initialized, skipping indexing');
      return;
    }

    try {
      const embeddings = await this.createEmbeddings(files);
      
      for (let i = 0; i < embeddings.length; i += 100) {
        const batch = embeddings.slice(i, i + 100);
        await this.index.upsert({
          upsertRequest: {
            vectors: batch.map(embedding => ({
              id: embedding.id,
              values: embedding.vector,
              metadata: {
                ...embedding.metadata,
                repository
              }
            }))
          }
        });
      }

      this.logger.info('Repository files indexed', { repository, fileCount: files.length });
    } catch (error) {
      this.logger.error('Error indexing repository files', { repository, error });
      throw error;
    }
  }

  /**
   * Query similar code context
   */
  async querySimilarContext(
    repository: string,
    query: string,
    limit: number = 5
  ): Promise<VectorEmbedding[]> {
    if (!this.index) {
      this.logger.warn('Pinecone not initialized, returning empty results');
      return [];
    }

    try {
      const queryEmbedding = await this.createQueryEmbedding(query);
      
      const results = await this.index.query({
        queryRequest: {
          vector: queryEmbedding,
          topK: limit,
          filter: {
            repository: { $eq: repository }
          },
          includeMetadata: true
        }
      });

      return results.matches.map((match: any) => ({
        id: match.id,
        vector: match.values,
        metadata: match.metadata,
        timestamp: match.metadata.timestamp || new Date().toISOString()
      }));
    } catch (error) {
      this.logger.error('Error querying similar context', { repository, query, error });
      return [];
    }
  }

  /**
   * Get context for code review
   */
  async getReviewContext(
    repository: string,
    files: FileDiff[]
  ): Promise<VectorEmbedding[]> {
    const contextQueries = files.map(file => 
      `File: ${file.filename}\nChanges: ${file.patch || ''}`
    );

    const allContext: VectorEmbedding[] = [];
    
    for (const query of contextQueries) {
      const context = await this.querySimilarContext(repository, query, 3);
      allContext.push(...context);
    }

    // Remove duplicates and sort by relevance
    const uniqueContext = allContext.filter((item, index, arr) => 
      arr.findIndex(other => other.id === item.id) === index
    );

    return uniqueContext.slice(0, 10); // Limit to top 10 most relevant
  }

  /**
   * Store review comments for future context
   */
  async storeReviewComments(
    repository: string,
    comments: CodeReviewComment[]
  ): Promise<void> {
    if (!this.index) return;

    try {
      const commentEmbeddings = await Promise.all(
        comments.map(async (comment) => {
          const embedding = await this.createQueryEmbedding(
            `${comment.title}\n${comment.description}\n${comment.suggestion || ''}`
          );
          
          return {
            id: generateId(),
            vector: embedding,
            metadata: {
              content: comment.description,
              filePath: comment.filePath,
              lineStart: comment.lineNumber,
              lineEnd: comment.lineNumber,
              type: 'comment',
              category: comment.category,
              severity: comment.severity,
              repository
            },
            timestamp: new Date().toISOString()
          };
        })
      );

      for (let i = 0; i < commentEmbeddings.length; i += 100) {
        const batch = commentEmbeddings.slice(i, i + 100);
        await this.index.upsert({
          upsertRequest: {
            vectors: batch.map(embedding => ({
              id: embedding.id,
              values: embedding.vector,
              metadata: embedding.metadata
            }))
          }
        });
      }

      this.logger.info('Review comments stored in vector DB', { 
        repository, 
        commentCount: comments.length 
      });
    } catch (error) {
      this.logger.error('Error storing review comments', { repository, error });
    }
  }

  /**
   * Create embeddings for files
   */
  private async createEmbeddings(files: Array<{ path: string; content: string }>): Promise<VectorEmbedding[]> {
    // For MVP, we'll use a simple approach. In production, use OpenAI embeddings
    return files.map(file => {
      const chunks = this.chunkContent(file.content, 1000);
      
      return chunks.map((chunk, index) => ({
        id: generateId(),
        vector: this.createSimpleEmbedding(chunk),
        metadata: {
          content: chunk,
          filePath: file.path,
          lineStart: index * 50 + 1,
          lineEnd: Math.min((index + 1) * 50, file.content.split('\n').length),
          type: 'code' as const
        },
        timestamp: new Date().toISOString()
      }));
    }).flat();
  }

  /**
   * Create embedding for query
   */
  private async createQueryEmbedding(query: string): Promise<number[]> {
    // For MVP, use simple embedding. In production, use OpenAI embeddings
    return this.createSimpleEmbedding(query);
  }

  /**
   * Simple embedding for MVP (replace with OpenAI in production)
   */
  private createSimpleEmbedding(text: string): number[] {
    // Simple hash-based embedding for MVP
    const hash = hashContent(text);
    const embedding = new Array(1536).fill(0);
    
    for (let i = 0; i < hash.length; i += 2) {
      const byte = parseInt(hash.substr(i, 2), 16);
      embedding[i % 1536] = (byte / 255) * 2 - 1; // Normalize to [-1, 1]
    }
    
    return embedding;
  }

  /**
   * Chunk content into smaller pieces
   */
  private chunkContent(content: string, chunkSize: number): string[] {
    const lines = content.split('\n');
    const chunks: string[] = [];
    
    for (let i = 0; i < lines.length; i += chunkSize) {
      chunks.push(lines.slice(i, i + chunkSize).join('\n'));
    }
    
    return chunks;
  }

  /**
   * Check if vector DB is available
   */
  isAvailable(): boolean {
    return !!this.index;
  }
}