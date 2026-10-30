import { ActionIcon } from '@lobehub/ui';
import { Mic } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

/** Browser recognition may stream microphone audio to a vendor's servers. */
const BrowserSTT = memo<{ mobile?: boolean }>(() => {
  const { t } = useTranslation('common');
  return <ActionIcon disabled icon={Mic} title={t('intranet.nativeSpeechUnavailable')} />;
});

export default BrowserSTT;
