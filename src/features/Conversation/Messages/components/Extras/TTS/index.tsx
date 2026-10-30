import { Text } from '@lobehub/ui';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Md5 } from 'ts-md5';

import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';

import FilePlayer from './FilePlayer';
import { type TTSProps } from './InitPlayer';
import InitPlayer from './InitPlayer';

const TTS = memo<TTSProps>(
  (props) => {
    const { file, voice, content, contentMd5 } = props;
    const { t } = useTranslation('common');
    const lang = useGlobalStore(globalGeneralSelectors.currentLanguage);
    const currentVoice = useAgentStore(agentSelectors.currentAgentTTSVoice(lang));
    const { ttsService } = useAgentStore(agentSelectors.currentAgentTTS);

    const md5 = useMemo(() => Md5.hashStr(content).toString(), [content]);

    const isContentEqual = contentMd5 === md5;
    const isVoiceEqual = currentVoice === voice;
    const isEqual = isVoiceEqual && isContentEqual;

    const PlayerRender = file && isEqual ? FilePlayer : InitPlayer;

    if (PlayerRender === InitPlayer && ttsService !== 'openai') {
      return <Text type="secondary">{t('intranetUnavailable')}</Text>;
    }

    return <PlayerRender {...props} contentMd5={md5} />;
  },
  (prevProps, nextProps) => {
    return prevProps.id === nextProps.id && prevProps.content === nextProps.content;
  },
);
export default TTS;
