import { type ReactNode } from 'react';
/** Runtime analytics settings cannot enable telemetry in the intranet build. */
export const LobeAnalyticsProviderWrapper = ({ children }: { children: ReactNode }) => children;
