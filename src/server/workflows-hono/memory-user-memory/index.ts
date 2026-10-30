import { Hono } from 'hono';
import { disabledCloudRoute } from '@/libs/intranet/disabled';
const app = new Hono();
app.all('*', () => disabledCloudRoute());
export default app;
