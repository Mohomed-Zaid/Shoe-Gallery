import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Filter, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, Input, Select } from '../ui';
import type { ReportPreset, SalesReportFilters as Filters } from '../../types/salesReport';

export function presetDates(p: ReportPreset) {
  const now = new Date(); let start = new Date(now); let end = new Date(now);
  const date = (value: Date) => value.toLocaleDateString('en-CA');
  if (p === 'yesterday') { start.setDate(start.getDate() - 1); end = start; }
  if (p === 'last_7_days') start.setDate(start.getDate() - 6);
  if (p === 'this_week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (p === 'last_30_days') start.setDate(start.getDate() - 29);
  if (p === 'this_month') start.setDate(1);
  if (p === 'last_month') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
  if (p === 'this_year') start = new Date(now.getFullYear(), 0, 1);
  return { startDate: date(start), endDate: date(end) };
}

const presets: Array<[ReportPreset, string]> = [['today','Today'],['yesterday','Yesterday'],['last_7_days','7 days'],['this_week','This week'],['last_30_days','30 days'],['this_month','This month'],['last_month','Last month'],['this_year','This year']];
const advancedKeys: Array<keyof Filters> = ['invoice','customer','phone','cashier','product','category','brand','size','colour','barcode','paymentMethod','saleType','status','minTotal','maxTotal'];

export function SalesReportFilters({ value, preset, onPreset, onChange, onApply, onReset }: { value: Filters; preset: ReportPreset; onPreset: (p: ReportPreset) => void; onChange: (v: Filters) => void; onApply: () => void; onReset: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const set = (key: keyof Filters, next: string) => onChange({ ...value, [key]: next });
  const active = advancedKeys.filter(key => Boolean(value[key]));
  const clear = (key: keyof Filters) => onChange({ ...value, [key]: '' });
  return <section className="glass-card overflow-hidden print-hidden">
    <div className="border-b border-white/10 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-sky-400/10 p-2 text-sky-300"><Filter size={18}/></div><div><h2 className="font-semibold text-dashboard-text-primary">Report filters</h2><p className="text-xs text-dashboard-text-sub">Choose a period, then narrow the results if needed.</p></div></div>
        <button type="button" onClick={() => setExpanded(open => !open)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-dashboard-text-sub transition hover:bg-white/[0.06] hover:text-white"><SlidersHorizontal size={15}/>{expanded ? 'Hide advanced' : 'Advanced filters'}{active.length > 0 && <span className="rounded-full bg-sky-400 px-2 py-0.5 text-[11px] font-bold text-slate-950">{active.length}</span>}{expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{presets.map(([key,label]) => <button type="button" key={key} onClick={() => onPreset(key)} className={`rounded-xl px-3 py-2 text-xs font-medium transition ${preset === key ? 'bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/20' : 'border border-white/10 bg-white/[0.04] text-dashboard-text-sub hover:bg-white/[0.09] hover:text-white'}`}>{label}</button>)}</div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
        <Input type="date" label="From date" value={value.startDate} onChange={e => set('startDate', e.target.value)}/>
        <Input type="date" label="To date" value={value.endDate} onChange={e => set('endDate', e.target.value)}/>
        <Button className="self-end" onClick={onApply}><Search size={16}/>Run report</Button>
        <Button className="self-end" variant="secondary" onClick={onReset}><RotateCcw size={16}/>Reset</Button>
      </div>
    </div>
    {expanded && <div className="bg-black/10 p-4 md:p-5"><div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-dashboard-text-label"><SlidersHorizontal size={14}/>Advanced filters</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Input placeholder="Invoice number" value={value.invoice || ''} onChange={e => set('invoice', e.target.value)}/><Input placeholder="Customer name" value={value.customer || ''} onChange={e => set('customer', e.target.value)}/><Input placeholder="Customer phone" value={value.phone || ''} onChange={e => set('phone', e.target.value)}/><Input placeholder="Cashier" value={value.cashier || ''} onChange={e => set('cashier', e.target.value)}/><Input placeholder="Product" value={value.product || ''} onChange={e => set('product', e.target.value)}/><Input placeholder="Category" value={value.category || ''} onChange={e => set('category', e.target.value)}/><Input placeholder="Brand" value={value.brand || ''} onChange={e => set('brand', e.target.value)}/><Input placeholder="Size" value={value.size || ''} onChange={e => set('size', e.target.value)}/><Input placeholder="Colour" value={value.colour || ''} onChange={e => set('colour', e.target.value)}/><Input placeholder="Barcode" value={value.barcode || ''} onChange={e => set('barcode', e.target.value)}/>
      <Select value={value.paymentMethod || ''} onChange={e => set('paymentMethod', e.target.value)}><option value="">All payment methods</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="credit">Credit</option><option value="other">Other</option></Select>
      <Select value={value.saleType || ''} onChange={e => set('saleType', e.target.value)}><option value="">All sale types</option><option value="inventory">Inventory Sale</option><option value="instant">Instant Billing</option><option value="mixed">Mixed Sale</option></Select>
      <Select value={value.status || ''} onChange={e => set('status', e.target.value)}><option value="">All statuses</option><option value="completed">Completed</option><option value="partially_returned">Partially Returned</option><option value="fully_returned">Fully Returned</option><option value="cancelled">Cancelled</option></Select>
      <Input type="number" placeholder="Minimum total" value={value.minTotal || ''} onChange={e => set('minTotal', e.target.value)}/><Input type="number" placeholder="Maximum total" value={value.maxTotal || ''} onChange={e => set('maxTotal', e.target.value)}/>
    </div></div>}
    {(active.length > 0 || preset === 'custom') && <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3"><span className="mr-1 text-xs text-dashboard-text-label">Active:</span><span className="inline-flex items-center gap-1 rounded-full bg-sky-400/10 px-3 py-1 text-xs text-sky-300"><CalendarDays size={12}/>{value.startDate} — {value.endDate}</span>{active.map(key => <button type="button" key={key} onClick={() => clear(key)} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-dashboard-text-sub hover:border-red-400/30 hover:text-red-300">{key}: {value[key]}<X size={12}/></button>)}</div>}
  </section>;
}
