import { defineConfig } from 'vite';

// NO_HMR=1: no websocket, so saves by other people/agents never reload an open test page (reload manually).
const noHmr = !!process.env.NO_HMR;

export default defineConfig({
  server: { host: true, hmr: noHmr ? false : undefined, ws: noHmr ? false : undefined },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
