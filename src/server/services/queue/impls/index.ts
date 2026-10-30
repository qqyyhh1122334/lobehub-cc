import { LocalQueueServiceImpl } from './local';
import type { QueueServiceImpl } from './type';

/** This edition never selects a cloud queue, including with legacy cloud environment variables. */
export const isQueueAgentRuntimeEnabled = (): boolean => false;
export const createQueueServiceModule = (): QueueServiceImpl => new LocalQueueServiceImpl();

export { LocalQueueServiceImpl } from './local';
export type { QueueServiceImpl } from './type';
