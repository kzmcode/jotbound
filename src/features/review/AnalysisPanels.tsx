import { copy } from '../../app/copy';
import { CheckIcon } from '../../components/icons';
import { Button, ButtonLink } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { Notice } from '../../components/ui/Feedback';
import type { ExtractedMemo, ExtractionErrorKind } from '../../services/ai/types';

/** 初回の AI 解析前のプライバシー説明（要件 6章 8） */
export function AnalysisConsent({ onAgree, onManual, disabled }: { onAgree: () => void; onManual: () => void; disabled: boolean }) {
  const c = copy.review.consent;
  return (
    <SurfaceCard className="flex flex-col gap-3 p-5">
      <h2 className="m-0 text-[17px] font-bold">{c.title}</h2>
      {c.body.map((p) => (
        <p key={p} className="m-0 text-[14px] leading-relaxed">
          {p}
        </p>
      ))}
      <p className="m-0 text-[12px] text-text-secondary">{c.remember}</p>
      {disabled && <Notice>{copy.review.offlineAnalysis}</Notice>}
      <Button onClick={onAgree} disabled={disabled}>
        {c.agree}
      </Button>
      <Button variant="secondary" onClick={onManual}>
        {c.manual}
      </Button>
    </SurfaceCard>
  );
}

/**
 * 解析中。進捗率は取得できないため、架空の 0〜100% は表示せず段階だけを示す（SCREEN_SPECS 3章）。
 * 1段階目は AI への1回のリクエスト（文字起こしと抽出を同時に行う）、2・3段階目は端末内の処理。
 */
export function AnalysisProgress({ step, onCancel }: { step: number; onCancel: () => void }) {
  const p = copy.review.processing;
  return (
    <SurfaceCard className="flex flex-col items-center gap-5 px-5 py-8">
      <div className="orb" data-live="true" aria-hidden="true">
        <div className="orb-halo orb-outer !size-[132px]">
          <div className="orb-halo orb-inner !size-[100px]">
            <span className="block size-[58px] rounded-full bg-accent" />
          </div>
        </div>
      </div>
      <div className="text-center" role="status" aria-live="polite">
        <h2 className="m-0 text-[18px] font-bold">{p.title}</h2>
        <p className="m-0 mt-1 text-[13px] text-text-secondary">{p.helper}</p>
      </div>
      <ol className="m-0 flex w-full max-w-xs list-none flex-col gap-2 p-0" aria-label={p.title}>
        {p.steps.map((label, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'waiting';
          return (
            <li key={label} className="flex items-center gap-3 text-[14px]" aria-current={state === 'active' ? 'step' : undefined}>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  state === 'done' ? 'bg-accent text-accent-fg' : state === 'active' ? 'border-2 border-accent text-accent-strong' : 'border border-border text-text-secondary'
                }`}
                aria-hidden="true"
              >
                {state === 'done' ? <CheckIcon size={14} strokeWidth={2.4} /> : i + 1}
              </span>
              <span className={state === 'waiting' ? 'text-text-secondary' : 'font-medium'}>{label}</span>
              <span className="sr-only">
                {state === 'done' ? p.stepDone : state === 'active' ? p.stepActive : p.stepWaiting}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex w-full flex-col items-center gap-1">
        <Button variant="secondary" onClick={onCancel} className="w-full">
          {p.cancel}
        </Button>
        <p className="m-0 text-[12px] text-text-secondary">{p.cancelNote}</p>
      </div>
    </SurfaceCard>
  );
}

/** 解析の失敗。自動で再試行せず、利用者が再試行・手入力・録音し直しを選ぶ（要件 FR-AI / 10章） */
export function AnalysisFailed({
  kind,
  attempts,
  online,
  onRetry,
  onManual,
}: {
  kind: ExtractionErrorKind;
  attempts: number;
  online: boolean;
  onRetry: () => void;
  onManual: () => void;
}) {
  const f = copy.review.failed;
  return (
    <SurfaceCard className="flex flex-col gap-3 p-5" data-testid="analysis-failed" data-kind={kind}>
      <h2 className="m-0 text-[17px] font-bold">{f.title}</h2>
      <Notice tone="error">{f.kinds[kind]}</Notice>
      <p className="m-0 text-[13px]">{f.kept}</p>
      {attempts > 0 && <p className="m-0 text-[12px] text-text-secondary">{f.attempts(attempts)}</p>}
      {kind === 'tooLarge' ? (
        <ButtonLink to="/record">{f.rerecord}</ButtonLink>
      ) : (
        <>
          <Button onClick={onRetry} disabled={!online}>
            {f.retry}
          </Button>
          <p className="-mt-1 m-0 text-center text-[12px] text-text-secondary">{online ? f.retryNote : copy.review.offlineAnalysis}</p>
        </>
      )}
      <Button variant="secondary" onClick={onManual}>
        {f.manual}
      </Button>
    </SurfaceCard>
  );
}

/** AI の警告・アプリの検証結果・元の文字起こし（SCR-05: 文字起こしは折りたたみ、警告は目立つ形で） */
export function ExtractionNotices({ memo }: { memo: ExtractedMemo }) {
  const r = copy.review;
  const warnings = [
    ...(memo.multipleMemoDetected ? [r.multiple] : []),
    ...memo.issues.map((i) => r.issues[i]),
    ...memo.warnings,
  ];
  return (
    <>
      {warnings.length > 0 && (
        <div role="status" className="rounded-md border-2 border-accent bg-surface px-4 py-3" data-testid="ai-warnings">
          <p className="m-0 text-[13px] font-semibold">{r.aiWarningsTitle}</p>
          <ul className="m-0 mt-1 flex flex-col gap-1 pl-5 text-[13px] leading-relaxed">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <Notice>{r.aiNote}</Notice>
      <details className="rounded-md border border-border bg-surface px-4 py-3 text-[13px]">
        <summary className="cursor-pointer font-semibold">{r.transcript}</summary>
        <p className="m-0 mt-2 whitespace-pre-wrap leading-relaxed">{memo.transcript || r.transcriptEmpty}</p>
      </details>
    </>
  );
}
