// Below this many people in the cafe, two at once on a break is too many.
export const MIN_STAFF_FOR_TWO_BREAKS = 4;

// Whether a new break leaves the cafe short. People outside operation count
// neither as on a break nor as in the cafe (the panel asks with the same
// rule before starting a break).
// - Fewer than 4 people in the cafe: someone else is on a break already.
// - Otherwise: two others are on a break already.
export function isConcurrentBreak(
  othersOnBreakCount: number,
  staffInCafeCount: number,
): boolean {
  return staffInCafeCount < MIN_STAFF_FOR_TWO_BREAKS
    ? othersOnBreakCount >= 1
    : othersOnBreakCount >= 2;
}
