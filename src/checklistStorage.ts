import { supabase } from './supabase';
import { workspaceUser } from './workspaceStorage';
import {
  CHECKLIST_BUCKET,
  MAX_CHECKLIST_FILE,
  type ChecklistFile,
} from './checklist';
const unavailable =
  'Không tải được file. Cần bucket private lbd-checklist-files và policy Storage theo tài khoản; kiểm tra kết nối và cấu hình theo docs/checklist-documents.md. Chưa thêm tài liệu vào bước.';
export async function uploadChecklistFile(file: File): Promise<ChecklistFile> {
  const owner = workspaceUser();
  if (!owner || !supabase)
    throw Error('Cần đăng nhập và cấu hình Supabase Storage để đính kèm file.');
  if (file.size > MAX_CHECKLIST_FILE)
    throw Error('File tối đa 20 MB. Chưa tải file lên.');
  const path = `${owner}/${crypto.randomUUID()}`;
  const { error } = await supabase.storage
    .from(CHECKLIST_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
  if (error) throw Error(unavailable);
  const metadata: ChecklistFile = {
    bucket: CHECKLIST_BUCKET,
    path,
    name: file.name.slice(0, 255),
    size: file.size,
    mime: file.type || 'application/octet-stream',
  };
  if (workspaceUser() !== owner) {
    await discardChecklistUpload(metadata);
    throw Error('Tài khoản đã thay đổi. Chưa thêm file vào bước.');
  }
  return metadata;
}
// Only used for a newly uploaded object that could not be attached. Never delete saved files here.
export async function discardChecklistUpload(file: ChecklistFile) {
  if (
    supabase &&
    workspaceUser() &&
    file.path.startsWith(`${workspaceUser()}/`)
  )
    await supabase.storage.from(CHECKLIST_BUCKET).remove([file.path]);
}
export async function checklistFileURL(file: ChecklistFile, download: boolean) {
  if (
    !supabase ||
    !workspaceUser() ||
    !file.path.startsWith(`${workspaceUser()}/`)
  )
    throw Error('Cần đăng nhập đúng tài khoản đã tải file để mở tài liệu này.');
  const { data, error } = await supabase.storage
    .from(CHECKLIST_BUCKET)
    .createSignedUrl(
      file.path,
      60,
      download ? { download: file.name } : undefined,
    );
  if (error || !data?.signedUrl)
    throw Error(
      'Không mở được file. Kiểm tra mạng, quyền Storage hoặc file đã bị xóa.',
    );
  return data.signedUrl;
}
