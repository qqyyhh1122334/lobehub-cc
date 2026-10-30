'use client';

import { ActionIcon, Flexbox } from '@lobehub/ui';
import { SettingsIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import ThemeButton from '@/features/User/UserPanel/ThemeButton';

/** Local navigation only: cloud promotions, feedback and public help links are omitted. */
const Footer = memo(() => {
  const { t } = useTranslation('common');
  return (
    <Flexbox horizontal align="center" gap={2} justify="space-between" padding={8}>
      <Link aria-label={t('userPanel.setting')} to="/settings">
        <ActionIcon icon={SettingsIcon} size={16} title={t('userPanel.setting')} />
      </Link>
      <ThemeButton placement="topCenter" size={16} />
    </Flexbox>
  );
});

export default Footer;
