import { BarChart3, Boxes, CircleDollarSign, RotateCcw, ShoppingCart, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui';

const reports = [
  { path: '/reports/sales', title: 'Sales Report', icon: BarChart3 },
  { path: '/reports/purchases', title: 'Purchase Report', icon: ShoppingCart },
  { path: '/reports/inventory', title: 'Inventory Report', icon: Boxes },
  { path: '/reports/returns', title: 'Returns Report', icon: RotateCcw },
  { path: '/reports/profit', title: 'Profit Report', icon: TrendingUp },
  { path: '/reports/cashup', title: 'Cashup Report', icon: CircleDollarSign },
];

export function ReportsHomePage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Reports" description="View and export business reports." />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(({ path, title, icon: Icon }) => (
          <Link key={path} to={path} className="glass-card group min-w-0 p-5 transition-colors hover:border-dashboard-accent/40">
            <div className="relative z-10 flex min-w-0 items-center gap-4">
              <span className="shrink-0 rounded-xl bg-dashboard-accent/10 p-3 text-dashboard-accent"><Icon size={22} /></span>
              <div className="min-w-0"><h2 className="truncate font-semibold text-dashboard-text-primary">{title}</h2><p className="mt-1 text-sm text-dashboard-text-sub">Open report</p></div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
