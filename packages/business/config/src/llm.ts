import type { ModelProviderCard, UserModelProviderConfig } from '@lobechat/types';
import { ModelProvider } from 'model-bank';
import * as ProviderCards from 'model-bank/modelProviders';

const genUserLLMConfig = (specificConfig: Record<any, any>): UserModelProviderConfig => {
  return Object.keys(ModelProvider).reduce((config, providerKey) => {
    const provider = ModelProvider[providerKey as keyof typeof ModelProvider];
    const providerCard = ProviderCards[
      `${providerKey}ProviderCard` as keyof typeof ProviderCards
    ] as ModelProviderCard;
    const providerConfig = specificConfig[provider as keyof typeof specificConfig] || {};

    config[provider] = {
      enabled: providerConfig.enabled !== undefined ? providerConfig.enabled : false,
      enabledModels: providerCard ? ProviderCards.filterEnabledModels(providerCard) : [],
      ...(providerConfig.fetchOnClient !== undefined && {
        fetchOnClient: providerConfig.fetchOnClient,
      }),
    };

    return config;
  }, {} as UserModelProviderConfig);
};

// Never enable browser-side inference or public model defaults in this web build.
export const DEFAULT_LLM_CONFIG = genUserLLMConfig({
  ollama: {
    enabled: true,
    fetchOnClient: false,
  },
  lmstudio: { fetchOnClient: false },
  openai: { fetchOnClient: false },
  vllm: { fetchOnClient: false },
  xinference: { fetchOnClient: false },
  comfyui: { fetchOnClient: false },
});
