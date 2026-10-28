import { MicIcon } from './icons';

/**
 * 中央の円形録音ボタン＋2重ハロー。
 * `live` は録音が実際に開始・許可済みのときだけ true にする（準備中・許可待ちでは脈動させない）。
 */
export function VoiceOrb({
  label,
  helper,
  onActivate,
  live = false,
  disabled = false,
  icon = 'mic',
  showLabel = true,
}: {
  label: string;
  helper?: string;
  onActivate: () => void;
  live?: boolean;
  disabled?: boolean;
  icon?: 'mic' | 'stop';
  /** false でもラベルは読み上げ用に残す */
  showLabel?: boolean;
}) {
  return (
    <div className="orb flex flex-col items-center" data-live={live}>
      <div className="orb-halo orb-outer">
        <div className="orb-halo orb-inner">
          <button type="button" className="orb-button disabled:opacity-60" onClick={onActivate} disabled={disabled} aria-describedby={helper ? 'orb-helper' : undefined}>
            {icon === 'stop' ? (
              <span aria-hidden="true" className="size-7 rounded-[7px] bg-current" />
            ) : (
              <MicIcon size={34} strokeWidth={2} />
            )}
            <span className="sr-only">{label}</span>
          </button>
        </div>
      </div>
      {showLabel && (
        <p className="m-0 mt-4 text-[13px] font-semibold text-text" aria-hidden="true">
          {label}
        </p>
      )}
      {helper && (
        <p id="orb-helper" className="m-0 text-[12px] text-text-secondary">
          {helper}
        </p>
      )}
    </div>
  );
}
