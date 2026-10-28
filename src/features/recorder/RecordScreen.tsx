import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { RECORDING_LIMITS } from '../../app/config';
import { copy } from '../../app/copy';
import { AlertIcon, MicIcon } from '../../components/icons';
import { FlowHeader } from '../../components/layout/FlowHeader';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { SurfaceCard } from '../../components/ui/Card';
import { BookChooser } from '../books/BookChooser';
import { useProfile } from '../settings/ProfileProvider';
import { formatDuration } from './recordingUtils';
import { useRecorder } from './RecorderProvider';
import { VoiceOrb } from '../../components/VoiceOrb';
import { Waveform } from './Waveform';

function Problem({ title, body, extra, onRetry }: { title: string; body: string; extra?: string[]; onRetry?: () => void }) {
  return (
    <SurfaceCard className="flex flex-col gap-3 p-5" role="alert">
      <p className="m-0 flex items-center gap-2 text-[16px] font-semibold">
        <AlertIcon size={20} className="shrink-0 text-error" />
        {title}
      </p>
      <p className="m-0 text-[14px]">{body}</p>
      {extra?.map((t) => (
        <p key={t} className="m-0 text-[13px] text-text-secondary">
          {t}
        </p>
      ))}
      <div className="mt-2 flex flex-col gap-2">
        {onRetry && <Button onClick={onRetry}>{copy.record.retry}</Button>}
        <ButtonLink to="/notes/new" variant="secondary">
          {copy.record.manual}
        </ButtonLink>
        <ButtonLink to="/" variant="ghost">
          {copy.record.back}
        </ButtonLink>
      </div>
    </SurfaceCard>
  );
}

/** 録音画面（要件 SCR-04 / デザイン Recording）。現在のテーマをそのまま引き継ぐ。 */
export function RecordScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const recorder = useRecorder();
  const { profile } = useProfile();
  const { state } = recorder;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const live = state.status === 'recording';
  const active = state.status === 'recording' || state.status === 'paused';
  const elapsedMs = active ? state.elapsedMs : 0;

  // 「この本で録音」から来た場合はその本を選択する
  const paramBook = params.get('bookId');
  const { setBookId, bookId } = recorder;
  useEffect(() => {
    if (paramBook && state.status === 'idle') setBookId(paramBook);
  }, [paramBook, state.status, setBookId]);

  // 保存できたら確認画面へ
  useEffect(() => {
    if (state.status === 'saved') navigate(`/review/${state.draftId}`, { replace: true });
  }, [state, navigate]);

  // 録音していない状態でこの画面を離れたら、エラー表示などを初期化する
  const { reset } = recorder;
  useEffect(() => () => reset(), [reset]);

  const startFromHere = () => recorder.start(bookId ?? paramBook ?? profile?.preferredBookId ?? null);
  const leave = () => {
    if (active && elapsedMs >= RECORDING_LIMITS.minDurationMs) setConfirmDiscard(true);
    else {
      recorder.cancel();
      navigate('/');
    }
  };

  const status =
    state.status === 'preparing'
      ? state.needsPermission
        ? copy.record.permissionRequired
        : copy.record.preparing
      : state.status === 'recording'
        ? copy.record.recording
        : state.status === 'paused'
          ? copy.record.paused
          : state.status === 'saving'
            ? copy.record.saving
            : null;

  const problem =
    state.status === 'denied' ? (
      <Problem title={copy.record.deniedTitle} body={copy.record.deniedBody} extra={[copy.record.deniedIos, copy.record.deniedDesktop]} onRetry={startFromHere} />
    ) : state.status === 'noDevice' ? (
      <Problem title={copy.record.noDeviceTitle} body={copy.record.noDeviceBody} onRetry={startFromHere} />
    ) : state.status === 'unsupported' ? (
      <Problem title={copy.record.unsupportedTitle} body={copy.record.unsupportedBody} />
    ) : state.status === 'error' ? (
      <Problem
        title={state.reason === 'tooShort' ? copy.record.tooShort : copy.record.failedTitle}
        body={state.reason === 'saveFailed' ? copy.record.saveFailed(state.detail) : state.reason === 'tooShort' ? '' : copy.record.failedBody}
        onRetry={startFromHere}
      />
    ) : null;

  return (
    <>
      <FlowHeader eyebrow={copy.record.eyebrow} backLabel={copy.record.back} onBack={leave} />
      <div className="text-center">
        <h1 lang="en" className="m-0 text-[29px] font-semibold leading-[1.15] tracking-[-0.045em]">
          {copy.record.title}
        </h1>
        <p className="m-0 mt-2 text-[13px] text-text-secondary">{copy.record.helper}</p>
      </div>

      {problem ? (
        <div className="mt-8">{problem}</div>
      ) : (
        <>
          <div className="mt-8 flex flex-col items-center gap-4">
            {/* 状態は色だけでなく文字で示す。録音時間は毎秒読み上げない */}
            <p
              role="status"
              className="m-0 inline-flex min-h-9 items-center gap-2 rounded-pill border border-border bg-surface px-4 text-[12px] font-semibold tracking-[0.08em] text-text"
            >
              {live && <span aria-hidden="true" className="size-2 rounded-full bg-error" />}
              {status ?? copy.record.startCta}
            </p>
            <p className="m-0 font-semibold tabular-nums tracking-[-0.04em] text-[52px] leading-none" aria-hidden={!active}>
              {formatDuration(elapsedMs)}
            </p>
            <Waveform levels={active ? state.levels : []} active={live} />
          </div>

          <div className="mt-6">
            {state.status === 'idle' ? (
              <VoiceOrb label={copy.record.startCta} onActivate={startFromHere} />
            ) : (
              <VoiceOrb
                label={copy.record.orbStop}
                onActivate={recorder.stop}
                live={live}
                disabled={!active}
                icon="stop"
                showLabel={false}
              />
            )}
          </div>

          <p className="m-0 mt-6 text-center text-[13px] leading-relaxed text-text-secondary">
            {copy.record.speakHint}
            <br />
            {copy.record.oneMemo} {copy.record.limit(RECORDING_LIMITS.maxDurationMs / 1000)}
          </p>

          <div className="mt-6">
            <BookChooser value={bookId} onChange={setBookId} />
          </div>

          {active && (
            <div className="mt-8 flex flex-col gap-2">
              <Button onClick={recorder.stop} icon={<span aria-hidden="true" className="size-3 rounded-[3px] bg-current" />}>
                {copy.record.stopCta}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {state.status === 'paused' ? (
                  <Button variant="secondary" onClick={recorder.resume} icon={<MicIcon size={16} />}>
                    {copy.record.resume}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={recorder.pause}>
                    {copy.record.pause}
                  </Button>
                )}
                <Button variant="secondary" onClick={leave}>
                  {copy.record.cancel}
                </Button>
              </div>
            </div>
          )}
          {state.status === 'preparing' && (
            <div className="mt-8">
              <Button variant="secondary" className="w-full" onClick={leave}>
                {copy.record.cancel}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title={copy.record.discardTitle}
        confirmLabel={copy.record.discardConfirm}
        cancelLabel={copy.record.keepRecording}
        destructive
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          recorder.cancel();
          navigate('/');
        }}
      >
        <p className="m-0">{copy.record.discardBody}</p>
      </ConfirmDialog>
    </>
  );
}
