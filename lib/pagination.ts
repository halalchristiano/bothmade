/**
 * Shared paging for the admin list endpoints.
 *
 * Every one of them did an unbounded findMany and shipped the whole table.
 * That is survivable at a few hundred rows and not at a few thousand: the
 * leads endpoint in particular loads each row's assignee and latest
 * activity, so the payload grows faster than the row count, and the browser
 * then renders all of it at once.
 *
 * Offset paging rather than cursors, deliberately: these lists are sorted
 * by mutable columns (updatedAt) and the UI needs page numbers and a total,
 * neither of which a cursor gives you. The tables are small enough that the
 * OFFSET cost is irrelevant, and a stable secondary sort on id keeps rows
 * from shuffling between pages when timestamps tie.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePageParams(
  searchParams: URLSearchParams,
  defaultSize = DEFAULT_PAGE_SIZE
): PageParams {
  const rawPage = Number(searchParams.get('page'));
  const rawSize = Number(searchParams.get('pageSize'));

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1
      ? Math.min(Math.floor(rawSize), MAX_PAGE_SIZE)
      : defaultSize;

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export function pageMeta(params: PageParams, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages,
    hasMore: params.page < totalPages,
  };
}

/**
 * Builds a case-insensitive OR across several columns for a search box.
 * Returns undefined for an empty query so it can be spread into a `where`
 * without a conditional at every call site.
 */
export function searchFilter<T extends string>(
  query: string | null,
  fields: readonly T[]
): { OR: Array<Record<T, { contains: string; mode: 'insensitive' }>> } | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;
  return {
    OR: fields.map(
      (field) =>
        ({ [field]: { contains: trimmed, mode: 'insensitive' } }) as Record<
          T,
          { contains: string; mode: 'insensitive' }
        >
    ),
  };
}
