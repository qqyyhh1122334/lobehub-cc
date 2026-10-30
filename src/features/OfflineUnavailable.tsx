import { Flexbox } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

/** Route-level explanation for functionality removed from the intranet distribution. */
const OfflineUnavailable = () => {
  const { t } = useTranslation('common');
  return (
    <Flexbox padding={24}>
      <p>{t('intranetUnavailable')}</p>
    </Flexbox>
  );
};

export default OfflineUnavailable;
