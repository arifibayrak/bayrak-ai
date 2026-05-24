'use client';

/**
 * RefreshOnFocus.tsx
 *
 * Pure side-effect component — returns null, renders nothing.
 * Calls router.refresh() whenever the window regains focus or the
 * document becomes visible again, so the map and BOQ % update
 * without polling or WebSockets (DASH-05 / D-55).
 *
 * Mount once inside the page div, outside <Tabs>, so it applies
 * to all tabs automatically.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function RefreshOnFocus() {
  const { refresh } = useRouter();

  useEffect(() => {
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return null;
}
