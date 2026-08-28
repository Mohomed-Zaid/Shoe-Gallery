import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  CASH_REGISTER_CHANGED_EVENT,
  ensureCurrentCashRegister,
} from '../../services/cashRegisterService';
import { LoadingSpinner } from '../ui';

export function CashRegisterGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<{ open: boolean; autoClosed: boolean }>();

  useEffect(() => {
    let active = true;
    const check = () => {
      void ensureCurrentCashRegister()
        .then((result) => active && setState({ open: Boolean(result.register), autoClosed: result.auto_closed }))
        .catch(() => active && setState({ open: false, autoClosed: false }));
    };
    check();
    window.addEventListener(CASH_REGISTER_CHANGED_EVENT, check);
    return () => {
      active = false;
      window.removeEventListener(CASH_REGISTER_CHANGED_EVENT, check);
    };
  }, []);

  if (!state) return <LoadingSpinner />;
  if (!state.open) {
    return <Navigate to="/cash-register" replace state={{
      from: location.pathname, needsOpen: true, autoClosed: state.autoClosed,
    }} />;
  }
  return <>{children}</>;
}
