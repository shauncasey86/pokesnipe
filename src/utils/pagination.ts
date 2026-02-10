export interface PaginationParams {
  offset: number;
  limit: number;
  page: number;
}

export function parsePagination(query: {
  page?: string;
  limit?: string;
}): PaginationParams {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '24', 10) || 24));
  const offset = (page - 1) * limit;
  return { offset, limit, page };
}
