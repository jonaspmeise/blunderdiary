import { relative, resolve } from 'node:path';

const port = Number(process.env.PORT ?? 3000);
const distDirectory = resolve('./dist');

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const requestedPath =
      url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const filePath = resolve(distDirectory, requestedPath);
    if (relative(distDirectory, filePath).startsWith('..')) {
      return new Response('Not found', { status: 404 });
    }
    const file = Bun.file(filePath);
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});

console.log(`Blunder diary is running at http://localhost:${port}`);
