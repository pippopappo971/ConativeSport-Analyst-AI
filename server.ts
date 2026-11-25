import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './serverApp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCliArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const eqArg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eqArg ? eqArg.slice(flag.length + 1) : undefined;
}

async function startServer() {
  const app = createApiApp();
  const cliPort = getCliArg('--port');
  const cliHost = getCliArg('--host');
  const rawPort = cliPort || process.env.PORT || '3000';
  const parsedPort = parseInt(rawPort, 10);
  const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  const HOST = cliHost || '0.0.0.0';

  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;

  // In development, attach Vite dev server middleware (with HMR disabled for iframe/pre-warm stability)
  if (process.env.NODE_ENV !== 'production') {
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    // In production, serve dist folder
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`ConativeSport Analyst running on port ${PORT}`);
  });

  server.on('error', (err) => {
    console.error('Server listen error:', err);
    process.exit(1);
  });

  const shutdown = async () => {
    try {
      await viteServer?.close();
    } catch {
      // ignore close error
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
