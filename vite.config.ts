import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// 릴리스 채널: preview(기본)는 검수 전 콘텐츠를 '검수 전' 표지와 함께 연다. release는 '준비 중'으로 둔다(결정 D-12).
const channel = process.env.VITE_RELEASE_CHANNEL === 'release' ? 'release' : 'preview';

export default defineConfig({
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  define: { __RELEASE_CHANNEL__: JSON.stringify(channel) },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 3000 },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 30000,
  },
});
