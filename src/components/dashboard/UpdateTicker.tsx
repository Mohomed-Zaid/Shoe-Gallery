const updates = [
  'Welcome to Shoe Gallery Management System',
  'Track sales, inventory, and customer receivables in real time',
  'Use POS for quick checkout and stock updates',
  'Review monthly profit reports from the dashboard',
];

export function UpdateTicker() {
  const text = updates.join('   •   ');

  return (
    <div className="glass-ticker flex items-center gap-4 overflow-hidden px-5 py-3.5">
      <span className="shrink-0 rounded-lg bg-gradient-to-r from-dashboard-accent to-amber-400 px-3 py-1 text-xs font-bold uppercase tracking-wider text-black shadow-lg shadow-dashboard-accent-glow">
        New Updates
      </span>
      <div className="relative flex-1 overflow-hidden">
        <p className="ticker-scroll whitespace-nowrap text-sm text-dashboard-text-sub">
          {text}   •   {text}
        </p>
      </div>
    </div>
  );
}
