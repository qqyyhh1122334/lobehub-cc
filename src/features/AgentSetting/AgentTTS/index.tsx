'use client';

import { VoiceList } from '@lobehub/tts';
import { type FormGroupItemType } from '@lobehub/ui';
import { Form, Select, Text } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { Mic } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FORM_STYLE } from '@/const/layoutTokens';

import { selectors, useStore } from '../store';
import { ttsOptions } from './options';
import SelectWithTTSPreview from './SelectWithTTSPreview';

const TTS_SETTING_KEY = 'tts';
const { openaiVoiceOptions, localeOptions } = VoiceList;

const AgentTTS = memo(() => {
  const { t } = useTranslation('setting');
  const { t: commonT } = useTranslation('common');
  const [form] = Form.useForm();
  const config = useStore(selectors.currentTtsConfig, isEqual);
  const updateConfig = useStore((s) => s.setAgentConfig);

  const tts: FormGroupItemType = {
    children: [
      {
        children: <Select options={ttsOptions} />,
        desc: commonT('intranet.speechService'),
        label: t('settingTTS.ttsService.title'),
        name: [TTS_SETTING_KEY, 'ttsService'],
      },
      {
        children: <SelectWithTTSPreview options={openaiVoiceOptions} server={'openai'} />,
        desc: t('settingTTS.voice.desc'),
        hidden: config.ttsService !== 'openai',
        label: t('settingTTS.voice.title'),
        name: [TTS_SETTING_KEY, 'voice', 'openai'],
      },
      {
        children: <Text type="secondary">{commonT('intranetUnavailable')}</Text>,
        desc: t('settingTTS.voice.desc'),
        divider: false,
        hidden: config.ttsService !== 'edge',
        label: t('settingTTS.voice.title'),
        name: [TTS_SETTING_KEY, 'voice', 'edge'],
      },
      {
        children: <Text type="secondary">{commonT('intranetUnavailable')}</Text>,
        desc: t('settingTTS.voice.desc'),
        divider: false,
        hidden: config.ttsService !== 'microsoft',
        label: t('settingTTS.voice.title'),
        name: [TTS_SETTING_KEY, 'voice', 'microsoft'],
      },
      {
        children: (
          <Select
            options={[
              { label: t('settingCommon.lang.autoMode'), value: 'auto' },
              ...(localeOptions || []),
            ]}
          />
        ),
        desc: t('settingTTS.sttLocale.desc'),
        label: t('settingTTS.sttLocale.title'),
        name: [TTS_SETTING_KEY, 'sttLocale'],
      },
    ],
    icon: Mic,
    title: t('settingTTS.title'),
  };

  return (
    <Form
      footer={<Form.SubmitFooter />}
      form={form}
      items={[tts]}
      itemsType={'group'}
      variant={'borderless'}
      initialValues={{
        [TTS_SETTING_KEY]: config,
      }}
      onFinish={updateConfig}
      {...FORM_STYLE}
    />
  );
});

export default AgentTTS;
