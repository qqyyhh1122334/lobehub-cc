import { useTranslation } from 'react-i18next';
import { isIntranetNavigation } from '@/security/intranet/url';
/**
 * Link adapter — maps Next.js Link API (href prop) to react-router-dom Link (to prop).
 * External destinations are rendered without a navigable href.
 */

import { type AnchorHTMLAttributes } from 'react';
import { Link as RRLink } from 'react-router-dom';

import { nextjsOnlyRoutes } from './nextjsOnlyRoutes';

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}

const isExternalOrNextOnly = (href: string) =>
  href.startsWith('http://') ||
  href.startsWith('https://') ||
  href.startsWith('//') ||
  nextjsOnlyRoutes.some(
    (route) => href === route || href.startsWith(`${route}/`) || href.startsWith(`${route}?`),
  );

const Link = ({
  ref,
  href,
  replace,
  prefetch,
  scroll,
  children,
  ...rest
}: LinkProps & { ref?: React.RefObject<HTMLAnchorElement | null> }) => {
  const { t } = useTranslation('common');
  if (!isIntranetNavigation(href)) {
    return (
      <a {...rest} ref={ref} aria-disabled="true" title={t('intranet.externalNavigation')}>
        {children}
      </a>
    );
  }

  if (isExternalOrNextOnly(href)) {
    return (
      <a href={href} ref={ref} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <RRLink ref={ref} replace={replace} to={href} {...rest}>
      {children}
    </RRLink>
  );
};

Link.displayName = 'Link';

export default Link;
