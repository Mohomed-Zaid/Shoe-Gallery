import { CalendarX, LogOut, Mail, ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button, LoadingSpinner } from '../components/ui';
import { getSubscriptionStatus, SUBSCRIPTION_QUERY_KEY, SUPER_ADMIN_EMAIL } from '../services/subscriptionService';

export function SubscriptionExpiredPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { data, isPending } = useQuery({ queryKey: SUBSCRIPTION_QUERY_KEY, queryFn: getSubscriptionStatus });
  const logout = async () => { await signOut(); navigate('/login', { replace: true }); };
  const expiry = data?.expires_at ? new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data.expires_at)) : 'Unavailable';

  return (
    <div className="login-bg px-4 py-10 text-white">
      <section className="login-card max-w-xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-300"><CalendarX size={32} /></div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-400">Shoe Gallery</p>
        <h1 className="text-3xl font-bold">Subscription Expired</h1>
        <p className="mx-auto mt-3 max-w-md text-dashboard-text-label">The monthly service period has ended. Please contact the system administrator to reactivate the service.</p>
        <div className="my-7 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.05] p-4"><div className="mb-1 flex items-center gap-2 text-sm text-dashboard-text-sub"><ShieldAlert size={16} /> Current status</div><p className="font-semibold capitalize">{isPending ? <LoadingSpinner /> : data?.status ?? 'Unavailable'}</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[0.05] p-4"><div className="mb-1 flex items-center gap-2 text-sm text-dashboard-text-sub"><CalendarX size={16} /> Expiry date</div><p className="font-semibold">{expiry}</p></div>
        </div>
        <a className="mb-7 inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300" href={`mailto:${SUPER_ADMIN_EMAIL}`}><Mail size={17} />{SUPER_ADMIN_EMAIL}</a>
        <div><Button variant="secondary" onClick={logout}><LogOut size={17} /> Logout</Button></div>
      </section>
    </div>
  );
}
