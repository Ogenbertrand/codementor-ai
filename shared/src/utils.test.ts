import { 
  generateId, 
  hashContent, 
  truncateText, 
  calculateStringSimilarity,
  debounce,
  throttle,
  RateLimiter,
  SimpleCache,
  EventEmitter
} from './utils';

describe('Utils', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1.length).toBe(36); // UUID length
    });
  });

  describe('hashContent', () => {
    it('should generate consistent hash', () => {
      const content = 'test content';
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    it('should generate different hashes for different content', () => {
      const hash1 = hashContent('content 1');
      const hash2 = hashContent('content 2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('truncateText', () => {
    it('should not truncate short text', () => {
      const text = 'Short text';
      const result = truncateText(text, 20);
      
      expect(result).toBe(text);
    });

    it('should truncate long text', () => {
      const text = 'This is a very long text that should be truncated';
      const result = truncateText(text, 20);
      
      expect(result).toHaveLength(20);
      expect(result).toMatch(/\.\.\.$/);
    });
  });

  describe('calculateStringSimilarity', () => {
    it('should return 1 for identical strings', () => {
      const str = 'identical string';
      const similarity = calculateStringSimilarity(str, str);
      
      expect(similarity).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      const similarity = calculateStringSimilarity('abc', 'xyz');
      
      expect(similarity).toBe(0);
    });

    it('should calculate similarity for partial matches', () => {
      const similarity = calculateStringSimilarity('hello world', 'hello earth');
      
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should be case insensitive', () => {
      const similarity1 = calculateStringSimilarity('Hello World', 'hello world');
      const similarity2 = calculateStringSimilarity('HELLO', 'hello');
      
      expect(similarity1).toBe(1);
      expect(similarity2).toBe(1);
    });
  });

  describe('debounce', () => {
    jest.useFakeTimers();

    it('should delay function execution', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset delay on multiple calls', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      jest.advanceTimersByTime(50);
      debouncedFn();
      jest.advanceTimersByTime(50);
      
      expect(fn).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments correctly', () => {
      const fn = jest.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('arg1', 'arg2');
      jest.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('throttle', () => {
    jest.useFakeTimers();

    it('should limit function execution rate', () => {
      const fn = jest.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      throttledFn();
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      throttledFn();

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should pass arguments correctly', () => {
      const fn = jest.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn('arg1', 'arg2');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('RateLimiter', () => {
    jest.useFakeTimers();

    it('should allow requests within rate limit', async () => {
      const limiter = new RateLimiter(2, 1); // 2 tokens per second
      
      const start = Date.now();
      await limiter.acquire();
      await limiter.acquire();
      const end = Date.now();
      
      expect(end - start).toBeLessThan(100);
    });

    it('should delay requests when rate limit exceeded', async () => {
      const limiter = new RateLimiter(1, 1); // 1 token per second
      
      const start = Date.now();
      await limiter.acquire();
      await limiter.acquire();
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(1000);
    });

    it('should handle concurrent requests', async () => {
      const limiter = new RateLimiter(2, 1);
      
      const promises = [
        limiter.acquire(),
        limiter.acquire(),
        limiter.acquire()
      ];

      jest.advanceTimersByTime(1000);
      await Promise.all(promises);
    });
  });

  describe('SimpleCache', () => {
    jest.useFakeTimers();

    it('should store and retrieve values', () => {
      const cache = new SimpleCache();
      const key = 'test-key';
      const value = { data: 'test-value' };

      cache.set(key, value);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for expired values', () => {
      const cache = new SimpleCache(1000); // 1 second TTL
      const key = 'test-key';
      const value = 'test-value';

      cache.set(key, value);
      jest.advanceTimersByTime(2000);

      const retrieved = cache.get(key);
      expect(retrieved).toBeNull();
    });

    it('should delete values', () => {
      const cache = new SimpleCache();
      const key = 'test-key';
      const value = 'test-value';

      cache.set(key, value);
      expect(cache.get(key)).toBe(value);

      cache.delete(key);
      expect(cache.get(key)).toBeNull();
    });

    it('should clear all values', () => {
      const cache = new SimpleCache();
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');

      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });

    it('should clean up expired entries', () => {
      const cache = new SimpleCache(1000);
      
      cache.set('key1', 'value1');
      jest.advanceTimersByTime(500);
      cache.set('key2', 'value2');
      jest.advanceTimersByTime(600);

      cache.cleanup();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('EventEmitter', () => {
    it('should emit events to listeners', () => {
      const emitter = new EventEmitter<string>();
      const listener = jest.fn();

      emitter.on('test-event', listener);
      emitter.emit('test-event', 'test-data');

      expect(listener).toHaveBeenCalledWith('test-data');
    });

    it('should support multiple listeners', () => {
      const emitter = new EventEmitter<number>();
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      emitter.emit('test-event', 42);

      expect(listener1).toHaveBeenCalledWith(42);
      expect(listener2).toHaveBeenCalledWith(42);
    });

    it('should remove listeners', () => {
      const emitter = new EventEmitter<string>();
      const listener = jest.fn();

      emitter.on('test-event', listener);
      emitter.emit('test-event', 'data1');
      
      emitter.off('test-event', listener);
      emitter.emit('test-event', 'data2');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('data1');
    });

    it('should remove all listeners for an event', () => {
      const emitter = new EventEmitter<string>();
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      
      emitter.removeAllListeners('test-event');
      emitter.emit('test-event', 'data');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should remove all listeners', () => {
      const emitter = new EventEmitter<string>();
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      emitter.on('event1', listener1);
      emitter.on('event2', listener2);
      
      emitter.removeAllListeners();
      emitter.emit('event1', 'data1');
      emitter.emit('event2', 'data2');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });
});