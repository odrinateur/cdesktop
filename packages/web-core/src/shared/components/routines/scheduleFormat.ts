import type { Routine, ScheduleKind } from 'shared/types';

const DOW_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const DOW_SHORT: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

export function getDayOfWeekLabel(dow: number | null | undefined): string {
  if (dow === null || dow === undefined) return '';
  return DOW_LABELS[dow] ?? '';
}

export function getDayOfWeekShort(dow: number | null | undefined): string {
  if (dow === null || dow === undefined) return '';
  return DOW_SHORT[dow] ?? '';
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
  routine: ScheduleSummaryInput | Routine
): string {
  const kind = routine.schedule_kind;
  const time = routine.schedule_time ?? '';
  const dow = dowToNumber(routine.schedule_dow as number | bigint | null);

  switch (kind) {
    case 'manual':
      return 'Manual only';
    case 'hourly':
      return time ? `Every hour at :${time}` : 'Every hour';
    case 'daily':
      return time ? `Every day at ${time}` : 'Every day';
    case 'weekdays':
      return time ? `Mon–Fri at ${time}` : 'Mon–Fri';
    case 'weekly': {
      const dayLabel = getDayOfWeekLabel(dow);
      if (dayLabel && time) return `Every ${dayLabel} at ${time}`;
      if (dayLabel) return `Every ${dayLabel}`;
      return time ? `Weekly at ${time}` : 'Weekly';
    }
    default:
      return '';
  }
}
