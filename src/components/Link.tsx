import { useTranslation } from 'react-i18next';
import { isIntranetNavigation } from '@/security/intranet/url';
import { type AnchorHTMLAttributes } from 'react';
import React, { memo } from 'react';
import { Link as RouterLink } from 'react-router-dom';

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: React.ReactNode | undefined;
  href?: string;
}

/**
 * Smart Link component for global use.
 * - External destinations → disabled anchors without href
 * - Internal routes → React Router Link
 */
const Link = memo<LinkProps>(({ href, children, ...props }) => {
  const { t } = useTranslation('common');
  if (href && !isIntranetNavigation(href)) {
    return (
      <a {...props} aria-disabled="true" title={t('intranet.externalNavigation')}>
        {children}
      </a>
    );
  }

  // Same-origin absolute URLs use a native anchor.
  if (href?.startsWith('http://') || href?.startsWith('https://')) {
    return (
      <a href={href} rel="noreferrer" {...props}>
        {children}
      </a>
    );
  }

  // Internal routes use React Router Link
  return (
    <RouterLink to={href || '/'} {...props}>
      {children}
    </RouterLink>
  );
});

export default Link;
