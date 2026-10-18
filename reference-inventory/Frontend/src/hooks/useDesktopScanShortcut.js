import { useCallback, useEffect, useState } from 'react';

const DESKTOP_QUERY = '(min-width: 768px)';

function watchDesktop(onChange) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mq = window.matchMedia(DESKTOP_QUERY);
  const handler = (e) => onChange(e.matches);
  onChange(mq.matches);
  if (mq.addEventListener) {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  // Safari < 14
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}

function isDigit8(event) {
  // `code` is layout-position based so it stays "the 8 key" even on layouts
  // where Shift+8 produces '*' instead of '8'.
  if (event.code === 'Digit8' || event.code === 'Numpad8') return true;
  return event.key === '8' || event.key === '*';
}

/**
 * Camera scanning on desktop is opt-in so it never competes with the normal
 * barcode/keyboard workflow. Pressing Ctrl+Shift+8 (Cmd+Shift+8 on macOS)
 * reveals the camera scan button; pressing it again hides the button.
 *
 * Mobile is unaffected: the button is shown unconditionally there.
 */
export function useDesktopScanShortcut() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [desktopScanUnlocked, setDesktopScanUnlocked] = useState(false);

  useEffect(() => watchDesktop(setIsDesktop), []);

  // Shrinking the window below the desktop breakpoint re-hides the feature.
  useEffect(() => {
    if (!isDesktop) setDesktopScanUnlocked(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop) return undefined;

    const handleKeyDown = (e) => {
      if (e.altKey) return;
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      if (!isDigit8(e)) return;
      e.preventDefault();
      setDesktopScanUnlocked((prev) => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop]);

  const toggleDesktopScan = useCallback(() => {
    setDesktopScanUnlocked((prev) => !prev);
  }, []);

  return { isDesktop, desktopScanUnlocked, toggleDesktopScan };
}
