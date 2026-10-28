import { useState, type ReactNode } from 'react';
import { Outlet } from 'react-router';
import { APP_NAME } from '../../app/config';
import { copy } from '../../app/copy';
import { useAuth } from '../../app/auth';
import { Banners, SetupNotice } from '../../components/layout/StatusBanners';
import { firebaseEnv } from '../../services/firebase/config';
import { Button } from '../../components/ui/Button';
import { SurfaceCard } from '../../components/ui/Card';
import { Notice, Skeleton } from '../../components/ui/Feedback';
import { BooksProvider } from '../books/BooksProvider';
import { NotesProvider, TagsProvider } from '../notes/NotesProvider';
import { RecorderProvider } from '../recorder/RecorderProvider';
import { ProfileProvider } from '../settings/ProfileProvider';
import { CopyableUid } from './CopyableUid';

function Wordmark() {
  return (
    <p className="m-0 flex items-baseline justify-center gap-1 text-[40px] font-bold leading-none tracking-[-0.05em]" aria-hidden="true">
      {APP_NAME}
      <span className="inline-block size-[10px] rounded-full bg-accent" />
    </p>
  );
}

/** 未ログイン・確認中・利用不可など、アプリ本体の前に出す画面の枠 */
function GateFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="ambient-glow" aria-hidden="true" />
      <main className="safe-top safe-bottom relative z-[1] mx-auto flex min-h-dvh w-full max-w-content flex-col justify-center px-[22px] py-10">
        {children}
      </main>
    </>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <GateFrame>
      <div className="flex flex-col items-center gap-5" role="status">
        <Wordmark />
        <Skeleton className="h-2 w-28 rounded-full" />
        <p className="m-0 text-[13px] text-text-secondary">{label}</p>
      </div>
    </GateFrame>
  );
}

function LoginScreen({ error }: { error?: keyof typeof copy.auth.errors }) {
  const { signIn } = useAuth();
  const [pending, setPending] = useState(false);
  const onSignIn = async () => {
    setPending(true);
    try {
      await signIn();
    } finally {
      setPending(false);
    }
  };
  return (
    <GateFrame>
      <div className="text-center">
        <p className="eyebrow m-0 mb-4" aria-hidden="true">
          {copy.auth.eyebrow}
        </p>
        <h1 className="sr-only">{APP_NAME}</h1>
        <Wordmark />
        <p className="m-0 mt-4 text-[17px] font-semibold">{copy.auth.tagline}</p>
        <p className="m-0 mx-auto mt-2 max-w-sm text-[13px] text-text-secondary">{copy.auth.description}</p>
      </div>
      <div className="mt-10 flex flex-col gap-4">
        <Banners />
        {error && <Notice tone="error">{copy.auth.errors[error]}</Notice>}
        <Button onClick={onSignIn} disabled={pending} aria-busy={pending}>
          {pending ? copy.auth.signingIn : copy.auth.signIn}
        </Button>
        <p className="m-0 text-center text-[12px] text-text-secondary">{copy.auth.privacy}</p>
      </div>
    </GateFrame>
  );
}

function ForbiddenScreen({ uid }: { uid: string }) {
  const { signOut } = useAuth();
  return (
    <GateFrame>
      <SurfaceCard className="p-6">
        <h1 className="m-0 text-[20px] font-semibold">{copy.auth.forbiddenTitle}</h1>
        <p className="m-0 mt-2 text-[14px]">{copy.auth.forbiddenBody}</p>
        <p className="m-0 mt-4 text-[12px] text-text-secondary">{copy.auth.forbiddenOwnerHint}</p>
        <CopyableUid uid={uid} />
        <Button variant="secondary" className="mt-6 w-full" onClick={() => void signOut()}>
          {copy.auth.switchAccount}
        </Button>
      </SurfaceCard>
    </GateFrame>
  );
}

/** ログインと所有者確認を通過したときだけアプリ本体を表示する。サインアップ専用画面は設けない。 */
export function AuthGate() {
  const { state } = useAuth();
  switch (state.status) {
    case 'unconfigured':
      return (
        <GateFrame>
          <Wordmark />
          <div className="mt-8">
            <SetupNotice missing={firebaseEnv.ok ? [] : firebaseEnv.missing} />
          </div>
        </GateFrame>
      );
    case 'loading':
      return <LoadingScreen label={copy.auth.loading} />;
    case 'checking':
      return <LoadingScreen label={copy.auth.checking} />;
    case 'signedOut':
      return <LoginScreen error={state.error} />;
    case 'forbidden':
      return <ForbiddenScreen uid={state.user.uid} />;
    case 'signedIn':
      return (
        <BooksProvider uid={state.user.uid}>
          <TagsProvider uid={state.user.uid}>
            <NotesProvider uid={state.user.uid}>
              <ProfileProvider uid={state.user.uid}>
                <RecorderProvider uid={state.user.uid} key={state.user.uid}>
                  <Outlet />
                </RecorderProvider>
              </ProfileProvider>
            </NotesProvider>
          </TagsProvider>
        </BooksProvider>
      );
  }
}
