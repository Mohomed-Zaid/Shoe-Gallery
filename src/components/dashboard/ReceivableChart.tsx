const segments = [
  { label: 'Due', value: '0.00', color: '#ffffff', percent: 0 },
  { label: 'Current Month', value: '0.00', color: 'rgba(20,184,166,0.7)', percent: 0 },
  { label: 'Received', value: '0.00', color: 'rgba(255,255,255,0.25)', percent: 100 },
];

export function ReceivableChart() {
  let offset = 0;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="glass-card flex h-full flex-col p-6">
      <h3 className="relative z-10 mb-5 text-sm font-semibold text-dashboard-text-primary">
        Customer Receivable
      </h3>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-dashboard-teal/10 blur-2xl" />
          <svg width="180" height="180" viewBox="0 0 180 180" className="relative">
            <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="22" />
            {segments.map((segment) => {
              const dash = (segment.percent / 100) * circumference;
              const circle = (
                <circle
                  key={segment.label}
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="22"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 90 90)"
                  strokeLinecap="round"
                />
              );
              offset += dash;
              return circle;
            })}
          </svg>
        </div>
      </div>

      <div className="relative z-10 mt-5 space-y-3 border-t border-white/10 pt-5">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-xs backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/10" style={{ backgroundColor: segment.color }} />
              <span className="text-dashboard-text-label">{segment.label}</span>
            </div>
            <span className="font-medium text-dashboard-text-primary">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
