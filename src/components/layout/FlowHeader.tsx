import { useNavigate } from 'react-router';
import { IconButton } from '../ui/Button';
import { ChevronLeftIcon } from '../icons';
import { Banners } from './StatusBanners';

/** 録音・確認など、下部ナビを出さないフロー画面のヘッダー。 */
export function FlowHeader({ eyebrow, backLabel, onBack }: { eyebrow: string; backLabel: string; onBack?: () => void }) {
  const navigate = useNavigate();
  return (
    <>
    <header className="mb-8 grid min-h-11 grid-cols-[44px_1fr_44px] items-center">
      <IconButton label={backLabel} onClick={onBack ?? (() => navigate(-1))} className="glass">
        <ChevronLeftIcon />
      </IconButton>
      <p className="eyebrow m-0 text-center" aria-hidden="true">
        {eyebrow}
      </p>
    </header>
    <Banners />
    </>
  );
}
