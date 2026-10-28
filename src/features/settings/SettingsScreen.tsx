import type { ReactNode } from 'react';
import { AI_MODEL, APP_NAME } from '../../app/config';
import { useAuth, useSessionUser } from '../../app/auth';
import { copy } from '../../app/copy';
import { useTheme, type ThemePreference } from '../../app/theme';
import { DeviceIcon, MoonIcon, SunIcon } from '../../components/icons';
import { TopBar } from '../../components/layout/TopBar';
import { Button } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { ScreenTitle, SectionHeading } from '../../components/ui/Typography';
import { BackupSettings } from '../backup/BackupSettings';
import { AiSettings } from './AiSettings';
import { appCheckState, firebaseEnv } from '../../services/firebase/config';
import { CopyableUid } from '../auth/CopyableUid';
import { TagManager } from '../tags/TagManager';

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <dt className="shrink-0 whitespace-nowrap text-[13px] text-text-secondary">{label}</dt>
      <dd className="m-0 min-w-0 break-all text-right text-[14px] font-medium">{children}</dd>
    </div>
  );
}

const appCheckLabel = {
  'recaptcha-enterprise': copy.settings.appCheckRecaptcha,
  debug: copy.settings.appCheckDebug,
  emulator: copy.settings.appCheckEmulator,
  'not-configured': copy.settings.appCheckMissing,
} as const;

export function SettingsScreen() {
  const { preference, resolved, setPreference } = useTheme();
  const { signOut } = useAuth();
  const user = useSessionUser();
  const themeOptions: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: 'light', label: copy.settings.themeLight, icon: <SunIcon size={16} /> },
    { value: 'dark', label: copy.settings.themeDark, icon: <MoonIcon size={16} /> },
    { value: 'system', label: copy.settings.themeSystem, icon: <DeviceIcon size={16} /> },
  ];

  return (
    <>
      <TopBar />
      <ScreenTitle eyebrow={copy.settings.heroEn} title={copy.settings.title} />

      <section aria-labelledby="theme-heading" className="mb-8">
        <SectionHeading id="theme-heading">{copy.settings.themeHeading}</SectionHeading>
        <SegmentedControl name="theme" legend={copy.settings.themeLegend} value={preference} options={themeOptions} onChange={setPreference} />
        <p className="m-0 mt-2 text-[12px] text-text-secondary" aria-live="polite">
          {copy.settings.themeCurrent(resolved === 'dark' ? copy.settings.themeDark : copy.settings.themeLight)}
        </p>
      </section>

      <section aria-labelledby="account-heading" className="mb-8">
        <SectionHeading id="account-heading">{copy.settings.accountHeading}</SectionHeading>
        <SurfaceCard className="px-5 pb-5">
          <dl className="m-0">
            <InfoRow label={copy.settings.accountName}>{user.displayName ?? '—'}</InfoRow>
            <InfoRow label={copy.settings.accountEmail}>{user.email ?? '—'}</InfoRow>
          </dl>
          <p className="m-0 mt-3 text-[13px] text-text-secondary">{copy.settings.uid}</p>
          <CopyableUid uid={user.uid} />
          <Button variant="secondary" className="mt-5 w-full" onClick={() => void signOut()}>
            {copy.settings.signOut}
          </Button>
        </SurfaceCard>
      </section>

      <section aria-labelledby="tags-heading" className="mb-8">
        <SectionHeading id="tags-heading">{copy.settings.tagsHeading}</SectionHeading>
        <TagManager />
      </section>

      <section aria-labelledby="backup-heading" className="mb-8">
        <SectionHeading id="backup-heading">{copy.backup.heading}</SectionHeading>
        <BackupSettings />
      </section>

      <section aria-labelledby="app-heading" className="mb-8">
        <SectionHeading id="app-heading">{copy.settings.appHeading}</SectionHeading>
        <SurfaceCard className="px-5">
          <dl className="m-0">
            <InfoRow label={copy.settings.appName}>{APP_NAME}</InfoRow>
            <InfoRow label={copy.settings.version}>{__APP_VERSION__}</InfoRow>
            <InfoRow label={copy.settings.model}>
              <code className="text-[13px]">{AI_MODEL}</code>
            </InfoRow>
          </dl>
        </SurfaceCard>
      </section>

      <section aria-labelledby="ai-heading" className="mb-8">
        <SectionHeading id="ai-heading">{copy.settings.aiHeading}</SectionHeading>
        <AiSettings />
      </section>

      <section aria-labelledby="firebase-heading">
        <SectionHeading id="firebase-heading">{copy.settings.firebaseHeading}</SectionHeading>
        <SurfaceCard className="px-5">
          <dl className="m-0">
            <InfoRow label={copy.settings.projectId}>
              {firebaseEnv.ok ? firebaseEnv.options.projectId : copy.settings.notConfigured}
            </InfoRow>
            <InfoRow label={copy.settings.appCheck}>{appCheckLabel[appCheckState()]}</InfoRow>
          </dl>
        </SurfaceCard>
      </section>
    </>
  );
}
