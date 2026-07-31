import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { TopProduct } from '../../services/dashboardService';

const GRADIENT_COLORS = [
  '#10b981', '#11c482', '#12cd83', '#14b8a6', '#0ea5e9',
  '#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6',
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#010d0a]/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="mb-1 text-xs text-white/50">{label}</p>
      <p className="text-sm font-bold text-white">{payload[0].value} units sold</p>
    </div>
  );
}

export function TopProductsChart({ data }: { data: TopProduct[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-white/40">No product sales data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={120}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Bar dataKey="quantity" radius={[0, 6, 6, 0]} animationDuration={700}>
          {data.map((_, i) => (
            <Cell key={i} fill={GRADIENT_COLORS[i % GRADIENT_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
