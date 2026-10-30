import type { ReactNode } from 'react';
/** No analytics configuration or SDK is passed into the intranet auth pages. */
const AnalyticsRSCProvider = ({ children }: { children: ReactNode }) => children;
export default AnalyticsRSCProvider;
