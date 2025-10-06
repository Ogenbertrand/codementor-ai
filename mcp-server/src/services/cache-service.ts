import Redis from 'ioredis';
import { Logger } from '../utils/logger';
import { config } from '../config';

export class CacheService {
  private redis?: Redis;
  private logger: Logger;
  private localCache: Map<string, { value: any; expires: number }>;

  constructor() {
    this.logger = new Logger('cache-service');
    this.localCache = new Map();

    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true
      } as any);

      this.redis.on('connect', () => {
        this.logger.info('Connected to Redis');
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error', { error });
      });

      // Connect to Redis
      this.redis.connect().catch(error => {
        this.logger.error('Failed to connect to Redis', { error });
      });
    }

    // Clean up expired local cache entries every minute
    setInterval(() => this.cleanupLocalCache(), 60000);
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<any | null> {
    try {
      // Try Redis first
      if (this.redis) {
        const value = await this.redis.get(key);
        if (value) {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
      }

      // Fallback to local cache
      const cached = this.localCache.get(key);
      if (cached) {
        if (Date.now() < cached.expires) {
          return cached.value;
        } else {
          this.localCache.delete(key);
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Cache get error', { key, error });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      
      // Store in Redis if available
      if (this.redis) {
        await this.redis.setex(key, ttlSeconds, serialized);
      }

      // Always store in local cache as fallback
      this.localCache.set(key, {
        value,
        expires: Date.now() + (ttlSeconds * 1000)
      });

      this.logger.debug('Cache set', { key, ttlSeconds });
    } catch (error) {
      this.logger.error('Cache set error', { key, error });
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.del(key);
      }
      this.localCache.delete(key);
      this.logger.debug('Cache deleted', { key });
    } catch (error) {
      this.logger.error('Cache delete error', { key, error });
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.flushall();
      }
      this.localCache.clear();
      this.logger.info('Cache cleared');
    } catch (error) {
      this.logger.error('Cache clear error', { error });
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    const stats = {
      localCache: {
        size: this.localCache.size,
        keys: Array.from(this.localCache.keys())
      },
      redis: {
        connected: this.redis?.status === 'ready'
      }
    };

    if (this.redis && stats.redis.connected) {
      try {
        const info = await this.redis.info('memory');
        const memoryMatch = info.match(/used_memory_human:(\S+)/);
        (stats.redis as any).memory = memoryMatch ? memoryMatch[1] : 'unknown';
        
        const keys = await this.redis.dbsize();
        (stats.redis as any).keys = keys;
      } catch (error) {
        this.logger.error('Error getting Redis stats', { error });
      }
    }

    return stats;
  }

  /**
   * Clean up expired local cache entries
   */
  private cleanupLocalCache(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, entry] of this.localCache.entries()) {
      if (now > entry.expires) {
        this.localCache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logger.debug('Local cache cleanup', { deletedCount, remaining: this.localCache.size });
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
      this.logger.info('Redis connection closed');
    }
  }
}