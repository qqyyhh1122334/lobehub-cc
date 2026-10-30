import { Center, Text } from '@lobehub/ui';
import { type ReactNode, memo } from 'react';
import { useTranslation } from 'react-i18next';

interface OllamaModelDownloaderProps {
  extraAction?: ReactNode;
  model: string;
  onSuccessDownload?: () => void;
}

/** Model artifacts are imported by the operator before entering the isolated network. */
const OllamaModelDownloader = memo<OllamaModelDownloaderProps>(({ model, extraAction }) => {
  const { t } = useTranslation('common');
  return (
    <Center gap={16} paddingBlock={32} style={{ width: '100%' }}>
      <Text type="secondary">{t('intranet.modelImportRequired', { model })}</Text>
      {extraAction}
    </Center>
  );
});

export default OllamaModelDownloader;
