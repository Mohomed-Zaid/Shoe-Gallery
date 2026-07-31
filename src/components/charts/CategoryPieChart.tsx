import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { CategorySales } from '../../services/dashboardService';

const PIE_COLORS = ['#10b981', '#14b8a6', '#0ea5e9', '#818cf8', '#f472b6', '#f59e0b', '#ef4444', '#a78bfa'];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { percent: number } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-xl border border-white/10 bg-[#010d0a]/95 px-4 py-3 shadow-xl backdrop-blur-sm">
      <p className="mb-1 text-xs text-white/50">{item.name}</p>
      <p className="text-sm font-bold text-white">{item.value} units</p>
      <p className="text-xs text-white/50">{(item.payload.percent * 100).toFixed(1)}%</p>
    </div>
  );
}

export function CategoryPieChart({ data }: { data: CategorySales[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-white/40">No category sales data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="48%"
          innerRadius="45%"
          outerRadius="70%"
          dataKey="value"
          nameKey="name"
          paddingAngle={2}
          animationDuration={700}
          animationBegin={100}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) => (
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{value}</span>
          )}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
