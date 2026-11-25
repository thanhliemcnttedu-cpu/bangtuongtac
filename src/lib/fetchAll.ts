/** Supabase mặc định chỉ trả tối đa 1.000 dòng mỗi lần hỏi: phải lấy từng trang, nếu không dữ liệu cũ mất đi mà không báo lỗi. */
export const PAGE_SIZE = 1000;

interface Page<T> { data: T[] | null; error: { message: string } | null }

/** `query(from, to)` phải có `.order(...)` ổn định (kết thúc bằng cột không trùng) và `.range(from, to)`. */
export async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<Page<T>>): Promise<Page<T>> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return { data: all, error: null };
  }
}
