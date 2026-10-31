export const CHECKLIST_BUCKET = 'lbd-checklist-files';
export const MAX_CHECKLIST_FILE = 20 * 1024 * 1024;
export type ChecklistFile = {
  bucket: typeof CHECKLIST_BUCKET;
  path: string;
  name: string;
  size: number;
  mime: string;
};
export type StepDocument = {
  id: string;
  name: string;
  url?: string;
  file?: ChecklistFile;
};
export type ChecklistStep = {
  id: string;
  text: string;
  done: boolean;
  documents?: StepDocument[];
};
export function documentURL(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.href.length <= 4000
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function validStepDocument(value: unknown): value is StepDocument {
  if (!value || typeof value !== 'object') return false;
  const d = value as StepDocument;
  const f = d.file;
  return (
    typeof d.id === 'string' &&
    !!d.id &&
    typeof d.name === 'string' &&
    !!d.name.trim() &&
    d.name.length <= 200 &&
    (d.url === undefined ||
      (typeof d.url === 'string' && !!documentURL(d.url))) &&
    (f === undefined ||
      (!!f &&
        f.bucket === CHECKLIST_BUCKET &&
        typeof f.path === 'string' &&
        /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(f.path) &&
        typeof f.name === 'string' &&
        !!f.name &&
        f.name.length <= 255 &&
        Number.isSafeInteger(f.size) &&
        f.size >= 0 &&
        f.size <= MAX_CHECKLIST_FILE &&
        typeof f.mime === 'string' &&
        f.mime.length <= 255))
  );
}
export function reorderChecklist(
  steps: ChecklistStep[],
  from: string,
  to: string,
): ChecklistStep[] {
  const a = steps.findIndex((s) => s.id === from),
    b = steps.findIndex((s) => s.id === to);
  if (a < 0 || b < 0 || a === b) return steps;
  const next = [...steps];
  const [step] = next.splice(a, 1);
  next.splice(b, 0, step);
  return next;
}
