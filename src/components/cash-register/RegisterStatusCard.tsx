import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CircleDollarSign, Clock3 } from 'lucide-react';
import { getCurrentRegister } from '../../services/cashRegisterService';
import { formatCurrency } from '../../utils/format';

const TIME_ZONE = 'Asia/Colombo';

export function RegisterStatusCard() {
  const { data, isLoading } = useQuery({ queryKey: ['current-register'], queryFn: getCurrentRegister, refetchInterval: 30_000 });
  const openedTime = data ? new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(data.opening_time)) : '';
  return (
    <Link to="/cash-register" className={`glass-card block border p-4 transition hover:bg-white/[0.04] ${data ? 'border-emerald-400/25' : 'border-amber-400/25'}`}>
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2 ${data ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}><CircleDollarSign size={20} /></div>
          <div><p className="text-[11px] font-semibold uppercase tracking-wider text-dashboard-text-label">Cash Register</p><p className={`mt-0.5 text-sm font-bold ${data ? 'text-emerald-300' : 'text-amber-300'}`}>{isLoading ? 'LOADING…' : data ? 'OPEN' : 'CLOSED'}</p></div>
        </div>
        {data && <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.07] pt-3 text-sm sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <div><small className="block text-xs text-dashboard-text-sub">Opening Cash</small><b className="mt-0.5 block truncate">{formatCurrency(Number(data.opening_balance))}</b></div>
          <div><small className="block text-xs text-dashboard-text-sub">Expected Cash</small><b className="mt-0.5 block truncate">{formatCurrency(Number(data.expected_cash_live))}</b></div>
          <div><small className="block text-xs text-dashboard-text-sub">Opened</small><b className="mt-0.5 inline-flex items-center gap-1"><Clock3 size={13} />{openedTime}</b></div>
          <div><small className="block text-xs text-dashboard-text-sub">Cashier</small><b className="mt-0.5 block truncate">{data.cashier_name}</b></div>
        </div>}
      </div>
    </Link>
  );
}
