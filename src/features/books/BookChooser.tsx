import { useId } from 'react';
import { copy } from '../../app/copy';
import { BooksIcon } from '../../components/icons';
import { useBooks } from './BooksProvider';

/** 録音に紐づける本の選択（任意。未選択でも録音できる。要件 SCR-01） */
export function BookChooser({ value, onChange, label = copy.record.bookLabel }: { value: string | null; onChange: (id: string | null) => void; label?: string }) {
  const id = useId();
  const { books } = useBooks();
  if (books.length === 0) return null;
  const sorted = [...books].sort((a, b) => a.titleNormalized.localeCompare(b.titleNormalized, 'ja'));
  return (
    <div className="flex justify-center">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative inline-flex max-w-full items-center">
        <BooksIcon size={16} className="pointer-events-none absolute left-3.5 z-[1] text-accent-strong" />
        <select
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="glass min-h-11 max-w-[min(100%,320px)] appearance-none truncate rounded-pill py-2 pl-10 pr-9 text-[13px] font-medium text-text"
        >
          <option value="">{copy.record.bookNone}</option>
          {sorted.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-3.5 z-[1] text-[10px] text-text-secondary">
          ▼
        </span>
      </div>
    </div>
  );
}
