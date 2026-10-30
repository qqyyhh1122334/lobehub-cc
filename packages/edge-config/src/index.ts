import type { EdgeConfigData, EdgeConfigKeys } from './types';

/** Local JSON configuration supplied by the operator; no external configuration service. */
export class EdgeConfig {
  static isEnabled() {
    return !!process.env.INTRANET_EDGE_CONFIG_JSON;
  }

  private read(): EdgeConfigData {
    const raw = process.env.INTRANET_EDGE_CONFIG_JSON;
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('INTRANET_EDGE_CONFIG_JSON must contain a JSON object');
    }
    return parsed as EdgeConfigData;
  }

  async getValue<K extends EdgeConfigKeys>(key: K): Promise<EdgeConfigData[K]> {
    return this.read()[key];
  }
  async getValues<const K extends EdgeConfigKeys>(keys: K[]): Promise<Pick<EdgeConfigData, K>> {
    const data = this.read();
    return Object.fromEntries(keys.map((key) => [key, data[key]])) as Pick<EdgeConfigData, K>;
  }
  getAgentRestrictions = async () => {
    const { assistant_blacklist: blacklist, assistant_whitelist: whitelist } = await this.getValues(
      ['assistant_blacklist', 'assistant_whitelist'],
    );
    return { blacklist, whitelist };
  };
  getFeatureFlags = async () => this.getValue('feature_flags');
  getBillboards = async () => this.getValue('billboards');
}
export * from './types';
