'use client';
import { type ReactNode } from 'react';
import type {
  GoogleAnalyticsProviderConfig,
  PostHogProviderAnalyticsConfig,
  XAdsProviderAnalyticsConfig,
} from '@/libs/analytics/intranet';
export const LobeAnalyticsProvider = ({
  children,
}: {
  children: ReactNode;
  ga4Config: GoogleAnalyticsProviderConfig;
  postHogConfig: PostHogProviderAnalyticsConfig;
  xAdsConfig: XAdsProviderAnalyticsConfig;
}) => children;
