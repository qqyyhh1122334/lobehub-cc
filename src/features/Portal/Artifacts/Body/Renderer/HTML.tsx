import { Flexbox, Highlighter } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

const HTMLRenderer = memo<{
  animated?: boolean;
  height?: string;
  htmlContent: string;
  width?: string;
}>(({ htmlContent }) => {
  const { t } = useTranslation('common');
  return (
    <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
      <p>{t('intranet.activePreview')}</p>
      <Highlighter language="html">{htmlContent}</Highlighter>
    </Flexbox>
  );
});
export default HTMLRenderer;
