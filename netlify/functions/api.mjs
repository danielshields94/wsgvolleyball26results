// Netlify Function: serves /api/data, /api/login and /api/write for the WSG Volleyball site.
import { getStore } from '@netlify/blobs';
import { createHandler } from '../lib/api.mjs';

const handler = createHandler({
  getStore: () => getStore({ name: 'wsg-volleyball', consistency: 'strong' }),
  env: (k) => (globalThis.Netlify?.env?.get(k)) ?? process.env[k],
});

export default handler;

export const config = { path: ['/api/data', '/api/login', '/api/write'] };
