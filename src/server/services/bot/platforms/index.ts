// --------------- Core types & utilities ---------------
// --------------- Registry singleton ---------------
import { PlatformRegistry } from './registry';

export {
  allowFromField,
  type BotReplyLocale,
  displayToolCallsField,
  type DmDecision,
  type DmPolicy,
  type DmSettings,
  extractDmSettings,
  extractGroupSettings,
  extractUserAllowlist,
  extractWatchKeywordEntries,
  extractWatchKeywords,
  findMatchingWatchKeywordEntries,
  getBotReplyLocale,
  getStepReactionEmoji,
  type GroupPolicy,
  type GroupSettings,
  makeDmPolicyField,
  makeGroupPolicyFields,
  makeServerIdField,
  makeUserIdField,
  messageMatchesWatchKeyword,
  normalizeAllowFromEntries,
  normalizeBotReplyLocale,
  RECEIVED_REACTION_EMOJI,
  shouldAllowSender,
  shouldHandleDm,
  shouldHandleGroup,
  THINKING_REACTION_EMOJI,
  type UserAllowlist,
  validateAccessSettings,
  type WatchKeywordEntry,
  watchKeywordsField,
  WORKING_REACTION_EMOJI,
} from './const';
export { PlatformRegistry } from './registry';
export type {
  BotMessageAttachment,
  BotPlatformRedisClient,
  BotPlatformRuntimeContext,
  BotProviderConfig,
  ConnectionMode,
  ExtractFilesResult,
  FieldSchema,
  MessengerContent,
  PlatformClient,
  PlatformDefinition,
  PlatformDocumentation,
  PlatformMessenger,
  SerializedPlatformDefinition,
  UsageStats,
  ValidationResult,
} from './types';
export { ClientFactory, messengerContentText } from './types';
export type { ProviderConfigInput, ResolvedBotProviderConfig } from './utils';
export {
  buildRuntimeKey,
  extractDefaults,
  formatDuration,
  formatTokens,
  formatUsageStats,
  getEffectiveConnectionMode,
  mergeWithDefaults,
  parseRuntimeKey,
  resolveBotProviderConfig,
  resolveConnectionMode,
} from './utils';

// Cloud channel adapters are intentionally not imported or registered.

export const platformRegistry = new PlatformRegistry();
