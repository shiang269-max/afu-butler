import {
  defineConfig,
} from 'vitest/config';


export default defineConfig({

  test: {

    include: [

      'src/**/*.test.ts',

    ],

    exclude: [
      'src/family-memory.test.ts',
      'src/family-memory-v2.test.ts',
      'src/family-memory-integrity.test.ts',
      'src/family-memory-input-integrity.test.ts',
      'src/family-memory-persistence.test.ts',
      'src/family-memory-query-edge.test.ts',
      'src/family-memory-crud-edge.test.ts',
      'src/family-memory-statistics-boundary.test.ts',
      'src/family-memory-concurrency.test.ts',
      'src/family-memory-shared-file.test.ts',
      'src/family-memory-integration.test.ts',
      'src/family-memory-intent-executor.test.ts',
      'src/family-memory-existing-function-guard.test.ts',
      'src/family-memory-route-boundary.test.ts',
      'src/family-memory-response.test.ts',
    ],

  },

});