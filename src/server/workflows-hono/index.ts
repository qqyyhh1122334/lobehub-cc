import { Hono } from 'hono';
import { disabledCloudRoute } from '@/libs/intranet/disabled';

const app = new Hono().basePath('/api/workflows');
app.all('*', () => disabledCloudRoute());
export default app;
