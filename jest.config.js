module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    '**/src/**/*.ts',
    '!**/src/**/*.d.ts',
    '!**/src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@codementor-ai/shared$': '<rootDir>/shared/src'
  },
  projects: [
    {
      displayName: 'shared',
      testMatch: ['<rootDir>/shared/src/**/*.test.ts'],
      moduleNameMapper: {
        '^@codementor-ai/shared$': '<rootDir>/shared/src'
      }
    },
    {
      displayName: 'github-app',
      testMatch: ['<rootDir>/github-app/src/**/*.test.ts'],
      moduleNameMapper: {
        '^@codementor-ai/shared$': '<rootDir>/shared/src'
      }
    },
    {
      displayName: 'mcp-server',
      testMatch: ['<rootDir>/mcp-server/src/**/*.test.ts'],
      moduleNameMapper: {
        '^@codementor-ai/shared$': '<rootDir>/shared/src'
      }
    },
    {
      displayName: 'vscode-extension',
      testMatch: ['<rootDir>/vscode-extension/src/**/*.test.ts'],
      moduleNameMapper: {
        '^@codementor-ai/shared$': '<rootDir>/shared/src'
      }
    }
  ]
};