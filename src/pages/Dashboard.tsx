import {
  AlertTriangle, ArrowUpRight, Boxes, CalendarClock, Package, RotateCcw,
  ShoppingBag, TrendingUp, Wallet, XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { Alert, LoadingSpinner } from '../components/ui';
import { RegisterStatusCard } from '../components/cash-register/RegisterStatusCard';
import { SalesTrendChart } from '../components/charts/SalesTrendChart';
import { formatCurrency } from '../utils/format';
import { getDashboardCards, getRecentSales } from '../services/dashboardService';
import { getSubscriptionStatus, SUBSCRIPTION_QUERY_KEY, SUPER_ADMIN_EMAIL } from '../services/subscriptionService';

const TIME_ZONE = 'Asia/Colombo';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function paymentLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="glass-card min-w-0 p-4">
      <div className="relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-dashboard-text-label">{label}</p>
          <p className="mt-1.5 truncate text-xl font-bold text-dashboard-text-primary xl:text-2xl">{value}</p>
        </div>
        <div className="glass-icon h-9 w-9 shrink-0 text-dashboard-accent"><Icon size={17} /></div>
      </div>
    </div>
  );
}

function SubscriptionCard() {
  const { profile } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: getSubscriptionStatus,
    refetchInterval: 5 * 60 * 1000,
  });
  const remaining = Math.max(0, Number(data?.days_remaining ?? 0));
  const expired = Boolean(data?.is_expired || data?.status === 'expired');
  const warning = !expired && remaining <= 7;
  const label = expired ? 'EXPIRED' : warning ? 'EXPIRING SOON' : 'ACTIVE';
  const tone = expired
    ? 'border-red-400/25 bg-red-500/10 text-red-300'
    : warning
      ? 'border-amber-400/25 bg-amber-500/10 text-amber-300'
      : 'border-dashboard-accent/25 bg-dashboard-accent/10 text-dashboard-accent';
  const canManage = profile?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  return (
    <div className="glass-card p-4">
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="glass-icon h-9 w-9 shrink-0 text-dashboard-accent"><CalendarClock size={17} /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-dashboard-text-label">System Subscription</p>
              {isLoading ? <p className="mt-1 text-sm text-dashboard-text-sub">Loading…</p> : <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>}
            </div>
          </div>
          {canManage && <Link to="/admin/subscription" className="rounded-lg px-2 py-1 text-xs font-medium text-dashboard-accent hover:bg-dashboard-accent/10">Manage</Link>}
        </div>
        {error ? <p className="mt-3 text-sm text-red-300">Subscription status is unavailable.</p> : data && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-3 text-sm">
            <div><p className="text-xs text-dashboard-text-sub">Expiry Date</p><p className="mt-0.5 font-semibold text-dashboard-text-primary">{formatDate(data.expires_at)}</p></div>
            <div><p className="text-xs text-dashboard-text-sub">Days Remaining</p><p className={`mt-0.5 font-semibold ${expired ? 'text-red-300' : warning ? 'text-amber-300' : 'text-dashboard-text-primary'}`}>{expired ? 'Expired' : `${remaining} ${remaining === 1 ? 'Day' : 'Days'}`}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Dashboard() {
  const queryOptions = { staleTime: 60_000, refetchInterval: 120_000 };
  const { data: cards, isLoading, error } = useQuery({ queryKey: ['dashboardCards'], queryFn: getDashboardCards, ...queryOptions });
  const { data: recentSales = [], isLoading: recentLoading, error: recentError } = useQuery({ queryKey: ['recentSales'], queryFn: getRecentSales, ...queryOptions });

  return (
    <div className="min-w-0 space-y-5">
      <h1 className="text-xl font-bold text-dashboard-text-primary sm:text-2xl">Dashboard</h1>

      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <RegisterStatusCard />
        <SubscriptionCard />
      </section>

      {error && <Alert message="Unable to load dashboard data." />}
      <section>
        <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-dashboard-text-sub">Today</h2>
        {isLoading ? <LoadingSpinner /> : (
          <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Today's Sales" value={(cards?.todaySales ?? 0).toLocaleString()} icon={ShoppingBag} />
            <MetricCard label="Today's Revenue" value={formatCurrency(cards?.todayRevenue ?? 0)} icon={Wallet} />
            <MetricCard label="Today's Profit" value={formatCurrency(cards?.todayProfit ?? 0)} icon={TrendingUp} />
            <MetricCard label="Today's Returns" value={formatCurrency(cards?.todayReturns ?? 0)} icon={RotateCcw} />
          </div>
        )}
      </section>

      <section className="glass-card p-4">
        <div className="relative z-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-dashboard-text-primary">Inventory Status</h2>
            <Link to="/inventory" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-dashboard-accent hover:bg-dashboard-accent/10">View Inventory <ArrowUpRight size={12} /></Link>
          </div>
          {isLoading ? <LoadingSpinner /> : (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-3 lg:grid-cols-5">
              {[
                ['Total Products', (cards?.totalProducts ?? 0).toLocaleString(), Package],
                ['Stock Units', (cards?.totalStockUnits ?? 0).toLocaleString(), Boxes],
                ['Inventory Value', formatCurrency(cards?.inventoryValue ?? 0), Wallet],
                ['Low Stock', (cards?.lowStockVariants ?? 0).toLocaleString(), AlertTriangle],
                ['Out of Stock', (cards?.outOfStockVariants ?? 0).toLocaleString(), XCircle],
              ].map(([label, value, Icon]) => (
                <Link to="/inventory" key={String(label)} className="min-w-0 bg-[#061711] p-3 transition hover:bg-white/[0.05]">
                  <div className="flex items-center gap-2 text-dashboard-text-sub"><Icon size={14} /><span className="truncate text-[11px] uppercase tracking-wide">{String(label)}</span></div>
                  <p className="mt-1.5 truncate text-base font-bold text-dashboard-text-primary xl:text-lg">{String(value)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="glass-card p-4">
        <div className="relative z-10">
          <div className="mb-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-dashboard-text-primary">Sales Trend</h2><p className="mt-0.5 text-xs text-dashboard-text-sub">Net completed-sales revenue</p></div>
          <SalesTrendChart />
        </div>
      </section>

      <section className="glass-card min-w-0 p-4">
        <div className="relative z-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-dashboard-text-primary">Recent Sales</h2>
            <Link to="/sales" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-dashboard-accent hover:bg-dashboard-accent/10">View All Sales <ArrowUpRight size={12} /></Link>
          </div>
          {recentError ? <p className="text-sm text-red-300">Unable to load recent sales.</p> : recentLoading ? <LoadingSpinner /> : recentSales.length === 0 ? <p className="py-4 text-sm text-dashboard-text-sub">No completed sales yet.</p> : (
            <>
              <div className="hidden min-w-0 md:block">
                <div className="grid grid-cols-[1.15fr_.7fr_1.15fr_.55fr_.75fr_.9fr] gap-3 border-b border-white/[0.08] px-3 pb-2 text-[10px] font-semibold uppercase tracking-wide text-dashboard-text-sub">
                  <span>Invoice</span><span>Time</span><span>Customer</span><span>Items</span><span>Payment</span><span className="text-right">Total</span>
                </div>
                {recentSales.map((sale) => <Link key={sale.id} to={`/sales/${sale.id}`} className="grid min-w-0 grid-cols-[1.15fr_.7fr_1.15fr_.55fr_.75fr_.9fr] gap-3 border-b border-white/[0.06] px-3 py-3 text-xs transition last:border-0 hover:bg-white/[0.04] xl:text-sm"><span className="truncate font-semibold text-dashboard-text-primary">{sale.invoice_number ?? sale.id.slice(0, 8)}</span><span className="truncate text-dashboard-text-label">{formatTime(sale.created_at)}</span><span className="truncate text-dashboard-text-label">{sale.customer}</span><span className="text-dashboard-text-label">{sale.itemCount}</span><span className="truncate text-dashboard-text-label">{paymentLabel(sale.paymentMethod)}</span><span className="truncate text-right font-semibold text-dashboard-accent">{formatCurrency(sale.amount)}</span></Link>)}
              </div>
              <div className="space-y-2 md:hidden">{recentSales.map((sale) => <Link key={sale.id} to={`/sales/${sale.id}`} className="block rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-dashboard-text-primary">{sale.invoice_number ?? sale.id.slice(0, 8)}</p><p className="mt-1 truncate text-xs text-dashboard-text-sub">{formatTime(sale.created_at)} · {sale.customer}</p><p className="mt-1 text-xs text-dashboard-text-sub">{sale.itemCount} {sale.itemCount === 1 ? 'Item' : 'Items'} · {paymentLabel(sale.paymentMethod)}</p></div><p className="shrink-0 text-sm font-semibold text-dashboard-accent">{formatCurrency(sale.amount)}</p></div></Link>)}</div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
