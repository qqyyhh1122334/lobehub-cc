import { type Locales } from '@/locales/resources';
import { unavailable } from '@/server/intranet/services';

export class AssistantStore {
  constructor(_baseUrl?: string) {}

  getAgentUrl = (_identifier: string, _lang?: Locales): string =>
    unavailable('Remote agent catalog');

  getAgentIndex = async (_locale?: Locales): Promise<any[]> => [];

  getAgent = async (_identifier: string, _lang?: Locales): Promise<any> =>
    unavailable('Remote agent catalog');
}
