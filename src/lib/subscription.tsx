import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type CollectionState<T> =
  | { status: 'loading'; items: T[] }
  | { status: 'ready'; items: T[] }
  | { status: 'error'; items: T[]; retry: () => void };

type Subscribe<T> = (uid: string, onData: (items: T[]) => void, onError: (e: Error) => void) => () => void;

/**
 * Firestore コレクションを購読して各画面で共有する Provider を作る。
 * subscribe は動的 import で読み込み、Firebase SDK を初期バンドルに含めない。
 */
export function createCollectionContext<T>(name: string, loadSubscribe: () => Promise<Subscribe<T>>) {
  const Context = createContext<CollectionState<T> | null>(null);

  function Provider({ uid, children }: { uid: string; children: ReactNode }) {
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<CollectionState<T>>({ status: 'loading', items: [] });

    useEffect(() => {
      let unsubscribe: (() => void) | undefined;
      let cancelled = false;
      void loadSubscribe().then((subscribe) => {
        if (cancelled) return;
        unsubscribe = subscribe(
          uid,
          (items) => setState({ status: 'ready', items }),
          () =>
            setState((prev) => ({
              status: 'error',
              items: prev.items,
              retry: () => {
                setState({ status: 'loading', items: prev.items });
                setAttempt((n) => n + 1);
              },
            })),
        );
      });
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    }, [uid, attempt]);

    return <Context.Provider value={state}>{children}</Context.Provider>;
  }

  function useCollection(): CollectionState<T> {
    const ctx = useContext(Context);
    if (!ctx) throw new Error(`${name} must be used within its Provider`);
    return ctx;
  }

  return { Context, Provider, useCollection };
}
