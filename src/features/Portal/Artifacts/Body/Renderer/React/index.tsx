import { Flexbox, Highlighter } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/** The cloud Sandpack bundler is intentionally absent from this distribution. */
const ReactRenderer = memo<{ code: string }>(({ code }) => {
  const { t } = useTranslation('common');
  return (
    <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
      <p>{t('intranet.activePreview')}</p>
      <Highlighter language="tsx">{code}</Highlighter>
    </Flexbox>
  );
});
export default ReactRenderer;
