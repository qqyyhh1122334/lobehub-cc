import type { ModelProviderCard } from '@/types/llm';

const Ollama: ModelProviderCard = {
  chatModels: [],
  checkModel: 'qwen3:8b',
  defaultShowBrowserRequest: false,
  description:
    'Ollama offers models across code generation, math, multilingual processing, and chat, supporting both enterprise and local deployments.',
  id: 'ollama',
  enabled: true,
  modelList: { showModelFetcher: true },
  modelsUrl: 'https://ollama.com/library',
  name: 'Ollama',
  settings: {
    defaultShowBrowserRequest: false,
    sdkType: 'ollama',
    showApiKey: false,
    showModelFetcher: true,
  },
  showApiKey: false,
  url: 'https://ollama.com',
};

export default Ollama;
