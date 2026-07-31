import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { RevenueProfitPoint } from '../../services/dashboardService';
import { formatCurrency } from '../../utils/format';

const COLORS = {
  revenue: '#10b981',
  profit: '#14b8a6',
  grid: 'rgba(255,255,255,0.06)',
  text: 'rgba(255,255,255,0.5)',
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#010d0a]/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="mb-2 text-xs font-semibold text-white/60">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="capitalize text-white/70">{entry.name}:</span>
          <span className="font-semibold text-white">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueProfitChart({ data }: { data: RevenueProfitPoint[] }) {
  const tickData = data.filter((_, i) => i % 5 === 0 || i === data.length - 1);
  const tickLabels = new Set(tickData.map((d) => d.label));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COLORS.grid} strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: COLORS.text, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v) => (tickLabels.has(v) ? v : '')}
        />
        <YAxis
          tick={{ fill: COLORS.text, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          width={42}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => <span style={{ color: COLORS.text, fontSize: 12 }}>{value}</span>}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={COLORS.revenue}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4, fill: COLORS.revenue }}
        />
        <Line
          type="monotone"
          dataKey="profit"
          name="Profit"
          stroke={COLORS.profit}
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          activeDot={{ r: 4, fill: COLORS.profit }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
