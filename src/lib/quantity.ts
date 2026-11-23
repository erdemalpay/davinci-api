/**
 * Order quantities can be fractional (e.g. an item split 1/7 between players).
 * Binary floats cannot represent most fractions exactly, so sums like 7 × (1/7)
 * end up as 0.9999999999999998 and remainders as 2.22e-16. Quantities are
 * therefore always kept at 3 decimal places.
 */
export const QUANTITY_DECIMALS = 3;
export const QUANTITY_EPSILON = 0.0005;
/**
 * Split payments (1/n) are rounded per payment, so the last share can be a few
 * thousandths larger than what is left. Payments within this tolerance are
 * accepted and paidQuantity is clamped to quantity.
 */
export const QUANTITY_PAYMENT_TOLERANCE = 0.01;

export function roundQuantity(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const factor = 10 ** QUANTITY_DECIMALS;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded; // avoid -0
}
