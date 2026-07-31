const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const salesData = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const profitData = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function toPath(data: number[], height: number, width: number) {
  const max = Math.max(...data);
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = max === 0 ? height : height - (value / max) * (height - 10);
    return `${x},${y}`;
  });
  return `M0,${height} L${points.join(' L')} L${width},${height} Z`;
}

export function SalesProfitChart() {
  const width = 600;
  const height = 200;

  return (
    <div className="glass-card p-6">
      <div className="relative z-10 mb-5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-dashboard-text-primary">Sales &amp; Profit</h3>
        <div className="flex items-center gap-5 text-xs text-dashboard-text-label">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/30 ring-2 ring-white/10" />
            Sales
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white ring-2 ring-white/20" />
            Gross Profit
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height + 30}`} className="relative z-10 w-full">
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>
          <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(20,184,166,0.45)" />
            <stop offset="100%" stopColor="rgba(20,184,166,0.05)" />
          </linearGradient>
        </defs>
        <path d={toPath(salesData, height, width)} fill="url(#salesGrad)" />
        <path d={toPath(profitData, height, width)} fill="url(#profitGrad)" />
        {months.map((month, index) => (
          <text
            key={month}
            x={(index / (months.length - 1)) * width}
            y={height + 20}
            textAnchor="middle"
            className="fill-dashboard-text-sub text-[10px]"
          >
            {month}
          </text>
        ))}
      </svg>

      <div className="relative z-10 mt-5 grid grid-cols-3 gap-4 border-t border-white/10 pt-5">
        {[
          { label: 'Current Month Sales', value: '0.00' },
          { label: 'Current Month Gross Profit', value: '0.00' },
          { label: 'Profit Percentage', value: '0.00' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-white/8 bg-white/[0.04] p-3 backdrop-blur-sm">
            <p className="text-xs text-dashboard-text-label">{item.label}</p>
            <p className="mt-1 text-sm font-semibold text-dashboard-text-primary">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
