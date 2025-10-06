import 'jest';

// Global test setup
beforeAll(() => {
  // Set up global test environment
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Clean up global test environment
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific log levels in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};