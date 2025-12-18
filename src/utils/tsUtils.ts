export function pick<T, K extends readonly (keyof T)[]>(
  obj: T,
  keys: K
): Pick<T, K[number]> {
  return Object.fromEntries(
    keys.map((key) => [key, obj[key]])
  ) as Pick<T, K[number]>;
}

export function pickWith<
T extends object,
K1 extends readonly (keyof T)[],
K2 extends Partial<Record<keyof T, unknown>>
>(
obj: T,
fixedKeys: K1,
otherObj: K2
): Pick<T, K1[number] | Extract<keyof K2, keyof T>> {
const keys = [
	...fixedKeys,
	...(Object.keys(otherObj) as (Extract<keyof K2, keyof T>)[])
];

return Object.fromEntries(
	keys.map((key) => [key, obj[key]])
) as Pick<T, K1[number] | Extract<keyof K2, keyof T>>;
}

/**
 * Extracts the ID from a Mongoose reference field.
 * Handles both populated (Document) and unpopulated (ID) cases.
 * 
 * @param ref - Either a Document with _id property or a primitive ID (number/string)
 * @returns The ID value (number or string)
 */
export function extractRefId<T extends { _id: number | string }>(
  ref: T | number | string
): number | string {
  if (typeof ref === 'number' || typeof ref === 'string') {
    return ref;
  }
  return ref._id;
}
