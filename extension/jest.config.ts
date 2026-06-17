/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@content/(.*)$': '<rootDir>/src/content/$1',
    '^@background/(.*)$': '<rootDir>/src/background/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        moduleResolution: 'bundler',
        types: ['jest', 'chrome'],
      },
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterSetup: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/shared/**/*.ts',
    'src/services/**/*.ts',
    'src/content/engine/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
