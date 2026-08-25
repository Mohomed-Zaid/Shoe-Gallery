import { useEffect, useState, type ReactNode } from 'react';
import { Alert, DataTable, LoadingSpinner, Modal } from '../ui';
import { getProfitItems } from '../../services/profitReportService';
import type { ProfitFilters, ProfitInvoiceRow, ProfitItem } from '../../types/profitReport';
import { formatDateTime } from '../../utils/format';
import { profitMargin, profitMoney } from '../../utils/profitReportFormat';
import { getErrorMessage } from '../../utils/errors';
export function ProfitDetailModal({ invoice, filters, onClose }: {
    invoice: ProfitInvoiceRow;
    filters: ProfitFilters;
    onClose: () => void;
}) { const [items, setItems] = useState<ProfitItem[]>(); const [error, setError] = useState<string>(); useEffect(() => { let a = true; void getProfitItems(filters, invoice.sale_id).then(x => { if (a)
    setItems(x); }).catch(e => { if (a)
    setError(getErrorMessage(e, 'Unable to load profit details.')); }); return () => { a = false; }; }, [filters, invoice.sale_id]); return <Modal title={`Profit · ${invoice.invoice_number}`} onClose={onClose} size="xl" respectSidebar>{error ? <Alert message={error}/> : !items ? <div className="flex min-h-64 items-center justify-center"><LoadingSpinner /></div> : <div className="space-y-5"><div className="grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-6">{[['Invoice', invoice.invoice_number], ['Date', formatDateTime(invoice.sale_date)], ['Customer', invoice.customer_name], ['Payment', invoice.payment_method], ['Cashier', invoice.cashier_name], ['Status', invoice.status]].map(([l, v]) => <div key={l}><p className="text-xs uppercase text-dashboard-text-label">{l}</p><p className="mt-1 text-sm font-medium">{v}</p></div>)}</div><DataTable columns={['Product', 'Article', 'Size', 'Colour', 'Barcode', 'Qty', 'Selling Price', 'Discount', 'Net Revenue', 'Unit Cost', 'Total Cost', 'Gross Product Profit', 'Card Fee (2.75%)', 'Net Profit', 'Margin'].map((h, i) => ({ key: String(i), header: h }))}>{items.map(i => <tr key={i.sale_item_id}><Cell strong>{i.product_name}</Cell><Cell>{i.article || '—'}</Cell><Cell>{i.size || '—'}</Cell><Cell>{i.colour || '—'}</Cell><Cell>{i.barcode || '—'}</Cell><Cell>{i.quantity}</Cell><Cell>{profitMoney(i.selling_price)}</Cell><Cell>{profitMoney(i.discount)}</Cell><Cell>{profitMoney(i.net_revenue)}</Cell><Cell>{profitMoney(i.unit_cost)}</Cell><Cell>{profitMoney(i.total_cost)}</Cell><Cell>{profitMoney(i.gross_product_profit)}</Cell><Cell>{i.card_processing_fee === 0 ? profitMoney(0) : `-${profitMoney(i.card_processing_fee)}`}</Cell><td className={`px-4 py-3 text-sm font-semibold ${i.profit !== null && i.profit < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{profitMoney(i.profit)}</td><Cell>{profitMargin(i.margin)}</Cell></tr>)}</DataTable></div>}</Modal>; }
function Cell({ children, strong = false }: {
    children: ReactNode;
    strong?: boolean;
}) { return <td className={`whitespace-nowrap px-4 py-3 text-sm ${strong ? 'font-semibold' : 'text-dashboard-text-sub'}`}>{children}</td>; }
