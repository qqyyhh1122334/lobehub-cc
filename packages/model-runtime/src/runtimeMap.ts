import { LobeComfyUI } from './providers/comfyui';
import { LobeLMStudioAI } from './providers/lmstudio';
import { LobeOllamaAI } from './providers/ollama';
import { LobeOpenAI } from './providers/openai';
import { LobeVLLMAI } from './providers/vllm';
import { LobeXinferenceAI } from './providers/xinference';

/** Only self-hostable adapters are part of the intranet runtime bundle. */
export const providerRuntimeMap = {
  comfyui: LobeComfyUI,
  lmstudio: LobeLMStudioAI,
  ollama: LobeOllamaAI,
  openai: LobeOpenAI,
  vllm: LobeVLLMAI,
  xinference: LobeXinferenceAI,
};
