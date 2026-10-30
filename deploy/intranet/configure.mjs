import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import validators from './validate-env.cjs';

const dir = dirname(fileURLToPath(import.meta.url));
if (process.argv.slice(2).length % 2) throw new Error('Every option requires a value');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, all) => {
    if (index % 2 === 0) pairs.push([value, all[index + 1]]);
    return pairs;
  }, []),
);
if (Object.keys(args).some((key) => !['--host', '--emails', '--models'].includes(key)))
  throw new Error('Unknown option');
const host = args['--host'] || 'lobehub.internal';
const emails = args['--emails'];
const models = args['--models'] || 'qwen3:8b,bge-m3';
if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+internal$/.test(host))
  throw new Error('--host must be a DNS name under .internal');
validators.validateAllowedEmails(emails);
if (/[\r\n$]/.test(emails)) throw new Error('Invalid .env control characters in --emails');
if (!/^[a-zA-Z0-9_:.,/+@-]+$/.test(models)) throw new Error('Unsupported characters in --models');
if (existsSync(join(dir, '.env')))
  throw new Error('.env already exists; refusing to overwrite secrets');
const secret = () => randomBytes(32).toString('hex');
writeFileSync(
  join(dir, '.env'),
  `LOBE_HOST=${host}\nBIND_IP=127.0.0.1\nAUTH_ALLOWED_EMAILS=${emails}\nOLLAMA_MODEL_LIST=${models}\nAUTH_SECRET=${secret()}\nKEY_VAULTS_SECRET=${randomBytes(32).toString('base64')}\nPOSTGRES_PASSWORD=${secret()}\nS3_ACCESS_KEY_ID=lobe${randomBytes(8).toString('hex')}\nS3_SECRET_ACCESS_KEY=${secret()}\n`,
  { mode: 0o600, flag: 'wx' },
);
writeFileSync(
  join(dir, 'Corefile'),
  `${host}:53 {\n    hosts {\n        127.0.0.1 ${host}\n    }\n}\n.:53 {\n    errors\n    template IN ANY . {\n        rcode NXDOMAIN\n    }\n}\n`,
);
mkdirSync(join(dir, 'certs'), { recursive: true, mode: 0o750 });
mkdirSync(join(dir, 'model-data'), { recursive: true, mode: 0o750 });
console.log(
  'Created private .env and authoritative DNS configuration. Supply certs/cert.pem, key.pem, ca.pem, and preloaded model-data before starting.',
);
