import { rm } from 'node:fs/promises';

export {};

await rm('./dist', { recursive: true, force: true });

const buildResult = await Bun.build({
  entrypoints: ['./src/index.html'],
  outdir: './dist',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
  naming: '[dir]/[name].[ext]',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});

if (!buildResult.success) {
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

await Promise.all([
  Bun.write(
    './dist/stockfish-18-lite-single.js',
    Bun.file('./node_modules/stockfish/bin/stockfish-18-lite-single.js')
  ),
  Bun.write(
    './dist/stockfish-18-lite-single.wasm',
    Bun.file('./node_modules/stockfish/bin/stockfish-18-lite-single.wasm')
  ),
  Bun.write('./dist/STOCKFISH-GPLv3.txt', Bun.file('./node_modules/stockfish/Copying.txt')),
]);

console.log('Built dist/');
