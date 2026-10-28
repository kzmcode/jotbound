import { copy } from '../../app/copy';

/** 実際の音量に連動した波形（装飾）。動きを減らす設定では文字表示に置き換える。 */
export function Waveform({ levels, active }: { levels: number[]; active: boolean }) {
  const bars = Array.from({ length: 28 }, (_, i) => levels[levels.length - 28 + i] ?? 0);
  return (
    <div className="flex h-16 items-center justify-center">
      <div aria-hidden="true" className="flex h-full items-center gap-[5px] motion-reduce:hidden">
        {bars.map((v, i) => (
          <span
            key={i}
            className={`w-[5px] rounded-full transition-[height] duration-150 ${active ? 'bg-accent' : 'bg-halo-inner'}`}
            style={{ height: `${Math.max(8, Math.round(v * 64))}px` }}
          />
        ))}
      </div>
      <p className="m-0 hidden text-[13px] text-text-secondary motion-reduce:block">{active ? copy.record.reducedMotion : ''}</p>
    </div>
  );
}
