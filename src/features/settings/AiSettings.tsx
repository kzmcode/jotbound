import { useState } from 'react';
import { copy } from '../../app/copy';
import { useOnline } from '../../components/layout/StatusBanners';
import { Button } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { Notice } from '../../components/ui/Feedback';
import { hasAiConsent, setAiConsent } from '../../lib/aiConsent';
import { loadExtractionProvider } from '../../services/ai';
import { classifyAIError } from '../../services/ai/errors';

type Check = { status: 'idle' | 'checking' | 'ok' } | { status: 'error'; message: string };

/** AI 利用の注意と接続診断（要件 SCR-07） */
export function AiSettings() {
  const online = useOnline();
  const [consent, setConsent] = useState(hasAiConsent);
  const [check, setCheck] = useState<Check>({ status: 'idle' });

  const runCheck = async () => {
    setCheck({ status: 'checking' });
    try {
      await (await loadExtractionProvider()).checkConnection();
      setCheck({ status: 'ok' });
    } catch (e) {
      setCheck({ status: 'error', message: copy.review.failed.kinds[classifyAIError(e, navigator.onLine)] });
    }
  };

  return (
    <SurfaceCard className="flex flex-col gap-3 p-5">
      <ul className="m-0 flex flex-col gap-2 pl-5 text-[13px] leading-relaxed">
        {copy.settings.aiNotes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="m-0 text-[13px]">
          <span className="font-semibold">{copy.settings.aiConsent}</span>
          <span className="ml-2 text-text-secondary">{consent ? copy.settings.aiConsentGiven : copy.settings.aiConsentNotGiven}</span>
        </p>
        {consent && (
          <Button
            variant="ghost"
            className="min-h-9 px-3 text-[13px]"
            onClick={() => {
              setAiConsent(false);
              setConsent(false);
            }}
          >
            {copy.settings.aiConsentReset}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <Button variant="secondary" onClick={() => void runCheck()} disabled={!online || check.status === 'checking'} aria-busy={check.status === 'checking'}>
          {check.status === 'checking' ? copy.settings.aiChecking : copy.settings.aiCheck}
        </Button>
        <p className="m-0 text-[12px] text-text-secondary">{online ? copy.settings.aiCheckNote : copy.review.offlineAnalysis}</p>
        {check.status === 'ok' && (
          <Notice tone="success" live="polite">
            {copy.settings.aiCheckOk}
          </Notice>
        )}
        {check.status === 'error' && <Notice tone="error">{check.message}</Notice>}
      </div>
    </SurfaceCard>
  );
}
