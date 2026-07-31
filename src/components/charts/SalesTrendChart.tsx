import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSalesTrend } from '../../services/dashboardService';
import type { SalesTrendFilter } from '../../services/dashboardService';
import { formatCurrency } from '../../utils/format';

const FILTERS: Array<{ label: string; value: SalesTrendFilter }> = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#010d0a]/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="mb-1 text-xs text-white/50">{label}</p>
      <p className="text-sm font-bold text-white">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

export function SalesTrendChart() {
  const [filter, setFilter] = useState<SalesTrendFilter>('7d');

  const { data = [], isFetching } = useQuery({
    queryKey: ['salesTrend', filter],
    queryFn: () => getSalesTrend(filter),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Show every Nth tick for readability
  const tickStep = data.length > 20 ? Math.ceil(data.length / 10) : 1;
  const tickSet = new Set(data.filter((_, i) => i % tickStep === 0 || i === data.length - 1).map((d) => d.label));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              filter === f.value
                ? 'bg-dashboard-accent text-white'
                : 'bg-white/[0.05] text-white/50 hover:bg-white/[0.08] hover:text-white/70'
            }`}
          >
            {f.label}
          </button>
        ))}
        {isFetching && <span className="ml-2 text-xs text-white/30">Refreshing…</span>}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={0}
            tickFormatter={(v) => (tickSet.has(v) ? v : '')}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            width={42}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="url(#salesGrad)"
            dot={false}
            activeDot={{ r: 5, fill: '#10b981', strokeWidth: 0 }}
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
