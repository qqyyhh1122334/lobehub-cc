import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.argv[2] || join(dir, 'bundle'));
const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
if (manifest.schema !== 1 || manifest.baseCommit !== '049c81d53b0c2282eabf1edca2d90d58ad1f60f0')
  throw new Error('Unexpected bundle schema/base commit');
const hash = createHash('sha256');
for await (const chunk of createReadStream(join(source, 'images.tar'))) hash.update(chunk);
if (hash.digest('hex') !== manifest.archiveSha256)
  throw new Error('Image archive checksum mismatch');
const docker = (...args) =>
  execFileSync('docker', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 32 * 1024 * 1024,
  });
docker('image', 'load', '--input', join(source, 'images.tar'));
for (const item of manifest.images) {
  const [actual] = JSON.parse(docker('image', 'inspect', item.tag));
  if (actual.Id !== item.id || actual.Architecture !== item.architecture || actual.Os !== item.os)
    throw new Error(`Image identity mismatch: ${item.tag}`);
}
const needed = [
  ...new Set(docker('compose', '-f', 'compose.yaml', 'config', '--images').trim().split('\n')),
];
if (needed.some((tag) => !manifest.images.some((item) => item.tag === tag)))
  throw new Error('Compose requires an image absent from the verified bundle');
console.log(
  `Verified and imported ${manifest.images.length} images. Start with: docker compose -f compose.yaml up -d --pull never`,
);
