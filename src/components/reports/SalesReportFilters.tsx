import { RotateCcw, Search } from 'lucide-react';
import { Button, Input, Select } from '../ui';
import type {
  ReportPreset,
  SalesReportFilterOptions,
  SalesReportFilters as Filters,
} from '../../types/salesReport';

const presets: Array<[ReportPreset, string]> = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last_7_days', 'Last 7 Days'],
  ['this_month', 'This Month'],
  ['custom', 'Custom Range'],
];

interface Props {
  value: Filters;
  preset: ReportPreset;
  options: SalesReportFilterOptions;
  onPreset: (preset: ReportPreset) => void;
  onChange: (value: Filters) => void;
  onApply: () => void;
  onReset: () => void;
}

export function SalesReportFilters({
  value,
  preset,
  options,
  onPreset,
  onChange,
  onApply,
  onReset,
}: Props) {
  const set = (key: keyof Filters, next: string) => onChange({ ...value, [key]: next });
  return (
    <section className="glass-card p-4 print-hidden">
      <div className="flex flex-wrap gap-2">
        {presets.map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => onPreset(key)}
            className={`rounded-xl px-3 py-2 text-xs ${preset === key ? 'bg-sky-400 font-semibold text-slate-950' : 'border border-white/10 text-dashboard-text-sub'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Input label="From date" type="date" value={value.startDate} onChange={(event) => set('startDate', event.target.value)} />
        <Input label="To date" type="date" value={value.endDate} onChange={(event) => set('endDate', event.target.value)} />
        <Input label="Invoice number" placeholder="Search invoice" value={value.invoiceNumber} onChange={(event) => set('invoiceNumber', event.target.value)} />
        <Select label="Customer" value={value.customerId} onChange={(event) => set('customerId', event.target.value)}>
          <option value="">All customers</option>
          {options.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
        </Select>
        <Select label="Cashier" value={value.cashierId} onChange={(event) => set('cashierId', event.target.value)}>
          <option value="">All cashiers</option>
          {options.cashiers.map((cashier) => <option key={cashier.id} value={cashier.id}>{cashier.name}</option>)}
        </Select>
        <Select label="Payment method" value={value.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)}>
          <option value="">All payment methods</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="credit">Credit</option>
          <option value="split_payment">Split Payment</option>
        </Select>
        <Select label="Status" value={value.status} onChange={(event) => set('status', event.target.value)}>
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="partially_returned">Partially Returned</option>
          <option value="fully_returned">Fully Returned</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <div className="flex items-end gap-2">
          <Button className="flex-1" onClick={onApply}><Search size={16} />Run report</Button>
          <Button variant="secondary" onClick={onReset} title="Reset filters"><RotateCcw size={16} /></Button>
        </div>
      </div>
    </section>
  );
}
