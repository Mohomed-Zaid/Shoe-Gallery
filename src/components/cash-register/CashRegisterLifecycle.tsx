import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ensureCurrentCashRegister,
  millisecondsUntilNextColomboMidnight,
  notifyCashRegisterChanged,
} from '../../services/cashRegisterService';

export function CashRegisterLifecycle() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    let midnightTimer: number | undefined;

    const refresh = async () => {
      try {
        await ensureCurrentCashRegister();
        if (!active) return;
        await queryClient.invalidateQueries({ queryKey: ['current-register'] });
        notifyCashRegisterChanged();
      } catch {
        // Individual pages surface register errors when the user takes action.
      }
    };

    const scheduleMidnight = () => {
      window.clearTimeout(midnightTimer);
      midnightTimer = window.setTimeout(() => {
        void refresh().finally(scheduleMidnight);
      }, millisecondsUntilNextColomboMidnight() + 250);
    };

    const checkAfterResume = () => {
      if (document.visibilityState === 'visible') {
        void refresh().finally(scheduleMidnight);
      }
    };

    void refresh();
    scheduleMidnight();
    document.addEventListener('visibilitychange', checkAfterResume);
    window.addEventListener('focus', checkAfterResume);
    return () => {
      active = false;
      window.clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', checkAfterResume);
      window.removeEventListener('focus', checkAfterResume);
    };
  }, [queryClient]);

  return null;
}
