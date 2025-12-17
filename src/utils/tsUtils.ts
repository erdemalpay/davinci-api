export function pick<T, K extends readonly (keyof T)[]>(
  obj: T,
  keys: K
): Pick<T, K[number]> {
  return Object.fromEntries(
    keys.map((key) => [key, obj[key]])
  ) as Pick<T, K[number]>;
}