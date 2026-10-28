import { useMemo, useState, type FormEvent } from 'react';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { Button } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Notice } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import type { TagRecord } from '../../services/firebase/tags';
import type { TagCategory } from '../../types/models';
import { loadTagsRepo, useNotes, useTags } from '../notes/NotesProvider';
import { normalizeTagName } from './tagUtils';

type Action =
  | { kind: 'rename'; tag: TagRecord; name: string }
  | { kind: 'merge'; tag: TagRecord; targetId: string; confirming: boolean }
  | { kind: 'delete'; tag: TagRecord };

/** タグの追加・改名・統合・削除（要件 SCR-07・FR-TAG） */
export function TagManager() {
  const user = useSessionUser();
  const { tags } = useTags();
  const { notes } = useNotes();
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<TagCategory>('topic');
  const [fieldError, setFieldError] = useState<string>();

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) for (const id of [...n.topicTagIds, ...n.usageTagIds]) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [notes]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setAction(null);
    } catch {
      setError(copy.settings.tagError);
    } finally {
      setBusy(false);
    }
  };

  const isDuplicate = (name: string, category: TagCategory, exceptId?: string) =>
    tags.some((t) => t.category === category && t.id !== exceptId && t.normalizedName === normalizeTagName(name));

  const addTag = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return setFieldError(copy.settings.tagNameRequired);
    if (isDuplicate(name, newCategory)) return setFieldError(copy.settings.tagDuplicate);
    setFieldError(undefined);
    void run(async () => {
      const repo = await loadTagsRepo();
      await repo.createTag(user.uid, name, normalizeTagName(name), newCategory);
      setNewName('');
    });
  };

  const section = (category: TagCategory, title: string) => {
    const list = tags.filter((t) => t.category === category);
    return (
      <div>
        <h3 className="m-0 mb-2 text-[13px] font-semibold text-text-secondary">{title}</h3>
        {list.length === 0 ? (
          <p className="m-0 text-[13px] text-text-secondary">{copy.settings.tagsEmpty}</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-border p-0">
            {list.map((t) => {
              const count = usage.get(t.id) ?? 0;
              const current = action && action.tag.id === t.id ? action : null;
              return (
                <li key={t.id} className="py-2">
                  <div className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">#{t.name}</span>
                    <span className="text-[12px] text-text-secondary">{copy.settings.tagUsage(count)}</span>
                    <span className="flex gap-1">
                      <Button variant="ghost" className="min-h-9 px-2 text-[12px]" onClick={() => setAction({ kind: 'rename', tag: t, name: t.name })}>
                        {copy.settings.tagRename}
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-9 px-2 text-[12px]"
                        disabled={list.length < 2}
                        onClick={() => setAction({ kind: 'merge', tag: t, targetId: '', confirming: false })}
                      >
                        {copy.settings.tagMerge}
                      </Button>
                      <Button variant="ghost" className="min-h-9 px-2 text-[12px] !text-error" onClick={() => setAction({ kind: 'delete', tag: t })}>
                        {copy.settings.tagDelete}
                      </Button>
                    </span>
                  </div>
                  {current?.kind === 'rename' && (
                    <form
                      className="mt-2 flex items-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = current.name.trim();
                        if (!name) return setError(copy.settings.tagNameRequired);
                        if (isDuplicate(name, category, t.id)) return setError(copy.settings.tagDuplicate);
                        void run(async () => {
                          const repo = await loadTagsRepo();
                          await repo.renameTag(user.uid, t.id, name, normalizeTagName(name));
                        });
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <TextField
                          label={copy.settings.tagRenameLabel(t.name)}
                          value={current.name}
                          maxLength={50}
                          autoFocus
                          onChange={(e) => setAction({ ...current, name: e.target.value })}
                        />
                      </div>
                      <Button type="submit" className="px-4" disabled={busy}>
                        {copy.settings.tagSave}
                      </Button>
                      <Button variant="secondary" className="px-3" onClick={() => setAction(null)} disabled={busy}>
                        {copy.settings.tagCancel}
                      </Button>
                    </form>
                  )}
                  {current?.kind === 'merge' && (
                    <div className="mt-2 flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <SelectField
                          label={copy.settings.tagMergeLabel(t.name)}
                          value={current.targetId}
                          onChange={(e) => setAction({ ...current, targetId: e.target.value })}
                        >
                          <option value="">—</option>
                          {list
                            .filter((o) => o.id !== t.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                        </SelectField>
                      </div>
                      <Button className="px-4" disabled={!current.targetId || busy} onClick={() => setAction({ ...current, confirming: true })}>
                        {copy.settings.tagMerge}
                      </Button>
                      <Button variant="secondary" className="px-3" onClick={() => setAction(null)} disabled={busy}>
                        {copy.settings.tagCancel}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const mergeTarget = action?.kind === 'merge' ? tags.find((t) => t.id === action.targetId) : undefined;

  return (
    <SurfaceCard className="flex flex-col gap-5 p-5">
      <form onSubmit={addTag} className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <TextField
            label={copy.settings.tagAddLabel}
            value={newName}
            maxLength={50}
            onChange={(e) => setNewName(e.target.value)}
            error={fieldError}
          />
          <SelectField label={copy.settings.tagAddCategory} value={newCategory} onChange={(e) => setNewCategory(e.target.value as TagCategory)}>
            <option value="topic">{copy.settings.tagsTopic}</option>
            <option value="usage">{copy.settings.tagsUsage}</option>
          </SelectField>
        </div>
        <Button type="submit" variant="secondary" disabled={busy}>
          {copy.settings.tagAdd}
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {section('topic', copy.settings.tagsTopic)}
      {section('usage', copy.settings.tagsUsage)}

      <ConfirmDialog
        open={action?.kind === 'merge' && action.confirming}
        title={copy.settings.tagMerge}
        confirmLabel={copy.settings.tagMergeConfirm}
        cancelLabel={copy.settings.tagCancel}
        busy={busy}
        onCancel={() => action?.kind === 'merge' && setAction({ ...action, confirming: false })}
        onConfirm={() => {
          if (action?.kind !== 'merge' || !mergeTarget) return;
          void run(async () => {
            const repo = await loadTagsRepo();
            await repo.mergeTag(user.uid, action.tag.category, action.tag.id, mergeTarget.id);
          });
        }}
      >
        {action?.kind === 'merge' && mergeTarget && (
          <p className="m-0">{copy.settings.tagMergeBody(action.tag.name, mergeTarget.name, usage.get(action.tag.id) ?? 0)}</p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={action?.kind === 'delete'}
        title={copy.settings.tagDeleteTitle}
        confirmLabel={copy.settings.tagDelete}
        cancelLabel={copy.settings.tagCancel}
        destructive
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={() => {
          if (action?.kind !== 'delete') return;
          void run(async () => {
            const repo = await loadTagsRepo();
            await repo.deleteTag(user.uid, action.tag.category, action.tag.id);
          });
        }}
      >
        {action?.kind === 'delete' && <p className="m-0">{copy.settings.tagDeleteBody(action.tag.name, usage.get(action.tag.id) ?? 0)}</p>}
      </ConfirmDialog>
    </SurfaceCard>
  );
}
