/** Telemetry is permanently disabled in the intranet distribution. */
export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, unknown>;
  userId?: string;
}
export interface AnalyticsManager {
  track: (event: AnalyticsEvent) => Promise<void>;
  identify: (id: string, properties?: Record<string, unknown>) => Promise<void>;
  reset: () => Promise<void>;
  initialize: () => Promise<void>;
  getStatus: () => { initialized: boolean };
}
export type GoogleAnalyticsProviderConfig = Record<string, unknown>;
export type PostHogProviderAnalyticsConfig = Record<string, unknown>;
export type XAdsProviderAnalyticsConfig = Record<string, unknown>;
export const disabledAnalytics: AnalyticsManager = Object.freeze({
  track: async () => {},
  identify: async () => {},
  reset: async () => {},
  initialize: async () => {},
  getStatus: () => ({ initialized: false }),
});
export const getSingletonAnalyticsOptional = (): AnalyticsManager | null => null;
export const useAnalytics = () => ({ analytics: null as AnalyticsManager | null });
