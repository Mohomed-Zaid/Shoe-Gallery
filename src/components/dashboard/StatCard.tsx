import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  subtitle?: string;
  prefix?: string;
}

export function StatCard({ label, value, icon: Icon, subtitle, prefix = '' }: StatCardProps) {
  const displayValue = prefix ? `${prefix} ${value}` : value;

  return (
    <div className="glass-card p-5">
      <div className="relative z-10 flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-dashboard-text-label">
          {label}
        </p>
        <div className="metric-icon-box">
          <Icon size={16} className="text-white/80" />
        </div>
      </div>

      <p className="relative z-10 mt-4 text-2xl font-bold tracking-tight text-dashboard-text-primary md:text-[1.75rem]">
        {displayValue}
      </p>

      {subtitle && (
        <p className="relative z-10 mt-2 text-xs text-dashboard-text-sub">~ {subtitle}</p>
      )}
    </div>
  );
}
