/** Browser-visible links never leave the application's origin. */
export const isIntranetNavigation = (href: string): boolean => {
  try {
    const origin =
      typeof window === 'undefined' ? 'https://intranet.invalid' : window.location.origin;
    const url = new URL(href, origin);
    return (
      ['http:', 'https:', 'blob:'].includes(url.protocol) &&
      url.origin === origin &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
