import { ActionIcon, Button, Flexbox, InputNumber, Popover, Text } from '@lobehub/ui';
import { Select } from '@lobehub/ui/base-ui';
import { Switch } from 'antd';
import { createStaticStyles } from 'antd-style';
import { TimerIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

type IntervalUnit = 'hours' | 'minutes';

const MIN_MINUTES = 10;

const styles = createStaticStyles(({ css, cssVar }) => ({
  fieldLabel: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  popover: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
  `,
  preview: css`
    padding-block: 12px;
    padding-inline: 14px;
    border-radius: 12px;
    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface IntervalTabProps {
  currentInterval: number;
  taskId?: string;
}

const IntervalTab = memo<IntervalTabProps>(({ currentInterval, taskId }) => {
  const { t } = useTranslation('chat');
  const updatePeriodicInterval = useTaskStore((s) => s.updatePeriodicInterval);

  const derived = useMemo(() => {
    if (!currentInterval || currentInterval === 0)
      return { displayValue: MIN_MINUTES, unit: 'minutes' as IntervalUnit };
    if (currentInterval >= 3600 && currentInterval % 3600 === 0)
      return { displayValue: currentInterval / 3600, unit: 'hours' as IntervalUnit };
    return {
      displayValue: Math.max(MIN_MINUTES, Math.round(currentInterval / 60)),
      unit: 'minutes' as IntervalUnit,
    };
  }, [currentInterval]);

  const [localUnit, setLocalUnit] = useState<IntervalUnit>(derived.unit);
  const [localValue, setLocalValue] = useState<number | undefined>(derived.displayValue);

  useEffect(() => {
    setLocalUnit(derived.unit);
    setLocalValue(derived.displayValue);
  }, [derived.unit, derived.displayValue]);

  const toSeconds = (val: number | null, u: IntervalUnit): number | null => {
    if (!val || val <= 0) return null;
    return u === 'hours' ? val * 3600 : val * 60;
  };

  const handleValueChange = useCallback(
    (val: number | string | null) => {
      let normalized: number | undefined;
      if (val === null || val === '') {
        normalized = undefined;
      } else if (typeof val === 'string') {
        const n = Number(val);
        normalized = Number.isNaN(n) ? undefined : n;
      } else {
        normalized = val;
      }
      setLocalValue(normalized);
      if (!taskId) return;
      const seconds = toSeconds(normalized ?? null, localUnit);
      updatePeriodicInterval(taskId, seconds);
    },
    [taskId, localUnit, updatePeriodicInterval],
  );

  const handleUnitChange = useCallback(
    (u: IntervalUnit) => {
      setLocalUnit(u);
      if (!taskId || !localValue) return;
      const clamped = u === 'minutes' ? Math.max(MIN_MINUTES, localValue) : localValue;
      if (clamped !== localValue) setLocalValue(clamped);
      const seconds = toSeconds(clamped, u);
      updatePeriodicInterval(taskId, seconds);
    },
    [taskId, localValue, updatePeriodicInterval],
  );

  return (
    <Flexbox gap={6}>
      <Text className={styles.fieldLabel}>{t('taskSchedule.intervalLabel')}</Text>
      <Flexbox horizontal align="center" gap={8}>
        <Text type="secondary">{t('taskSchedule.every')}</Text>
        <InputNumber
          min={localUnit === 'minutes' ? MIN_MINUTES : 1}
          placeholder={localUnit === 'minutes' ? String(MIN_MINUTES) : '1'}
          style={{ width: 100 }}
          value={localValue}
          variant="filled"
          onChange={handleValueChange}
        />
        <Select
          style={{ flex: 1 }}
          value={localUnit}
          variant="filled"
          options={[
            { label: t('taskSchedule.minutes'), value: 'minutes' },
            { label: t('taskSchedule.hours'), value: 'hours' },
          ]}
          onChange={handleUnitChange}
        />
        <Text type="secondary">{t('taskSchedule.intervalSuffix')}</Text>
      </Flexbox>
    </Flexbox>
  );
});

interface TaskScheduleConfigProps {
  children?: ReactNode;
  currentInterval?: number;
  taskId?: string;
}

const TaskScheduleConfig = memo(function TaskScheduleConfig({
  children,
  currentInterval,
  taskId,
}: TaskScheduleConfigProps) {
  const { t } = useTranslation('chat');
  const { t: commonT } = useTranslation('common');
  const activeTaskId = useTaskStore(taskDetailSelectors.activeTaskId);
  const activeTaskInterval = useTaskStore(taskDetailSelectors.activeTaskPeriodicInterval);
  const automationMode = useTaskStore(taskDetailSelectors.activeTaskAutomationMode);
  const setAutomationMode = useTaskStore((s) => s.setAutomationMode);
  const finalTaskId = taskId ?? activeTaskId;
  const interval = currentInterval ?? activeTaskInterval;
  const content = (
    <Flexbox
      gap={16}
      padding={12}
      style={{ width: 360 }}
      onClick={(event) => event.stopPropagation()}
    >
      <Flexbox horizontal align="center" gap={12} justify="space-between">
        <Text>{t('taskSchedule.intervalTab')}</Text>
        <Switch
          checked={automationMode === 'heartbeat'}
          onChange={(checked) => {
            if (finalTaskId) void setAutomationMode(finalTaskId, checked ? 'heartbeat' : null);
          }}
        />
      </Flexbox>
      {automationMode === 'schedule' && (
        <>
          <Text type="secondary">{commonT('intranetUnavailable')}</Text>
          <Button
            onClick={() => {
              if (finalTaskId) void setAutomationMode(finalTaskId, null);
            }}
          >
            {t('taskDetail.cancelSchedule')}
          </Button>
        </>
      )}
      {automationMode === 'heartbeat' && (
        <IntervalTab currentInterval={interval} taskId={finalTaskId} />
      )}
    </Flexbox>
  );
  return (
    <Popover className={styles.popover} content={content} placement="bottomRight" trigger="click">
      {children ? (
        <div onClick={(event) => event.stopPropagation()}>{children}</div>
      ) : (
        <ActionIcon
          icon={TimerIcon}
          size="small"
          title={t('taskSchedule.title')}
          onClick={(event) => event.stopPropagation()}
        />
      )}
    </Popover>
  );
});
export default TaskScheduleConfig;
