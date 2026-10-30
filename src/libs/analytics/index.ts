import { disabledAnalytics } from './intranet';
export const serverAnalytics = disabledAnalytics;
export const initializeServerAnalytics = async () => disabledAnalytics;
export default serverAnalytics;
