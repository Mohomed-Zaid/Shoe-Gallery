import { Banknote, CircleDollarSign, CircleOff, CreditCard, FileCheck2, FileText, PackageCheck, Percent, ReceiptText, RotateCcw, TrendingUp, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SalesReportSummary } from '../../types/salesReport';
import { formatCurrency } from '../../utils/format';

type Card = { label: string; value: string; icon: LucideIcon; tone: string; featured?: boolean };
export function SalesSummaryCards({ s, showProfit = true }: { s: SalesReportSummary; showProfit?: boolean }) {
  const money = (value: number | null) => value == null ? 'Not available' : formatCurrency(value);
  const primary: Card[] = [
    { label: 'Net sales', value: money(s.net_sales), icon: CircleDollarSign, tone: 'from-sky-500/20 to-cyan-400/5 text-sky-300', featured: true },
    { label: 'Gross profit', value: showProfit ? money(s.gross_profit) : 'Restricted', icon: TrendingUp, tone: 'from-emerald-500/20 to-emerald-400/5 text-emerald-300', featured: true },
    { label: 'Amount received', value: money(s.amount_received), icon: Banknote, tone: 'from-violet-500/20 to-violet-400/5 text-violet-300', featured: true },
    { label: 'Outstanding', value: money(s.outstanding_amount), icon: CreditCard, tone: 'from-amber-500/20 to-amber-400/5 text-amber-300', featured: true },
  ];
  const secondary: Card[] = [
    { label: 'Invoices', value: String(s.total_invoices), icon: FileText, tone: 'text-sky-300' },
    { label: 'Completed', value: String(s.completed_invoices), icon: FileCheck2, tone: 'text-emerald-300' },
    { label: 'Cancelled', value: String(s.cancelled_invoices), icon: CircleOff, tone: 'text-rose-300' },
    { label: 'Quantity sold', value: String(s.total_quantity_sold), icon: PackageCheck, tone: 'text-violet-300' },
    { label: 'Gross sales', value: money(s.gross_sales), icon: ReceiptText, tone: 'text-sky-300' },
    { label: 'Discounts', value: money(s.invoice_discounts + s.item_discounts), icon: Percent, tone: 'text-amber-300' },
    { label: 'Returns', value: money(s.returned_amount), icon: RotateCcw, tone: 'text-rose-300' },
    { label: 'Customers', value: String(s.unique_customers), icon: Users, tone: 'text-cyan-300' },
  ];
  return <section className="space-y-3">
    <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Performance overview</p><h2 className="mt-1 text-lg font-semibold text-dashboard-text-primary">Sales at a glance</h2></div><p className="hidden text-xs text-dashboard-text-sub md:block">Average invoice: <span className="font-semibold text-dashboard-text-primary">{money(s.average_invoice_value)}</span></p></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{primary.map(card => <SummaryCard key={card.label} card={card}/>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">{secondary.map(card => <SummaryCard key={card.label} card={card}/>)}</div>
    {showProfit && <div className="grid gap-3 md:grid-cols-3"><Mini label="Cost of goods" value={money(s.cost_of_goods)}/><Mini label="Profit margin" value={s.gross_profit_margin == null ? 'Not available' : `${s.gross_profit_margin.toFixed(2)}%`}/><Mini label="Instant billing" value={money(s.instant_billing_total)}/></div>}
    {s.missing_cost_items > 0 && <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-4 text-sm text-amber-200"><div className="mt-0.5 rounded-lg bg-amber-400/15 p-1.5"><CircleOff size={16}/></div><div><p className="font-semibold">Some profit values are unavailable</p><p className="mt-0.5 text-xs text-amber-100/70">{s.missing_cost_items} instant-sale item(s) have no recorded historical cost. They are excluded instead of being treated as zero.</p></div></div>}
  </section>;
}
function SummaryCard({ card }: { card: Card }) { const Icon = card.icon; return <div className={`group rounded-2xl border border-white/10 bg-gradient-to-br ${card.tone} ${card.featured ? 'p-5' : 'p-3.5'} transition duration-200 hover:-translate-y-0.5 hover:border-white/20`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-medium uppercase tracking-wide text-dashboard-text-label">{card.label}</p><p className={`${card.featured ? 'mt-3 text-2xl' : 'mt-2 text-lg'} truncate font-bold text-dashboard-text-primary`}>{card.value}</p></div><div className="rounded-xl border border-white/10 bg-black/10 p-2"><Icon size={card.featured ? 19 : 16}/></div></div></div> }
function Mini({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"><span className="text-xs text-dashboard-text-sub">{label}</span><span className="text-sm font-semibold text-dashboard-text-primary">{value}</span></div> }
