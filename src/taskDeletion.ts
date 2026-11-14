/** Capability failures never authorize a local tombstone or expose raw server messages. */
export function taskDeletionIssue(result: {
  data: unknown;
  error: { code?: string } | null;
  status?: number;
}): string | null {
  if (!result.error && result.data === 1) return null;
  const code = result.error?.code;
  const unchanged =
    ' Chưa xóa Task; dữ liệu, Checklist và lịch sử vẫn được giữ.';
  if (code === 'PGRST202' || code === '42883' || result.status === 404)
    return (
      'Không tìm thấy RPC lbd_task_repeat_capabilities hoặc API schema cache chưa cập nhật. Kiểm tra đúng project và installer install_task_repeat_deletions_safe.sql.' +
      unchanged
    );
  if (result.status === 401 || code === 'PGRST301' || code === 'PGRST303')
    return (
      'Phiên đăng nhập không còn hợp lệ. Đăng nhập lại rồi thử xóa.' + unchanged
    );
  if (result.status === 403 || code === '42501')
    return (
      'Không có quyền gọi RPC bảo vệ Task. Cần kiểm tra quyền EXECUTE; không tắt RLS để vượt lỗi.' +
      unchanged
    );
  if (result.status === 0)
    return (
      'Không kết nối được Supabase. Kiểm tra mạng rồi thử lại.' + unchanged
    );
  if (!result.error)
    return (
      'RPC bảo vệ Task trả về phiên bản không hỗ trợ. Kiểm tra migration, không bỏ qua bảo vệ tombstone.' +
      unchanged
    );
  return (
    'Chưa kiểm tra được cơ chế bảo vệ Task. Thử lại hoặc kiểm tra SQL chẩn đoán.' +
    unchanged
  );
}

export function taskSeriesDeletionIssue(
  result: Parameters<typeof taskDeletionIssue>[0],
): string | null {
  if (!result.error && result.data === 1) return null;
  if (
    ['PGRST202', '42883'].includes(result.error?.code ?? '') ||
    result.status === 404
  )
    return 'Xóa toàn bộ chuỗi chưa được bật cho tài khoản này. Chưa xóa Task; dữ liệu, Checklist và lịch sử vẫn được giữ.';
  return taskDeletionIssue(result);
}
