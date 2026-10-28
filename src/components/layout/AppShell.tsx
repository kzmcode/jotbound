import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';

/** 下部ナビ付きのタブ画面。本文は最大560pxで中央寄せ。 */
export function TabLayout() {
  return (
    <>
      <div className="ambient-glow" aria-hidden="true" />
      <div className="safe-top relative z-[1] mx-auto w-full max-w-content px-[22px] pb-[calc(96px+env(safe-area-inset-bottom))] pt-6">
        <main className="screen-enter">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </>
  );
}

/** 録音・確認などのフロー画面。下部ナビを出さず、現在のテーマを引き継ぐ。 */
export function FlowLayout() {
  return (
    <>
      <div className="ambient-glow" aria-hidden="true" />
      <div className="safe-top safe-bottom relative z-[1] mx-auto w-full max-w-content px-[22px] pb-8 pt-6">
        <main className="screen-enter">
          <Outlet />
        </main>
      </div>
    </>
  );
}
