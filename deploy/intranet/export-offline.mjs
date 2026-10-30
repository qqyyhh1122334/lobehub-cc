import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const destination = resolve(process.argv[2] || join(dir, 'bundle'));
mkdirSync(destination, { recursive: true });
if (existsSync(join(destination, 'images.tar')))
  throw new Error('Destination images.tar already exists');
const docker = (...args) =>
  execFileSync('docker', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 32 * 1024 * 1024,
  });
// Never pull here. Image acquisition/build is a separate, explicit connected step.
const images = [
  ...new Set(docker('compose', '-f', 'compose.yaml', 'config', '--images').trim().split('\n')),
];
const manifest = {
  schema: 1,
  baseCommit: '049c81d53b0c2282eabf1edca2d90d58ad1f60f0',
  exportedAt: new Date().toISOString(),
  images: images.map((tag) => {
    const [info] = JSON.parse(docker('image', 'inspect', tag));
    return {
      tag,
      id: info.Id,
      architecture: info.Architecture,
      os: info.Os,
      repoDigests: info.RepoDigests || [],
    };
  }),
};
docker('image', 'save', '--output', join(destination, 'images.tar'), ...images);
const hash = createHash('sha256');
for await (const chunk of createReadStream(join(destination, 'images.tar'))) hash.update(chunk);
manifest.archiveSha256 = hash.digest('hex');
writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Exported ${images.length} local images to ${destination}; no credentials or models are in this bundle.`,
);
