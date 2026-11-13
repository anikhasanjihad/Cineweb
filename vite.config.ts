import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

import {execSync} from 'node:child_process';

const sha = (process.env.VERCEL_GIT_COMMIT_SHA || (() => { try { return execSync('git rev-parse HEAD').toString(); } catch { return 'local'; } })()).slice(0, 7);
const stamp = `${sha} · ${new Date().toISOString().slice(5, 16).replace('T', ' ')}`;

export default defineConfig({
  define: {__BUILD__: JSON.stringify(stamp)},
  plugins: [react()],
  worker: {format: 'es'},
  build: {target: 'es2021', chunkSizeWarningLimit: 1500},
  test: {environment: 'node'},
});
