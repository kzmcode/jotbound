import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { firebaseEnv } from '../services/firebase/config';
import type { SessionUser } from '../services/firebase/session';

export type AuthErrorKey = 'cancelled' | 'network' | 'unauthorizedDomain' | 'unknown';

export type AuthState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signedOut'; error?: AuthErrorKey }
  | { status: 'checking'; user: SessionUser }
  | { status: 'forbidden'; user: SessionUser }
  | { status: 'signedIn'; user: SessionUser };

type AuthContextValue = {
  state: AuthState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

/** テストで任意の認証状態を与えるために export する */
export const AuthContext = createContext<AuthContextValue | null>(null);

const loadSession = () => import('../services/firebase/session');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(firebaseEnv.ok ? { status: 'loading' } : { status: 'unconfigured' });

  useEffect(() => {
    if (!firebaseEnv.ok) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void loadSession().then((session) => {
      if (cancelled) return;
      unsubscribe = session.watchAuth((user) => {
        if (!user) {
          setState((prev) => (prev.status === 'signedOut' ? prev : { status: 'signedOut' }));
          return;
        }
        setState({ status: 'checking', user });
        void session.verifyAccess(user.uid).then((access) => {
          setState((prev) =>
            'user' in prev && prev.user.uid === user.uid
              ? { status: access === 'allowed' ? 'signedIn' : 'forbidden', user }
              : prev,
          );
        });
      });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async () => {
    const session = await loadSession();
    try {
      await session.signInWithGoogle();
    } catch (e) {
      setState({ status: 'signedOut', error: session.authErrorKey(e) });
    }
  }, []);

  const signOut = useCallback(async () => {
    const session = await loadSession();
    await session.signOutUser();
  }, []);

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** ログイン済みユーザー（AuthGate の内側でのみ使う） */
export function useSessionUser(): SessionUser {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useSessionUser requires a signed-in user');
  return state.user;
}
