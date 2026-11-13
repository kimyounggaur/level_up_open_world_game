/// <reference types="vite/client" />

// vite.config.ts의 define으로 채워진다. 'preview' | 'release' (결정 D-12)
declare const __RELEASE_CHANNEL__: 'preview' | 'release';
