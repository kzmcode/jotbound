import { useMemo, useRef, useState } from 'react';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { useOnline } from '../../components/layout/StatusBanners';
import { Button } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Notice } from '../../components/ui/Feedback';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { formatDateTime } from '../../lib/date';
import { downloadText } from '../../lib/download';
import { useBooks } from '../books/BooksProvider';
import { useNotes, useTags } from '../notes/NotesProvider';
import { useProfile } from '../settings/ProfileProvider';
import { backupFileName, buildBackup, markdownFileName } from './backupFormat';
import type { BackupEnvelope, DuplicatePolicy } from './importPlan';
import { allToMarkdown } from './markdown';

const t = copy.backup;
/** 検証（Zod を含む）は読み込むときだけ取得する */
const loadImportPlan = () => import('./importPlan');
const loadBackupRepo = () => import('../../services/firebase/backup');
type PlanModule = Awaited<ReturnType<typeof loadImportPlan>>;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

type ImportState =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'preview'; mod: PlanModule; file: BackupEnvelope; confirming: boolean }
  | { step: 'importing'; done: number; total: number }
  | { step: 'done'; count: number }
  | { step: 'failed'; done: number };

/** JSON / Markdown の書き出しと JSON の読み込み（要件 SCR-07・FR-DATA） */
export function BackupSettings() {
  const user = useSessionUser();
  const online = useOnline();
  const booksState = useBooks();
  const notesState = useNotes();
  const tagsState = useTags();
  const { profile, setPreferredBook } = useProfile();
  const ready = booksState.status === 'ready' && notesState.status === 'ready' && tagsState.status === 'ready';
  const { books } = booksState;
  const { notes } = notesState;
  const { tags, tagsById } = tagsState;

  const [exported, setExported] = useState<string | null>(null);
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const [fileError, setFileError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<DuplicatePolicy>('skip');
  const inputRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const name = backupFileName();
    downloadText(name, `${JSON.stringify(buildBackup({ books, tags, notes, profile }), null, 2)}\n`, 'application/json');
    setExported(name);
  };
  const exportMarkdown = () => {
    const name = markdownFileName('notes');
    downloadText(name, allToMarkdown(books, notes, tagsById), 'text/markdown');
    setExported(name);
  };

  const preview = state.step === 'preview' ? state : null;
  const plan = useMemo(() => {
    if (!preview) return null;
    const existing = { books, tags, noteIds: new Set(notes.map((n) => n.id)) };
    return preview.mod.planImport(preview.file, existing, policy);
  }, [preview, books, tags, notes, policy]);

  const pickFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_FILE_BYTES) {
      setFileError(t.fileErrors.size);
      return;
    }
    setState({ step: 'reading' });
    try {
      const [mod, text] = await Promise.all([loadImportPlan(), file.text()]);
      try {
        setState({ step: 'preview', mod, file: mod.readBackup(text), confirming: false });
      } catch (e) {
        setFileError(e instanceof mod.BackupFileError ? t.fileErrors[e.reason] : t.fileErrors.read);
        setState({ step: 'idle' });
      }
    } catch {
      setFileError(t.fileErrors.read);
      setState({ step: 'idle' });
    }
  };

  const runImport = async () => {
    if (!plan || !preview) return;
    let done = 0;
    const total = preview.mod.writeCount(plan);
    setState({ step: 'importing', done: 0, total });
    try {
      const repo = await loadBackupRepo();
      await repo.applyImport(user.uid, plan, (d) => {
        done = d;
        setState({ step: 'importing', done: d, total });
      });
      if (plan.preferredBookId && (policy === 'update' || !profile?.preferredBookId)) setPreferredBook(plan.preferredBookId);
      setState({ step: 'done', count: total });
    } catch {
      setState({ step: 'failed', done });
    }
  };

  const updates = plan ? plan.counts.books.update + plan.counts.tags.update + plan.counts.notes.update : 0;
  const start = () => {
    if (!preview) return;
    if (updates > 0) setState({ ...preview, confirming: true });
    else void runImport();
  };

  return (
    <SurfaceCard className="flex flex-col gap-4 p-5">
      <p className="m-0 text-[13px] text-text-secondary" aria-live="polite">
        {ready ? t.summary(books.length, notes.length, tags.length) : t.loading}
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={exportJson} disabled={!ready}>
          {t.exportJson}
        </Button>
        <p className="m-0 text-[12px] leading-relaxed text-text-secondary">{t.exportJsonNote}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={exportMarkdown} disabled={!ready}>
          {t.exportMarkdown}
        </Button>
        <p className="m-0 text-[12px] leading-relaxed text-text-secondary">{t.exportMarkdownNote}</p>
      </div>
      {exported && (
        <Notice tone="success" live="polite">
          {t.exported(exported)}
        </Notice>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="import-file"
          onChange={(e) => void pickFile(e.target.files?.[0])}
        />
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={!ready || !online || state.step === 'reading' || state.step === 'importing'}
          aria-busy={state.step === 'reading'}
        >
          {state.step === 'reading' ? t.reading : t.importJson}
        </Button>
        <p className="m-0 text-[12px] leading-relaxed text-text-secondary">{online ? t.importNote : t.importOffline}</p>
        {fileError && <Notice tone="error">{fileError}</Notice>}
      </div>

      {preview && plan && (
        <section aria-labelledby="import-preview" data-testid="import-preview" className="flex flex-col gap-3 rounded-md border border-border bg-surface-subtle p-4">
          <h3 id="import-preview" className="m-0 text-[15px] font-semibold">
            {t.previewTitle}
          </h3>
          {plan.exportedAt && <p className="m-0 text-[12px] text-text-secondary">{t.exportedAt(formatDateTime({ toDate: () => new Date(plan.exportedAt!) }))}</p>}

          <SegmentedControl
            name="importPolicy"
            legend={t.policyLegend}
            value={policy}
            onChange={setPolicy}
            options={[
              { value: 'skip', label: t.policySkip },
              { value: 'update', label: t.policyUpdate },
            ]}
          />
          <p className="m-0 text-[12px] text-text-secondary">
            <span className="font-semibold text-text">{t.policyLegend}: </span>
            {policy === 'skip' ? t.policySkipNote : t.policyUpdateNote}
          </p>

          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-text-secondary">
                <th scope="col" className="py-1 text-left font-normal">
                  <span className="sr-only">{t.previewTitle}</span>
                </th>
                <th scope="col" className="py-1 text-right font-normal">{t.colNew}</th>
                <th scope="col" className="py-1 text-right font-normal">{t.colUpdate}</th>
                <th scope="col" className="py-1 text-right font-normal">{t.colSkip}</th>
              </tr>
            </thead>
            <tbody>
              {(['books', 'notes', 'tags'] as const).map((k) => (
                <tr key={k} data-testid={`import-row-${k}`} className="border-t border-border">
                  <th scope="row" className="py-1.5 text-left font-semibold">{t.kinds[k]}</th>
                  <td className="py-1.5 text-right tabular-nums">{plan.counts[k].create}</td>
                  <td className="py-1.5 text-right tabular-nums">{plan.counts[k].update}</td>
                  <td className="py-1.5 text-right tabular-nums">{plan.counts[k].skip}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="m-0 flex flex-col gap-1 pl-5 text-[12px] leading-relaxed">
            {plan.mergedTags > 0 && <li>{t.mergedTags(plan.mergedTags)}</li>}
            {plan.droppedTagRefs > 0 && <li>{t.droppedTags(plan.droppedTagRefs)}</li>}
            {plan.similarBooks.length > 0 && <li>{t.similarBooks(plan.similarBooks.join('、'))}</li>}
            <li>{preview.mod.writeCount(plan) > 0 ? t.writes(preview.mod.writeCount(plan)) : t.nothing}</li>
          </ul>
          {plan.invalid.length > 0 && (
            <details className="text-[12px]" data-testid="import-invalid">
              <summary className="cursor-pointer font-semibold text-error">{t.invalidSummary(plan.invalid.length)}</summary>
              <ul className="m-0 mt-2 flex flex-col gap-1 pl-5">
                {plan.invalid.slice(0, 50).map((item, i) => (
                  <li key={i}>{t.invalidItem(t.kinds[`${item.kind}s`], item.id, t.invalidReasons[item.reason])}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setState({ step: 'idle' })}>
              {t.cancel}
            </Button>
            <Button onClick={start} disabled={!online || preview.mod.writeCount(plan) === 0}>
              {t.start}
            </Button>
          </div>
        </section>
      )}

      {state.step === 'importing' && (
        <Notice live="polite">{t.importing(state.done, state.total)}</Notice>
      )}
      {state.step === 'done' && (
        <Notice tone="success" live="polite">
          {t.done(state.count)}
        </Notice>
      )}
      {state.step === 'failed' && <Notice tone="error">{t.failed(state.done)}</Notice>}

      <ConfirmDialog
        open={preview?.confirming === true}
        title={t.confirmTitle}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        destructive
        onCancel={() => preview && setState({ ...preview, confirming: false })}
        onConfirm={() => void runImport()}
      >
        <p className="m-0">{t.confirmBody(updates)}</p>
      </ConfirmDialog>
    </SurfaceCard>
  );
}
