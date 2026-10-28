import { NavLink } from 'react-router';
import { copy } from '../../app/copy';
import { BooksIcon, HomeIcon, NoteIcon, SettingsIcon } from '../icons';

// 要件定義書 SCR-01 の順序: ホーム／本棚／メモ／設定
const items = [
  { to: '/', label: copy.nav.home, Icon: HomeIcon, end: true },
  { to: '/books', label: copy.nav.books, Icon: BooksIcon, end: false },
  { to: '/notes', label: copy.nav.notes, Icon: NoteIcon, end: false },
  { to: '/settings', label: copy.nav.settings, Icon: SettingsIcon, end: false },
];

export function BottomNav() {
  return (
    <nav aria-label={copy.nav.label} className="glass safe-bottom fixed inset-x-0 bottom-0 z-20 rounded-none border-x-0 border-b-0">
      <ul className="mx-auto grid max-w-content list-none grid-cols-4 p-0 px-2">
        {items.map(({ to, label, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-sm text-[11px] no-underline transition-colors duration-[160ms] ${
                  isActive ? 'font-bold text-accent-strong' : 'text-text-secondary hover:text-text'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.1 : 1.8} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
