import { type Locales } from '@/locales/resources';
import { unavailable } from '@/server/intranet/services';

export class PluginStore {
  constructor(_baseUrl?: string) {}

  getPluginIndexUrl = (_lang?: Locales): string => unavailable('Remote plugin catalog');

  getPluginList = async (_locale?: string): Promise<any[]> => [];
}
