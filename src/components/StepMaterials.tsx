import { useEffect, useRef, useState } from 'react';
import {
  Paperclip,
  ExternalLink,
  Download,
  FileText,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  documentURL,
  MAX_CHECKLIST_FILE,
  type StepDocument,
  type ChecklistFile,
} from '../checklist';
import {
  uploadChecklistFile,
  discardChecklistUpload,
  checklistFileURL,
} from '../checklistStorage';
import { workspaceUser } from '../workspaceStorage';
import { supabase } from '../supabase';
export default function StepMaterials({
  documents,
  update,
  savedTask,
  draftOnly = false,
}: {
  documents: StepDocument[];
  update: (transform: (docs: StepDocument[]) => StepDocument[]) => boolean;
  savedTask: boolean;
  draftOnly?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [url, setURL] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [fallback, setFallback] = useState('');
  const alive = useRef(true),
    input = useRef<HTMLInputElement>(null);
  const owner = workspaceUser();
  const latest = useRef({ documents, update, draftOnly });
  latest.current = { documents, update, draftOnly };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reset = () => {
    setEditing(null);
    setName('');
    setURL('');
    setFile(null);
    if (input.current) input.current.value = '';
  };
  const save = async () => {
    setError('');
    setNotice('');
    const normalized = url.trim() ? documentURL(url) : undefined;
    if (url.trim() && !normalized) {
      setError('Chỉ dùng link http/https hợp lệ, không chứa mật khẩu.');
      return;
    }
    if (!name.trim() && !file) {
      setError('Nhập tên tài liệu hoặc chọn file.');
      return;
    }
    if (file && file.size > MAX_CHECKLIST_FILE) {
      setError('File tối đa 20 MB.');
      return;
    }
    setBusy(true);
    let uploaded: ChecklistFile | undefined;
    try {
      if (file) uploaded = await uploadChecklistFile(file);
      if (!alive.current || workspaceUser() !== owner) {
        if (uploaded) await discardChecklistUpload(uploaded);
        return;
      }
      const existing = latest.current.documents.find((d) => d.id === editing);
      if (editing && !existing)
        throw Error(
          'Tài liệu đã thay đổi. Hãy đóng chỉnh sửa và kiểm tra lại.',
        );
      const doc: StepDocument = {
        id: existing?.id ?? crypto.randomUUID(),
        name: (name.trim() || file!.name).slice(0, 200),
        ...(normalized ? { url: normalized } : {}),
        ...(uploaded || existing?.file
          ? { file: uploaded ?? existing!.file }
          : {}),
      };
      if (
        !latest.current.update((docs) =>
          existing
            ? docs.map((d) => (d.id === doc.id ? doc : d))
            : [...docs, doc],
        )
      )
        throw Error(
          'Không lưu được tài liệu vào bước. Dữ liệu trước đó được giữ; hãy thử lại.',
        );
      reset();
      setNotice(
        latest.current.draftOnly
          ? 'Đã cập nhật bản nháp tài liệu. Nhấn Lưu Task hoặc Thêm Task để lưu thay đổi.'
          : 'Đã lưu tài liệu vào Task. Dữ liệu tài khoản sẽ được đồng bộ theo trạng thái trên trang.',
      );
    } catch (e) {
      if (uploaded) {
        try {
          await discardChecklistUpload(uploaded);
        } catch {
          /* The private orphan can be cleaned in Storage; never report attachment success. */
        }
      }
      if (alive.current)
        setError(e instanceof Error ? e.message : 'Không lưu được tài liệu.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const openFile = async (attachment: ChecklistFile, download: boolean) => {
    setError('');
    setFallback('');
    // Open during the user gesture so mobile browsers can show the signed file after the request.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const signed = await checklistFileURL(attachment, download);
      if (!alive.current || workspaceUser() !== owner) {
        tab?.close();
        return;
      }
      if (tab) tab.location.replace(signed);
      else setFallback(signed);
    } catch (e) {
      tab?.close();
      if (alive.current)
        setError(e instanceof Error ? e.message : 'Không mở được file.');
    }
  };
  return (
    <details
      className="step-materials"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement)
          e.preventDefault();
      }}
    >
      <summary
        aria-label={`Tài liệu (${documents.length})`}
        title={`Tài liệu (${documents.length})`}
      >
        <Paperclip size={14} aria-hidden="true" />
        <span className="materials-label">Tài liệu</span>
        {documents.length > 0 && (
          <span aria-hidden="true">{documents.length}</span>
        )}
      </summary>
      <div className="step-materials-content">
        {documents.map((doc) => (
          <article
            className="step-document"
            key={doc.id}
            aria-label={`Tài liệu ${doc.name}`}
          >
            <strong>
              <FileText size={15} aria-hidden="true" />
              {doc.name}
            </strong>
            {doc.url && <p className="document-url">{doc.url}</p>}
            {doc.file && (
              <small>
                {doc.file.name} · {Math.ceil(doc.file.size / 1024)} KB
              </small>
            )}
            <div className="document-actions">
              {doc.url && (
                <a
                  className="button outline"
                  href={documentURL(doc.url) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} />
                  Mở link
                </a>
              )}
              {doc.file && (
                <>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => void openFile(doc.file!, false)}
                  >
                    Xem file
                  </button>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => void openFile(doc.file!, true)}
                  >
                    <Download size={14} />
                    Tải file
                  </button>
                </>
              )}
              <button
                type="button"
                className="button outline"
                disabled={busy}
                aria-label={`Sửa tài liệu ${doc.name}`}
                onClick={() => {
                  setEditing(doc.id);
                  setName(doc.name);
                  setURL(doc.url ?? '');
                  setFile(null);
                  setError('');
                  if (input.current) input.current.value = '';
                }}
              >
                <Pencil size={14} />
                Sửa
              </button>
              <button
                type="button"
                className="button outline"
                disabled={busy}
                aria-label={`Xóa tài liệu ${doc.name}`}
                onClick={() => {
                  if (
                    !latest.current.update((docs) =>
                      docs.filter((d) => d.id !== doc.id),
                    )
                  )
                    setError('Không lưu được thao tác xóa tài liệu.');
                  else {
                    if (editing === doc.id) reset();
                    setNotice(
                      'Đã bỏ tài liệu khỏi bước. File trên Storage được giữ để không làm hỏng bản sao lưu hoặc thiết bị đang offline.',
                    );
                  }
                }}
              >
                <Trash2 size={14} />
                Xóa
              </button>
            </div>
          </article>
        ))}
        <div className="document-editor">
          <label>
            Tên tài liệu
            <input
              maxLength={200}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Link làm việc
            <input
              type="url"
              maxLength={4000}
              value={url}
              disabled={busy}
              placeholder="https://…"
              onChange={(e) => setURL(e.target.value)}
            />
          </label>
          <label>
            Đính kèm file
            <input
              ref={input}
              type="file"
              disabled={busy || !owner || !supabase || !savedTask}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError('');
              }}
            />
          </label>
          <small>
            {!owner
              ? 'Đăng nhập để tải file; tên và link vẫn dùng được ở chế độ khách.'
              : !savedTask
                ? 'Lưu Task trước khi đính kèm file.'
                : 'File tối đa 20 MB. Cần bucket Storage riêng tư đã được cấu hình.'}
          </small>
          <div className="document-actions">
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy
                ? 'Đang tải và lưu…'
                : editing
                  ? 'Lưu tài liệu'
                  : 'Thêm tài liệu'}
            </button>
            {editing && (
              <button
                type="button"
                className="button outline"
                disabled={busy}
                onClick={reset}
              >
                Hủy sửa tài liệu
              </button>
            )}
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {fallback && (
          <a href={fallback} target="_blank" rel="noopener noreferrer">
            Mở file đã chuẩn bị (link có hiệu lực 60 giây)
          </a>
        )}
      </div>
    </details>
  );
}
