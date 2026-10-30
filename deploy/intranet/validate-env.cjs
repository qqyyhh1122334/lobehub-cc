'use strict';

function validateAllowedEmails(value) {
  const domain =
    '[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+';
  const pattern = new RegExp(`^(?:[a-zA-Z0-9_.+-]+@)?${domain}$`);
  if (typeof value !== 'string' || value.split(',').some((token) => !pattern.test(token.trim())))
    throw new Error('AUTH_ALLOWED_EMAILS must contain valid, nonempty emails or domains');
  return true;
}

function validateEnv(env = process.env) {
  const required = [
    'APP_URL',
    'DATABASE_URL',
    'AUTH_SECRET',
    'KEY_VAULTS_SECRET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'AUTH_ALLOWED_EMAILS',
    'OLLAMA_MODEL_LIST',
  ];
  for (const name of required)
    if (!env[name]) throw new Error(`Required environment variable is missing: ${name}`);
  validateAllowedEmails(env.AUTH_ALLOWED_EMAILS);
  if (env.HOSTNAME !== '127.0.0.1' || env.PORT !== '3210')
    throw new Error('The application must listen on 127.0.0.1:3210 in the shared nginx namespace');
  for (const name of ['AUTH_SECRET', 'KEY_VAULTS_SECRET', 'S3_SECRET_ACCESS_KEY']) {
    if (env[name].length < 32 || /placeholder|change.?me|example/i.test(env[name]))
      throw new Error(`Use a unique random secret for ${name}`);
  }
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(env.KEY_VAULTS_SECRET) ||
    Buffer.from(env.KEY_VAULTS_SECRET, 'base64').length !== 32 ||
    Buffer.from(env.KEY_VAULTS_SECRET, 'base64').toString('base64') !== env.KEY_VAULTS_SECRET
  )
    throw new Error('KEY_VAULTS_SECRET must be base64 encoding of 32 random bytes');
  if (
    /placeholder|change.?me|example/i.test(
      Buffer.from(env.KEY_VAULTS_SECRET, 'base64').toString('utf8'),
    )
  )
    throw new Error('A build placeholder is not a runtime vault secret');
  const app = new URL(env.APP_URL);
  if (
    app.protocol !== 'https:' ||
    !app.hostname.endsWith('.internal') ||
    app.port !== '8443' ||
    app.username ||
    app.password ||
    app.pathname !== '/' ||
    app.search ||
    app.hash
  )
    throw new Error('APP_URL must be an HTTPS .internal origin using port 8443');
  if (env.S3_ENDPOINT !== env.APP_URL || env.S3_BUCKET !== 'lobehub-files')
    throw new Error('S3 must use the same origin and the fixed lobehub-files bucket');
  const database = new URL(env.DATABASE_URL);
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== '172.30.90.10' ||
    database.port !== '5432' ||
    database.pathname !== '/lobehub'
  )
    throw new Error('DATABASE_URL must point to the isolated database');
  if (env.REDIS_URL !== 'redis://172.30.90.11:6379') throw new Error('Unexpected Redis endpoint');
  if (env.OLLAMA_PROXY_URL !== 'http://172.30.90.13:11434')
    throw new Error('Unexpected local model endpoint');
  for (const name of [
    'PROXY_URL',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'AUTH_SSO_PROVIDERS',
  ]) {
    if (env[name]) throw new Error(`Not supported in the isolated deployment: ${name}`);
  }
  if (
    env.AUTH_DISABLE_EMAIL_PASSWORD !== '0' ||
    env.AUTH_EMAIL_VERIFICATION !== '0' ||
    env.AUTH_ENABLE_MAGIC_LINK !== '0'
  )
    throw new Error('Use the local password authentication configuration');
  return true;
}

module.exports = { validateAllowedEmails, validateEnv };
