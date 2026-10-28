import { useId, useState, type KeyboardEvent } from 'react';
import { copy } from '../../app/copy';
import { PlusIcon } from '../../components/icons';
import type { TagRecord } from '../../services/firebase/tags';
import type { TagCategory } from '../../types/models';
import type { TagChoice } from '../notes/noteDraft';
import { findSimilarTags, normalizeTagName, RECOMMENDED_TAGS } from './tagUtils';

/**
 * タグの選択。既存タグを候補として優先し、新規タグは名前を確認してから追加する。
 * 新規タグは保存時に作成され、それまでは Firestore に存在しない（要件 FR-TAG: AI が確定作成しない）。
 */
export function TagPicker({
  label,
  hint,
  category,
  value,
  tags,
  onChange,
  createId,
  proposals = [],
}: {
  label: string;
  hint?: string;
  category: TagCategory;
  value: TagChoice[];
  tags: readonly TagRecord[];
  onChange: (value: TagChoice[]) => void;
  /** 新規タグの ID を発行する */
  createId: () => string;
  /** AI のタグ候補のうち既存タグに一致しなかったもの。選んだときだけ新規タグとして追加する */
  proposals?: readonly string[];
}) {
  const id = useId();
  const [text, setText] = useState('');
  const name = text.trim().slice(0, 50);
  const key = normalizeTagName(name);

  const pool = tags.filter((t) => t.category === category && !value.some((v) => v.id === t.id));
  const suggestions = (
    key ? pool.filter((t) => t.normalizedName.includes(key) || key.includes(t.normalizedName)) : pool
  ).slice(0, 8);

  const { same } = findSimilarTags(tags, name, category);
  const pendingSame = value.find((v) => normalizeTagName(v.name) === key);

  const openProposals = proposals.filter((p) => !value.some((v) => normalizeTagName(v.name) === normalizeTagName(p)));
  const addProposal = (proposal: string) => {
    const existing = findSimilarTags(tags, proposal, category).same;
    add(existing ? { id: existing.id, name: existing.name, isNew: false } : { id: createId(), name: proposal, isNew: true });
  };

  const add = (choice: TagChoice) => {
    if (value.some((v) => v.id === choice.id)) return;
    onChange([...value, choice]);
    setText('');
  };
  const addTyped = () => {
    if (!key || pendingSame) return;
    if (same) add({ id: same.id, name: same.name, isNew: false });
    else add({ id: createId(), name, isNew: true });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addTyped();
    }
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-[13px] font-semibold">
        {label}
      </span>
      {value.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {value.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v.id !== t.id))}
                aria-label={copy.tagPicker.remove(t.name)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-halo-outer px-3 text-[13px] font-medium text-text hover:brightness-95"
              >
                #{t.name}
                {t.isNew && <span className="rounded-pill bg-surface px-1.5 text-[10px] text-accent-strong">{copy.tagPicker.newBadge}</span>}
                <span aria-hidden="true" className="text-text-secondary">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length >= RECOMMENDED_TAGS[category] + 1 && (
        <p className="m-0 text-[12px] text-text-secondary">{copy.tagPicker.overRecommended(RECOMMENDED_TAGS[category] + 1)}</p>
      )}
      <div className="flex gap-2">
        <label htmlFor={`${id}-input`} className="sr-only">
          {copy.tagPicker.inputLabel(label)}
        </label>
        <input
          id={`${id}-input`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={copy.tagPicker.placeholder}
          maxLength={50}
          autoComplete="off"
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="block min-w-0 flex-1 rounded-sm border border-border bg-surface px-4 py-2.5 text-base text-text placeholder:text-text-secondary/70 hover:border-accent focus-visible:border-accent"
        />
        <button
          type="button"
          onClick={addTyped}
          disabled={!key || Boolean(pendingSame)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-sm border border-border bg-surface px-3 text-[13px] font-semibold text-accent-strong disabled:opacity-50"
        >
          <PlusIcon size={16} />
          {copy.tagPicker.add}
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="m-0 text-[12px] text-text-secondary">
          {hint}
        </p>
      )}
      {key && !pendingSame && (
        <p className="m-0 text-[12px] text-text-secondary" aria-live="polite">
          {same ? copy.tagPicker.useExisting(same.name) : copy.tagPicker.createNew(name)}
        </p>
      )}
      {openProposals.length > 0 && (
        <div>
          <p className="m-0 mb-1 text-[12px] font-medium text-accent-strong">{copy.tagPicker.proposals}</p>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {openProposals.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => addProposal(p)}
                  aria-label={copy.tagPicker.addProposal(p)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-pill border border-dashed border-accent bg-surface px-3 text-[12px] text-text hover:bg-halo-outer"
                >
                  <PlusIcon size={14} />#{p}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {suggestions.length > 0 && (
        <div>
          {key && !same && <p className="m-0 mb-1 text-[12px] text-text-secondary">{copy.tagPicker.similar}</p>}
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => add({ id: t.id, name: t.name, isNew: false })}
                  className="inline-flex min-h-9 items-center rounded-pill border border-border bg-surface-subtle px-3 text-[12px] text-text-secondary hover:border-accent hover:text-text"
                >
                  #{t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
