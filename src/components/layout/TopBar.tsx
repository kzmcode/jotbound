import { Link } from 'react-router';
import { APP_NAME } from '../../app/config';
import { useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { IconLink } from '../ui/Button';
import { SearchIcon } from '../icons';
import { Banners } from './StatusBanners';

/** タブ画面共通のヘッダー: アプリ名・検索・ログイン状態（アカウント）。 */
export function TopBar() {
  const user = useSessionUser();
  const name = user.displayName || user.email || 'Google';
  return (
    <>
    <header className="mb-6 flex min-h-11 items-center justify-between">
      <Link to="/" className="flex items-baseline gap-0.5 rounded-sm text-[22px] font-bold leading-none tracking-[-0.04em] text-text no-underline">
        {APP_NAME}
        <span aria-hidden="true" className="inline-block size-[7px] rounded-full bg-accent" />
      </Link>
      <div className="flex items-center gap-1">
        <IconLink to="/notes" label={copy.header.search}>
          <SearchIcon />
        </IconLink>
        <Link
          to="/settings"
          aria-label={copy.header.account(name)}
          title={name}
          className="ml-1 inline-flex size-11 items-center justify-center rounded-full"
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-[14px] font-semibold text-accent-strong"
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        </Link>
      </div>
    </header>
    <Banners />
    </>
  );
}
