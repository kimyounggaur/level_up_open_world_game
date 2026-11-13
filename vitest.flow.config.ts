import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// 흐름 테스트(브라우저). 먼저 `npm run build`가 필요하다. `npm run test:flow`
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/flow/**/*.flow.ts'],
    environment: 'node',
    testTimeout: 90000,
    hookTimeout: 90000,
    fileParallelism: false,
  },
});
