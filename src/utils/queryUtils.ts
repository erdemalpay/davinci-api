const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 200;

export interface PaginationParams {
  pageNum: number;
  limitNum: number;
  skip: number;
}

export function buildPaginationParams(
  page?: number,
  limit?: number,
): PaginationParams {
  const pageNum = Math.max(1, Number(page) || DEFAULT_PAGE);
  const limitNum = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limit) || DEFAULT_LIMIT),
  );
  const skip = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, skip };
}

/**
 * Builds sort object for Mongoose find().sort().
 * @param sort - sort field name
 * @param asc - 1 for ascending, -1 or other for descending
 * @param defaultSortField - fallback field (e.g. 'createdAt')
 */
export function buildSortObject(
  sort: string | undefined,
  asc?: number | string,
  defaultSortField = 'createdAt',
): Record<string, 1 | -1> {
  const dir = (typeof asc === 'string' ? Number(asc) : asc) === 1 ? 1 : -1;
  const sortField = sort && sort !== '' ? sort : defaultSortField;
  const result: Record<string, 1 | -1> = { [sortField]: dir };
  if (sortField !== defaultSortField) {
    result[defaultSortField] = -1;
  }
  return result;
}

export function totalPages(totalNumber: number, limitNum: number): number {
  return Math.ceil(totalNumber / limitNum);
}
