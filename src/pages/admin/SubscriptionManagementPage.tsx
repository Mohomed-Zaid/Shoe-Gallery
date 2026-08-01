import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, PauseCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Alert, Button, Input, Modal, PageHeader, Textarea } from '../../components/ui';
import {
  activateSubscription, getSubscriptionDetails, renewSubscription, reopenSubscription,
  setSubscriptionExpiry, SUBSCRIPTION_QUERY_KEY, SUPER_ADMIN_EMAIL, suspendSubscription,
} from '../../services/subscriptionService';

const formatDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Not set';

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'The database rejected this update.';
};

export function SubscriptionManagementPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'activate' | 'renew' | 'suspend' | 'reopen' | 'expiry' | null>(null);
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('');
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const details = useQuery({ queryKey: [...SUBSCRIPTION_QUERY_KEY, 'details'], queryFn: getSubscriptionDetails });

  const action = useMutation({
    mutationFn: async () => {
      if (dialog === 'activate') return activateSubscription();
      if (dialog === 'renew') return renewSubscription();
      if (dialog === 'reopen') return reopenSubscription();
      if (dialog === 'suspend') {
        if (!reason.trim()) throw new Error('A suspension reason is required.');
        return suspendSubscription(reason.trim());
      }
      if (dialog === 'expiry') {
        if (!expiry) throw new Error('Choose an expiry date and time.');
        const selectedExpiry = new Date(expiry);
        if (Number.isNaN(selectedExpiry.getTime())) throw new Error('The selected expiry date is invalid.');
        return setSubscriptionExpiry(selectedExpiry.toISOString());
      }
      throw new Error('No action selected.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      setNotice({ text: 'Subscription updated successfully.' });
      setDialog(null); setReason(''); setExpiry('');
    },
    onError: (error) => setNotice({ text: errorMessage(error), error: true }),
  });

  if (user?.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) return <Navigate to="/" replace />;

  const cards = [
    ['Current status', details.data?.status ?? 'Unavailable'], ['Activated date', formatDate(details.data?.activated_at)],
    ['Expiry date', formatDate(details.data?.expires_at)], ['Last payment date', formatDate(details.data?.last_payment_date)],
    ['Next payment date', formatDate(details.data?.next_payment_date)], ['Days remaining', String(details.data?.days_remaining ?? 0)],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Subscription Management" description="Control this shop's monthly service access using secure server-side actions." />
      {notice && <Alert message={notice.text} variant={notice.error ? 'error' : 'success'} />}
      {details.isError && <Alert message="Subscription details could not be loaded. Confirm that the database migration has been applied." />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value]) => <div key={label} className="glass-card p-5"><p className="relative z-10 text-sm text-dashboard-text-sub">{label}</p><p className="relative z-10 mt-2 text-lg font-semibold capitalize text-dashboard-text-primary">{details.isPending ? 'Loading…' : value}</p></div>)}
      </div>
      {details.data?.suspended_reason && <Alert message={`Suspension reason: ${details.data.suspended_reason}`} />}
      <section className="glass-card p-5 md:p-6">
        <div className="relative z-10"><h2 className="mb-4 text-lg font-semibold text-dashboard-text-primary">Administrative actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setDialog('activate')}><CheckCircle2 size={17} /> Activate for 30 Days</Button>
            <Button variant="secondary" onClick={() => setDialog('renew')}><RefreshCw size={17} /> Renew for 30 Days</Button>
            <Button variant="danger" onClick={() => setDialog('suspend')}><PauseCircle size={17} /> Suspend System</Button>
            <Button variant="outline" onClick={() => setDialog('reopen')}><ShieldCheck size={17} /> Reopen System</Button>
            <Button variant="secondary" onClick={() => setDialog('expiry')}><CalendarClock size={17} /> Custom Expiry Date</Button>
          </div>
        </div>
      </section>
      {dialog && <Modal title={{ activate: 'Activate subscription', renew: 'Renew subscription', suspend: 'Suspend system', reopen: 'Reopen system', expiry: 'Set custom expiry' }[dialog]} onClose={() => !action.isPending && setDialog(null)}>
        <p className="mb-4 text-sm text-dashboard-text-label">Confirm this administrative change. It takes effect for users on their next access check.</p>
        {action.isError && <div className="mb-4"><Alert message={errorMessage(action.error)} /></div>}
        {dialog === 'suspend' && <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is access being suspended?" />}
        {dialog === 'expiry' && <Input label="New expiry date and time" type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)} />}
        <div className="mt-5 flex justify-end gap-3"><Button variant="ghost" disabled={action.isPending} onClick={() => setDialog(null)}>Cancel</Button><Button variant={dialog === 'suspend' ? 'danger' : 'primary'} disabled={action.isPending} onClick={() => action.mutate()}>{action.isPending ? 'Updating…' : 'Confirm'}</Button></div>
      </Modal>}
    </div>
  );
}
