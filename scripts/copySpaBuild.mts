import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const spaDir = path.resolve(root, 'public/_spa');
const distDirs = ['desktop', 'mobile'] as const;
const copyDirs = ['assets', 'i18n', 'vendor'] as const;

mkdirSync(spaDir, { recursive: true });

// Vite rewrites these public URLs to /_spa/ in the generated HTML. The Next
// runtime therefore needs the same files at that prefix, before any SPA JS runs.
for (const filename of ['intranet-browser-guard.js', 'favicon.ico', 'favicon-32x32.ico']) {
  const source = path.resolve(root, 'public', filename);
  if (!existsSync(source)) throw new Error(`Missing offline SPA bootstrap asset: ${source}`);
  cpSync(source, path.resolve(spaDir, filename));
}

for (const distDir of distDirs) {
  for (const dir of copyDirs) {
    const sourceDir = path.resolve(root, `dist/${distDir}/${dir}`);
    const targetDir = path.resolve(spaDir, dir);

    if (!existsSync(sourceDir)) continue;

    cpSync(sourceDir, targetDir, { recursive: true });
    console.log(`Copied dist/${distDir}/${dir} -> public/_spa/${dir}`);
  }
}

// PDF.js otherwise fetches CMaps/fonts from a public CDN. Copy the pinned package assets.
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  const source = path.resolve(root, 'node_modules/pdfjs-dist', dir);
  if (!existsSync(source)) throw new Error(`Missing offline PDF.js assets: ${source}`);
  cpSync(source, path.resolve(spaDir, 'pdfjs', dir), { recursive: true });
}
