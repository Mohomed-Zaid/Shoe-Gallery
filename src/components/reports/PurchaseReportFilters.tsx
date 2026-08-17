import { RotateCcw, Search } from 'lucide-react';
import { Button, Input, Select } from '../ui';
import type { PurchaseReportFilters as Filters, PurchaseReportOptions, PurchaseReportPreset } from '../../types/purchaseReport';

const presets: Array<[PurchaseReportPreset, string]> = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['last_7_days', 'Last 7 Days'],
  ['this_month', 'This Month'], ['last_month', 'Last Month'], ['all_time', 'All Time'], ['custom', 'Custom Range'],
];

interface Props { value: Filters; preset: PurchaseReportPreset; options: PurchaseReportOptions; onPreset: (value: PurchaseReportPreset) => void; onChange: (value: Filters) => void; onApply: () => void; onReset: () => void; }

export function PurchaseReportFilters({ value, preset, options, onPreset, onChange, onApply, onReset }: Props) {
  const set = (key: keyof Filters, next: string) => onChange({ ...value, [key]: next });
  return <section className="glass-card p-4 print-hidden">
    <div className="flex flex-wrap gap-2">{presets.map(([key, label]) => <button type="button" key={key} onClick={() => onPreset(key)} className={`rounded-xl px-3 py-2 text-xs ${preset === key ? 'bg-emerald-400 font-semibold text-slate-950' : 'border border-white/10 text-dashboard-text-sub'}`}>{label}</button>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Input label="From Date" type="date" value={value.startDate} onChange={(event) => set('startDate', event.target.value)} />
      <Input label="To Date" type="date" value={value.endDate} onChange={(event) => set('endDate', event.target.value)} />
      <Input label="Search" placeholder="Search purchase, supplier, invoice..." value={value.search} onChange={(event) => set('search', event.target.value)} />
      <Select label="Supplier" value={value.supplierId} onChange={(event) => set('supplierId', event.target.value)}><option value="">All suppliers</option>{options.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select>
      <Select label="Payment Status" value={value.paymentStatus} onChange={(event) => set('paymentStatus', event.target.value)}><option value="">All</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option></Select>
      <Select label="Purchase Status" value={value.purchaseStatus} onChange={(event) => set('purchaseStatus', event.target.value)}><option value="">All statuses</option><option value="completed">Completed</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option></Select>
      <Select label="Payment Method" value={value.paymentMethod} onChange={(event) => set('paymentMethod', event.target.value)}><option value="">All methods</option>{options.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</Select>
      <div className="flex items-end gap-2"><Button className="flex-1" onClick={onApply}><Search size={16} />Run report</Button><Button variant="secondary" onClick={onReset} title="Clear filters"><RotateCcw size={16} /></Button></div>
    </div>
  </section>;
}
