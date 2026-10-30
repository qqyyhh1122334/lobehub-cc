'use client';
import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/** Office Online would disclose the document URL to an Internet service. */
const MSDocViewer = memo<{ fileId: string; url: string | null }>(({ url }) => {
  const { t } = useTranslation('common');
  if (!url) return null;
  return (
    <Flexbox gap={12} padding={16}>
      <p>{t('intranet.officePreview')}</p>
      <a download href={url}>
        {t('intranet.downloadDocument')}
      </a>
    </Flexbox>
  );
});
export default MSDocViewer;
