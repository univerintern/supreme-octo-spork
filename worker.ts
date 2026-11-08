/**
 * Cloudflare Worker: worker.ts
 * Re-exports the complete secure LI.FI proxy and backend engine from src/worker.ts
 */
export { default } from './src/worker.js';
export type { Env } from './src/worker.js';
