/** Safe user-facing diagnostics. Never expose server messages, tokens or payloads. */
export function habitDeletionIssue(result: {
  data: unknown;
  error: { code?: string } | null;
  status?: number;
}): string | null {
  if (!result.error && result.data === 1) return null;
  const code = result.error?.code;
  const unchanged = ' Chưa xóa thói quen; dữ liệu và lịch sử vẫn được giữ.';
  if (code === 'PGRST202' || code === '42883' || result.status === 404)
    return (
      'Thiếu RPC lbd_habit_deletion_capabilities hoặc bộ nhớ đệm API chưa cập nhật. Cần kiểm tra migration 202610300001_habit_deletions.sql trên đúng dự án Supabase.' +
      unchanged
    );
  if (result.status === 401 || code === 'PGRST301' || code === 'PGRST303')
    return (
      'Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại rồi thử xóa.' +
      unchanged
    );
  if (result.status === 403 || code === '42501')
    return (
      'Tài khoản không có quyền gọi RPC bảo vệ dấu xóa. Cần kiểm tra quyền EXECUTE và migration trên Supabase.' +
      unchanged
    );
  if (result.status === 0)
    return (
      'Không kết nối được Supabase. Kiểm tra mạng rồi thử lại khi có kết nối.' +
      unchanged
    );
  if (!result.error)
    return (
      'RPC bảo vệ dấu xóa trả về phiên bản không được hỗ trợ. Cần kiểm tra migration; không thể bỏ qua cơ chế bảo vệ.' +
      unchanged
    );
  return (
    'Chưa kiểm tra được cơ chế bảo vệ dấu xóa trên Supabase. Hãy thử lại; nếu vẫn lỗi, kiểm tra RPC và migration.' +
    unchanged
  );
}
