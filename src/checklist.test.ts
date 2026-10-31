import { expect, it } from 'vitest';
import {
  CHECKLIST_BUCKET,
  MAX_CHECKLIST_FILE,
  documentURL,
  reorderChecklist,
  validStepDocument,
} from './checklist';
import { validTask, type Task } from './tasks';
import {
  emptyWorkspace,
  validWorkspace,
  workspaceFingerprint,
} from './workspace';
const old: Task = {
  id: 't',
  title: 'Old task',
  notes: '',
  group: 'do',
  color: '',
  completed: false,
  checklist: [
    { id: 'a', text: 'Keep', done: true },
    { id: 'b', text: 'Next', done: false },
  ],
};
const doc = {
  id: 'd',
  name: 'File',
  url: 'https://docs.google.com/document/d/example',
  file: {
    bucket: CHECKLIST_BUCKET,
    path: '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222',
    name: 'file.pdf',
    size: 123,
    mime: 'application/pdf',
  },
} as const;
it('keeps legacy tasks valid and round-trips document metadata through the existing workspace schema', () => {
  expect(validTask(old)).toBe(true);
  const w = emptyWorkspace();
  w.tasks.tasks = [
    { ...old, checklist: [{ ...old.checklist![0], documents: [doc] }] },
  ];
  expect(validWorkspace(JSON.parse(JSON.stringify(w)))).toBe(true);
  expect(
    JSON.parse(JSON.stringify(w)).tasks.tasks[0].checklist[0].documents[0],
  ).toEqual(doc);
  expect(old.checklist![0].documents).toBeUndefined();
});
it('reorders whole steps without changing content, completion or documents and fingerprint observes the new order', () => {
  const steps = [{ ...old.checklist![0], documents: [doc] }, old.checklist![1]];
  const before = structuredClone(steps),
    next = reorderChecklist(steps, 'a', 'b');
  expect(next).toEqual([steps[1], steps[0]]);
  expect(steps).toEqual(before);
  expect(next[1]).toBe(steps[0]);
  expect(reorderChecklist(steps, 'missing', 'b')).toBe(steps);
  expect(reorderChecklist(steps, 'a', 'a')).toBe(steps);
  const a = emptyWorkspace(),
    b = emptyWorkspace();
  a.tasks.tasks = [{ ...old, checklist: steps }];
  b.tasks.tasks = [{ ...old, checklist: next }];
  expect(workspaceFingerprint(a)).not.toBe(workspaceFingerprint(b));
});
it('rejects executable, credentialed and invalid links while supporting common working links', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///tmp/a',
    'https://user:pass@example.com',
    'not a URL',
  ])
    expect(documentURL(url)).toBeNull();
  for (const url of [
    'https://www.youtube.com/watch?v=123',
    'https://figma.com/file/a',
    'https://notion.so/a',
  ])
    expect(documentURL(url)).toBe(url);
  expect(documentURL(' https://example.com ')).toBe('https://example.com/');
});
it('validates optional names, multiple documents and file metadata without accepting binary data URLs or oversized files', () => {
  expect(validStepDocument({ id: 'name', name: 'Tên file' })).toBe(true);
  expect(validStepDocument(doc)).toBe(true);
  for (const file of [
    { ...doc.file, bucket: 'other' },
    { ...doc.file, path: 'data:binary' },
    { ...doc.file, size: MAX_CHECKLIST_FILE + 1 },
  ])
    expect(validStepDocument({ ...doc, file })).toBe(false);
  expect(
    validTask({
      ...old,
      checklist: [{ ...old.checklist![0], documents: [doc, doc] }],
    }),
  ).toBe(false);
  expect(
    validTask({
      ...old,
      checklist: [
        {
          ...old.checklist![0],
          documents: [{ ...doc, url: 'javascript:bad' }],
        },
      ],
    }),
  ).toBe(false);
});
