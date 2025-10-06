import crypto from 'crypto';
import { createHash } from 'crypto';

/**
 * Generate a unique identifier
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Create a hash from content
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Calculate similarity between two strings using Jaccard similarity
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.toLowerCase().split(/\s+/));
  const set2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Parse GitHub file path and line number from diff
 */
export function parseDiffLocation(diffLine: string): { file: string; line: number } | null {
  const match = diffLine.match(/^\+\+\+ b\/(.*)$/);
  if (match) {
    return { file: match[1], line: 0 };
  }
  
  const lineMatch = diffLine.match(/^@@ -\d+,\d+ \/\* (\d+),\d+ @@/);
  if (lineMatch) {
    return { file: '', line: parseInt(lineMatch[1]) };
  }
  
  return null;
}

/**
 * Extract code context around a specific line
 */
export function extractCodeContext(
  code: string,
  lineNumber: number,
  contextLines: number = 3
): string {
  const lines = code.split('\n');
  const start = Math.max(0, lineNumber - contextLines - 1);
  const end = Math.min(lines.length, lineNumber + contextLines);
  
  return lines.slice(start, end).join('\n');
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate and sanitize file path
 */
export function sanitizeFilePath(filePath: string): string {
  // Remove any potentially dangerous characters
  return filePath.replace(/[<>:"|?*]/g, '').replace(/\.\./g, '');
}

/**
 * Check if a file should be reviewed based on extension
 */
export function shouldReviewFile(fileName: string, supportedExtensions: string[]): boolean {
  const ext = fileName.substring(fileName.lastIndexOf('.'));
  return supportedExtensions.includes(ext);
}

/**
 * Create a retry wrapper for async functions
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  func: T,
  maxRetries: number = 3,
  delay: number = 1000
): (...args: Parameters<T>) => Promise<any> {
  return async (...args: Parameters<T>) => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await func(...args);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
    
    throw lastError!;
  };
}

/**
 * Rate limiter implementation
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,
    private refillRate: number, // tokens per second
    private refillPeriod: number = 1000 // milliseconds
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  async acquire(tokens: number = 1): Promise<void> {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }
    
    const waitTime = Math.ceil((tokens - this.tokens) * this.refillPeriod / this.refillRate);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return this.acquire(tokens);
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor((timePassed * this.refillRate) / this.refillPeriod);
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

/**
 * Simple in-memory cache with TTL
 */
export class SimpleCache<T> {
  private cache = new Map<string, { value: T; expires: number }>();
  
  constructor(private defaultTtl: number = 3600000) {} // 1 hour default
  
  set(key: string, value: T, ttl?: number): void {
    const expires = Date.now() + (ttl || this.defaultTtl);
    this.cache.set(key, { value, expires });
  }
  
  get(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Event emitter for inter-component communication
 */
export class EventEmitter<T = any> {
  private listeners = new Map<string, Array<(data: T) => void>>();
  
  on(event: string, callback: (data: T) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }
  
  off(event: string, callback: (data: T) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }
  
  emit(event: string, data: T): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data));
    }
  }
  
  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}