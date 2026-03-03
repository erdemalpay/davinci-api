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
