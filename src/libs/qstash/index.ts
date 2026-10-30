import { IntranetFeatureUnavailableError } from '@/libs/intranet/disabled';

/** Tombstones for persisted cloud workflow references; no SDK or network client is created. */
export const qstashClient = Object.freeze({
  publishJSON: async (_request: unknown): Promise<{ messageId: string }> => {
    throw new IntranetFeatureUnavailableError('QStash');
  },
});

export const workflowClient = Object.freeze({
  trigger: async (_request: unknown): Promise<{ workflowRunId: string }> => {
    throw new IntranetFeatureUnavailableError('Cloud workflows');
  },
});

/** An absent cloud receiver must never turn signature authentication into a bypass. */
export async function verifyQStashSignature(_request: Request, _rawBody: string): Promise<boolean> {
  return false;
}
