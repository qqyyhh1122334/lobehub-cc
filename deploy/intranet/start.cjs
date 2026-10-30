'use strict';

const { spawn } = require('node:child_process');
const { CreateBucketCommand, HeadBucketCommand, S3Client } = require('@aws-sdk/client-s3');
const { validateEnv } = require('./validate-env.cjs');

let child;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => (child ? child.kill(signal) : process.exit(1)));

function run(file) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [file], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${file} stopped (${signal || code})`)),
    );
  });
}

async function ensureBucket() {
  const s3 = new S3Client({
    endpoint: 'http://172.30.90.12:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: 'lobehub-files' }));
        return;
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound') {
          await s3.send(new CreateBucketCommand({ Bucket: 'lobehub-files' }));
          return;
        }
        if (error.$metadata?.httpStatusCode === 403)
          throw new Error('Storage credentials rejected');
        if (attempt === 29) throw new Error('Internal storage did not become ready');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  } finally {
    s3.destroy();
  }
}

(async () => {
  validateEnv();
  await ensureBucket();
  await run('/app/docker.cjs');
  await run('/app/server.js');
})().catch((error) => {
  // Avoid printing connection strings or credentials from underlying SDK errors.
  console.error(`Intranet startup failed: ${error.message}`);
  process.exitCode = 1;
});
