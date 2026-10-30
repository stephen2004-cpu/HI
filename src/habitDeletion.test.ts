import { expect, it } from 'vitest';
import { habitDeletionIssue } from './habitDeletion';
it('accepts only the supported capability, never treats auth or an unknown version as success', () => {
  expect(habitDeletionIssue({ data: 1, error: null })).toBeNull();
  for (const data of [0, null, '1', {}, 2]) {
    expect(habitDeletionIssue({ data, error: null })).toContain(
      'không được hỗ trợ',
    );
  }
});
it.each([
  [{ code: 'PGRST202' }, 404, 'Thiếu RPC'],
  [{ code: '42883' }, 400, 'Thiếu RPC'],
  [{ code: '42501' }, 403, 'không có quyền'],
  [{ code: 'PGRST301' }, 401, 'đăng nhập lại'],
  [{ code: 'PGRST303' }, 400, 'đăng nhập lại'],
  [{}, 0, 'Kiểm tra mạng'],
  [{ code: 'XX000' }, 500, 'Chưa kiểm tra được'],
])('reports a safe actionable failure for %j', (error, status, expected) => {
  const message = habitDeletionIssue({ data: null, error, status });
  expect(message).toContain(expected);
  expect(message).toContain('Chưa xóa thói quen');
});
