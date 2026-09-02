import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/family-memory-intent.test.ts',
      'src/family-memory-subject.test.ts',
      'src/family-memory-intent-executor.test.ts',
      'src/family-memory-response.test.ts',
      'src/family-memory-route-boundary.test.ts',
    ],
  },
});
