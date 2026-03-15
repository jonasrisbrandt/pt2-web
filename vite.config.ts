import { defineConfig } from 'vite';
import packageJson from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: {
    target: 'es2022',
  },
});
