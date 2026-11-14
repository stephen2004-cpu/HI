import { expect, it } from 'vitest';
import { taskDeletionIssue, taskSeriesDeletionIssue } from './taskDeletion';
it('only capability version 1 without an error authorizes deletion', () => {
  expect(taskDeletionIssue({ data: 1, error: null })).toBeNull();
  for (const data of [null, 0, 2, '1', {}, true])
    expect(taskDeletionIssue({ data, error: null })).toContain('Chưa xóa Task');
});
it.each([
  ['PGRST202', 404, 'lbd_task_repeat_capabilities'],
  ['42883', 400, 'API schema cache'],
  ['42501', 403, 'quyền EXECUTE'],
  ['PGRST301', 401, 'Đăng nhập lại'],
  ['PGRST303', 401, 'Đăng nhập lại'],
  ['', 0, 'Kiểm tra mạng'],
  ['unexpected', 500, 'SQL chẩn đoán'],
])(
  'classifies %s without inventing a missing table diagnosis or exposing server messages',
  (code, status, text) => {
    const result = {
      data: null,
      error: { code, message: 'secret token password' },
      status,
    };
    const issue = taskDeletionIssue(result);
    expect(issue).toContain(text);
    expect(issue).toContain('Chưa xóa Task');
    expect(issue).not.toMatch(/secret|token|password/);
  },
);
it('requires the separate series capability and preserves existing single-occurrence authorization', () => {
  expect(taskSeriesDeletionIssue({ data: 1, error: null })).toBeNull();
  expect(
    taskSeriesDeletionIssue({
      data: null,
      error: { code: 'PGRST202' },
      status: 404,
    }),
  ).toContain('Xóa toàn bộ chuỗi chưa được bật');
  expect(taskSeriesDeletionIssue({ data: 2, error: null })).toContain(
    'Chưa xóa Task',
  );
  expect(taskDeletionIssue({ data: 1, error: null })).toBeNull();
});
