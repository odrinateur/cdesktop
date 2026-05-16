import type { TFunction } from 'i18next';
import type { Routine, ScheduleKind } from 'shared/types';

const DOW_KEYS: Record<number, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

export function getDayOfWeekLabel(
  dow: number | null | undefined,
  t: TFunction
): string {
  if (dow === null || dow === undefined) return '';
  const key = DOW_KEYS[dow];
  return key ? t(`routines.days.${key}`) : '';
}

interface ScheduleSummaryInput {
  schedule_kind: ScheduleKind;
  schedule_time: string | null;
  schedule_dow: number | bigint | null;
}

function dowToNumber(dow: number | bigint | null | undefined): number | null {
  if (dow === null || dow === undefined) return null;
  return typeof dow === 'bigint' ? Number(dow) : dow;
}

export function formatScheduleSummary(
  routine: ScheduleSummaryInput | Routine,
  t: TFunction
): string {
  const kind = routine.schedule_kind;
  const time = routine.schedule_time ?? '';
  const dow = dowToNumber(routine.schedule_dow as number | bigint | null);

  switch (kind) {
    case 'manual':
      return t('routines.schedule.summary.manual');
    case 'hourly':
      return time
        ? t('routines.schedule.summary.hourly', { minute: time })
        : t('routines.schedule.summary.hourlyNoTime');
    case 'daily':
      return time
        ? t('routines.schedule.summary.daily', { time })
        : t('routines.schedule.summary.dailyNoTime');
    case 'weekdays':
      return time
        ? t('routines.schedule.summary.weekdays', { time })
        : t('routines.schedule.summary.weekdaysNoTime');
    case 'weekly': {
      const dayLabel = getDayOfWeekLabel(dow, t);
      if (dayLabel && time)
        return t('routines.schedule.summary.weekly', { day: dayLabel, time });
      if (dayLabel)
        return t('routines.schedule.summary.weeklyDayOnly', { day: dayLabel });
      return time
        ? t('routines.schedule.summary.weeklyAt', { time })
        : t('routines.schedule.summary.weeklyNoTime');
    }
    default:
      return '';
  }
}
