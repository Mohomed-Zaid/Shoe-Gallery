import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { type ReactNode } from 'react';
import { LoadingSpinner } from './ui';
import type { UserRole } from '../types';
import { isBusinessAdminEmail } from '../services/subscriptionService';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, requireAdmin = false, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const effectiveRole: UserRole | undefined = isBusinessAdminEmail(user?.email) ? 'admin' : profile?.role;

  if (loading) {
    return (
      <div className="dashboard-page flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && effectiveRole !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && effectiveRole && !allowedRoles.includes(effectiveRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
