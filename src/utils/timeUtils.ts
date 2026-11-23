export const convertToSeconds = (time: string): number => {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};
export const convertToHMS = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export function computeDurationMinutes(
  startHour: string,
  finishHour: string,
): number {
  if (!startHour || !finishHour) return 0;
  const [sh, sm] = startHour.split(':').map(Number);
  const [fh, fm] = finishHour.split(':').map(Number);
  if (
    Number.isNaN(sh) ||
    Number.isNaN(sm) ||
    Number.isNaN(fh) ||
    Number.isNaN(fm)
  ) {
    return 0;
  }
  const startMinutes = sh * 60 + sm;
  const finishMinutes = fh * 60 + fm;
  return Math.max(0, finishMinutes - startMinutes);
}

// Shift late-entry / early-exit notices are only sent when the gap is
// larger than this many minutes.
export const SHIFT_NOTICE_TOLERANCE_MINUTES = 5;

const hourToMinutes = (hour: string): number => {
  const [h, m] = (hour ?? '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
};

// Minutes from `from` forward to `to` on a 24h clock (wraps past midnight).
export function minutesForward(from: string, to: string): number {
  const f = hourToMinutes(from);
  const t = hourToMinutes(to);
  if (Number.isNaN(f) || Number.isNaN(t)) return 0;
  return (t - f + 1440) % 1440;
}

export function exceedsShiftNoticeTolerance(from: string, to: string) {
  return minutesForward(from, to) > SHIFT_NOTICE_TOLERANCE_MINUTES;
}
