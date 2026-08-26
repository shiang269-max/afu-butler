import {
  defineConfig,
} from 'vitest/config';


export default defineConfig({

  test: {

    include: [
      'src/call-names.test.ts',
    ],

    exclude: [
      'dist/**',
      'node_modules/**',
    ],

  },

});