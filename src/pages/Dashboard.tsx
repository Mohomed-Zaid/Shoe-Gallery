import {
  AlertTriangle,
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  Building2,
  CalendarClock,
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner, Alert } from '../components/ui';
import {
  getDashboardCards,
  getRevenueProfitTrend,
  getTopSellingProducts,
  getSalesByCategory,
  getMonthlyRevenue,
  getLowStockProducts,
  getRecentSales,
} from '../services/dashboardService';
import { SalesTrendChart } from '../components/charts/SalesTrendChart';
import { RevenueProfitChart } from '../components/charts/RevenueProfitChart';
import { TopProductsChart } from '../components/charts/TopProductsChart';
import { CategoryPieChart } from '../components/charts/CategoryPieChart';
import { MonthlyRevenueChart } from '../components/charts/MonthlyRevenueChart';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getSubscriptionStatus, SUBSCRIPTION_QUERY_KEY } from '../services/subscriptionService';

const STORE_NAME = 'Shoe Gallery';

function getGreetingDate() {
  return new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  accent?: boolean;
}

function StatCard({ label, value, icon: Icon, sub, accent }: StatCardProps) {
  return (
    <div className={`glass-card p-5 ${accent ? 'border-dashboard-accent/25' : ''}`}>
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-dashboard-text-label">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-dashboard-text-primary">{value}</p>
          {sub && <p className="mt-1 text-xs text-dashboard-text-sub">{sub}</p>}
        </div>
        <div className={`glass-icon h-10 w-10 shrink-0 ${accent ? 'border-dashboard-accent/30 bg-dashboard-accent/20' : ''}`}>
          <Icon size={18} className={accent ? 'text-dashboard-accent' : 'text-dashboard-text-label'} />
        </div>
      </div>
    </div>
  );
}

// ─── Chart Wrapper ───────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, isLoading, className = '' }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <div className={`glass-card p-6 ${className}`}>
      <div className="relative z-10">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-dashboard-text-primary">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-dashboard-text-sub">{subtitle}</p>}
          </div>
        </div>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function Dashboard() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] ?? profile?.email?.split('@')[0] ?? 'User';

  const QUERY_OPTS = { staleTime: 60_000, refetchInterval: 120_000 };

  const { data: subscription } = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: getSubscriptionStatus,
    refetchInterval: 5 * 60 * 1000,
  });

  const subscriptionExpiry = subscription?.expires_at
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(new Date(subscription.expires_at))
    : 'Unavailable';

  const { data: cards, isLoading: cardsLoading, error: cardsError } = useQuery({
    queryKey: ['dashboardCards'],
    queryFn: getDashboardCards,
    ...QUERY_OPTS,
  });

  const { data: revProfit = [], isLoading: revProfitLoading } = useQuery({
    queryKey: ['revenueProfitTrend'],
    queryFn: getRevenueProfitTrend,
    ...QUERY_OPTS,
  });

  const { data: topProducts = [], isLoading: topLoading } = useQuery({
    queryKey: ['topSellingProducts'],
    queryFn: getTopSellingProducts,
    ...QUERY_OPTS,
  });

  const { data: categorySales = [], isLoading: catLoading } = useQuery({
    queryKey: ['salesByCategory'],
    queryFn: getSalesByCategory,
    ...QUERY_OPTS,
  });

  const { data: monthlyRevenue = [], isLoading: monthlyLoading } = useQuery({
    queryKey: ['monthlyRevenue'],
    queryFn: getMonthlyRevenue,
    ...QUERY_OPTS,
  });

  const { data: lowStock = [], isLoading: lowStockLoading } = useQuery({
    queryKey: ['lowStockProducts'],
    queryFn: getLowStockProducts,
    ...QUERY_OPTS,
  });

  const { data: recentSales = [], isLoading: recentSalesLoading } = useQuery({
    queryKey: ['recentSales'],
    queryFn: getRecentSales,
    ...QUERY_OPTS,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dashboard-text-primary md:text-3xl">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-dashboard-text-sub">~ {STORE_NAME}</p>
          <p className="mt-1 text-xs text-dashboard-text-sub">{getGreetingDate()}</p>
        </div>
        <Link
          to="/pos"
          className="inline-flex items-center gap-2 rounded-xl border border-dashboard-accent/30 bg-dashboard-accent/10 px-4 py-2 text-sm font-medium text-dashboard-accent transition hover:bg-dashboard-accent/20"
        >
          <ShoppingCart size={15} />
          New Sale
          <ArrowUpRight size={13} />
        </Link>
      </div>

      <div className="glass-card border-dashboard-accent/25 p-4 md:p-5">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="glass-icon h-11 w-11 shrink-0 text-dashboard-accent">
              <CalendarClock size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-dashboard-text-sub">Service subscription expiry</p>
              <p className="mt-1 font-semibold text-dashboard-text-primary">{subscriptionExpiry}</p>
            </div>
          </div>
          {subscription && (
            <div className="sm:text-right">
              <p className="text-sm font-semibold text-dashboard-accent">
                {subscription.days_remaining} {subscription.days_remaining === 1 ? 'day' : 'days'} remaining
              </p>
              <p className="mt-0.5 text-xs capitalize text-dashboard-text-sub">Status: {subscription.status}</p>
            </div>
          )}
        </div>
      </div>

      {cardsError && <Alert message="Unable to load dashboard data." />}

      {/* Stat Cards */}
      {cardsLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Row 1: Today */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dashboard-text-sub">Today</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-3">
              <StatCard
                label="Today's Orders"
                value={String(cards?.todaySales ?? 0)}
                icon={ShoppingCart}
                accent
              />
              <StatCard
                label="Today's Revenue"
                value={formatCurrency(cards?.todayRevenue ?? 0)}
                icon={DollarSign}
                accent
              />
              <StatCard
                label="Today's Profit"
                value={formatCurrency(cards?.todayProfit ?? 0)}
                icon={TrendingUp}
                accent
              />
            </div>
          </div>

          {/* Row 2: Monthly */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dashboard-text-sub">This Month</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-2 xl:grid-cols-2">
              <StatCard
                label="Monthly Revenue"
                value={formatCurrency(cards?.monthlyRevenue ?? 0)}
                icon={Wallet}
              />
              <StatCard
                label="Monthly Profit"
                value={formatCurrency(cards?.monthlyProfit ?? 0)}
                icon={BadgeDollarSign}
              />
            </div>
          </div>

          {/* Row 3: Business totals */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dashboard-text-sub">Overview</p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-4">
              <StatCard label="Total Products" value={String(cards?.totalProducts ?? 0)} icon={Package} />
              <StatCard label="Total Customers" value={String(cards?.totalCustomers ?? 0)} icon={Users} />
              <StatCard label="Total Suppliers" value={String(cards?.totalSuppliers ?? 0)} icon={Building2} />
              <StatCard
                label="Inventory Value"
                value={formatCurrency(cards?.inventoryValue ?? 0)}
                icon={BarChart3}
              />
            </div>
          </div>
        </>
      )}

      {/* Charts Row 1: Sales Trend + Revenue vs Profit */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Sales Trend"
          subtitle="Actual sales over time from Supabase"
          isLoading={false}
        >
          <SalesTrendChart />
        </ChartCard>

        <ChartCard
          title="Revenue vs Profit"
          subtitle="Last 30 days — from actual sale items & cost prices"
          isLoading={revProfitLoading}
        >
          <RevenueProfitChart data={revProfit} />
        </ChartCard>
      </div>

      {/* Charts Row 2: Monthly Revenue + Category Pie */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Monthly Revenue"
          subtitle={`Full year ${new Date().getFullYear()}`}
          isLoading={monthlyLoading}
        >
          <MonthlyRevenueChart data={monthlyRevenue} />
        </ChartCard>

        <ChartCard
          title="Sales by Category"
          subtitle="Units sold per product category"
          isLoading={catLoading}
        >
          <CategoryPieChart data={categorySales} />
        </ChartCard>
      </div>

      {/* Charts Row 3: Top Products (full width) */}
      <ChartCard
        title="Top 10 Selling Products"
        subtitle="By total quantity sold across all time"
        isLoading={topLoading}
      >
        <TopProductsChart data={topProducts} />
      </ChartCard>

      {/* Tables Row: Recent Sales + Low Stock */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Recent Sales */}
        <div className="glass-card p-6">
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-dashboard-text-primary">Recent Sales</h3>
              <Link to="/sales" className="flex items-center gap-1 text-xs text-dashboard-accent hover:text-dashboard-accent-light">
                View all <ArrowUpRight size={12} />
              </Link>
            </div>

            {recentSalesLoading ? (
              <LoadingSpinner />
            ) : recentSales.length === 0 ? (
              <p className="text-sm text-dashboard-text-sub">No sales yet.</p>
            ) : (
              <div className="space-y-2">
                {recentSales.map((sale) => (
                  <Link key={sale.id} to={`/sales/${sale.id}`} className="block">
                    <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.06]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-dashboard-text-primary">
                          {sale.invoice_number ?? sale.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-dashboard-text-sub">
                          {sale.customer} • {sale.cashier}
                        </p>
                      </div>
                      <div className="ml-4 text-right shrink-0">
                        <p className="text-sm font-semibold text-dashboard-accent">{formatCurrency(sale.amount)}</p>
                        <p className="text-xs text-dashboard-text-sub">{formatDateTime(sale.created_at)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low Stock */}
        <div className="glass-card p-6">
          <div className="relative z-10">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-dashboard-text-primary">
                <AlertTriangle size={15} className="mr-2 inline-block text-amber-400" />
                Low Stock Alert
              </h3>
              <Link to="/inventory" className="flex items-center gap-1 text-xs text-dashboard-accent hover:text-dashboard-accent-light">
                View all <ArrowUpRight size={12} />
              </Link>
            </div>

            {lowStockLoading ? (
              <LoadingSpinner />
            ) : lowStock.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-4 text-sm text-dashboard-text-sub">
                <AlertTriangle size={16} className="text-green-400" />
                All products are sufficiently stocked.
              </div>
            ) : (
              <div className="space-y-2">
                {lowStock.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-amber-500/10 bg-amber-500/[0.04] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-dashboard-text-primary">{item.productName}</p>
                      <p className="text-xs text-dashboard-text-sub">{item.size} / {item.color}</p>
                    </div>
                    <div className="ml-4 shrink-0 text-right">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        item.stock === 0
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}>
                        {item.stock === 0 ? 'Out of stock' : `${item.stock} left`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
