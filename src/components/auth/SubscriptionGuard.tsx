import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSubscriptionStatus, SUBSCRIPTION_QUERY_KEY, SUPER_ADMIN_EMAIL } from '../../services/subscriptionService';
import { Alert, LoadingSpinner } from '../ui';

export function SubscriptionGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  const isManagement = location.pathname === '/admin/subscription';
  const statusQuery = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: getSubscriptionStatus,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const refetchSubscription = statusQuery.refetch;

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void refetchSubscription();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [refetchSubscription]);

  if (statusQuery.isPending) {
    return <div className="dashboard-page flex min-h-screen items-center justify-center"><LoadingSpinner /></div>;
  }

  if (statusQuery.isError) {
    if (isSuperAdmin && isManagement) return <>{children}</>;
    return (
      <div className="dashboard-page flex min-h-screen items-center justify-center p-6">
        <div className="relative z-10 max-w-lg"><Alert message="Access could not be verified. Please try again or contact the system administrator." /></div>
      </div>
    );
  }

  if (statusQuery.data.is_access_allowed) {
    return <>{children}</>;
  }

  if (isSuperAdmin) {
    return isManagement ? <>{children}</> : <Navigate to="/admin/subscription" replace />;
  }

  return location.pathname === '/subscription-expired'
    ? <>{children}</>
    : <Navigate to="/subscription-expired" replace />;
}
