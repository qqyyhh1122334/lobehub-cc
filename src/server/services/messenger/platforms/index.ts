import { MessengerPlatformRegistry } from './registry';

export { MessengerPlatformRegistry } from './registry';
export type {
  MessengerPlatformDefinition,
  MessengerPlatformWebhookGate,
  MessengerWebhookContext,
  SerializedMessengerPlatformDefinition,
} from './types';

// This edition has no cloud messenger adapters. Do not import or re-export
// their definitions or binders: importing the registry must remain offline.
export const messengerPlatformRegistry = new MessengerPlatformRegistry();
