import { MessageToolIdentifier } from '@lobechat/builtin-tool-message';

import { IntranetFeatureUnavailableError } from '@/libs/intranet/disabled';

import type { ServerRuntimeRegistration } from '../types';

/** Retired cloud messaging tools never inspect credentials or construct API clients. */
export const messageRuntime: ServerRuntimeRegistration = {
  factory: async () => {
    throw new IntranetFeatureUnavailableError('Cloud bot messaging');
  },
  identifier: MessageToolIdentifier,
};
