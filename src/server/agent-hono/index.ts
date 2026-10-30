import { Hono } from 'hono';

import { disabledCloudRoute } from '@/libs/intranet/disabled';

import { execAgent } from './handlers/execAgent';
import { finalizeAbandoned } from './handlers/finalizeAbandoned';
import { toolResult } from './handlers/toolResult';
import { bearerSecretAuth } from './middlewares/bearerSecretAuth';
import { serviceTokenAuth } from './middlewares/serviceTokenAuth';

const app = new Hono().basePath('/api/agent');

// Explicit local administrative API; no cloud signature can authenticate this route.
app.post(
  '/',
  bearerSecretAuth(() => process.env.AGENT_EXEC_API_KEY),
  execAgent,
);
app.post('/tool-result', serviceTokenAuth(), toolResult);
app.post('/finalize-abandoned', serviceTokenAuth(), finalizeAbandoned);

// Public bot platforms, cloud gateways and QStash callbacks are removed.
app.all('/run', () => disabledCloudRoute());
app.all('/gateway', () => disabledCloudRoute());
app.all('/gateway/*', () => disabledCloudRoute());
app.all('/webhooks/*', () => disabledCloudRoute());
app.all('/messenger/*', () => disabledCloudRoute());

export default app;
