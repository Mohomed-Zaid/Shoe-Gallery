import { useEffect, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Alert, Button, DataTable, LoadingSpinner, Modal } from '../ui';
import { getCashupDetail } from '../../services/cashupReportService';
import { downloadIndividualCashupPdf } from '../../services/cashupReportExport';
import type { CashupDetail, CashupRow } from '../../types/cashupReport';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { getErrorMessage } from '../../utils/errors';
import { CashupStatusBadge } from './CashupStatusBadge';
export function CashupDetailModal({ session, onClose }: {
    session: CashupRow;
    onClose: () => void;
}) { const [d, setD] = useState<CashupDetail>(), [error, setError] = useState<string>(); useEffect(() => { let active = true; void getCashupDetail(session).then(x => { if (active)
    setD(x); }).catch(e => { if (active)
    setError(getErrorMessage(e, 'Unable to load cashup details.')); }); return () => { active = false; }; }, [session]); return <Modal title={session.cashup_number} onClose={onClose} size='xl' respectSidebar>{error ? <Alert message={error}/> : !d ? <div className='flex min-h-64 items-center justify-center'><LoadingSpinner /></div> : <Detail d={d}/>}</Modal>; }
function Detail({ d }: {
    d: CashupDetail;
}) { const s = d.session; return <div className='space-y-6'><div className='flex justify-end'><Button variant='secondary' onClick={() => downloadIndividualCashupPdf(d)}><Download size={16}/>Download Cashup PDF</Button></div><section><h3 className='mb-3 font-semibold'>Cashup Information</h3><Info values={[['Cashup Number', s.cashup_number], ['Cashier', s.cashier_name], ['Status', s.auto_closed ? 'AUTO CLOSED' : s.status.toUpperCase()], ['Close Type', s.auto_closed ? 'Automatic' : s.status === 'closed' ? 'Manual' : '—'], ['Opened At', formatDateTime(s.opening_time)], ['Closed At', s.closing_time ? formatDateTime(s.closing_time) : '—'], ['Opening Cash', formatCurrency(s.opening_cash)], ['Closing Notes', s.notes || '—']]}/></section><section><h3 className='mb-3 font-semibold'>Card Settlement</h3><Info values={[["Gross Card Sales", formatCurrency(s.card_sales)], ["Card Fee (2.75%)", s.card_processing_fees === 0 ? formatCurrency(0) : `-${formatCurrency(s.card_processing_fees)}`], ["Net Card Amount", formatCurrency(s.net_card_amount)]]}/></section><section><h3 className='mb-3 font-semibold'>Cash Reconciliation</h3><div className='grid max-w-xl grid-cols-2 gap-2 rounded-xl border border-white/10 p-4'>{[['Opening Cash', s.opening_cash], ['+ Cash Sales', s.cash_sales], ['- Cash Refunds', -s.cash_refunds], ['- Cash Expenses', -s.cash_expenses], ['- Bank Deposits', -s.bank_deposits], ['Expected Cash', s.expected_cash]].map(([l, v]) => <div className='contents' key={String(l)}><span>{l}</span><strong className='text-right'>{formatCurrency(Number(v))}</strong></div>)}<span>Counted Cash</span><strong className='text-right'>{s.counted_cash === null ? '—' : formatCurrency(s.counted_cash)}</strong><span>Difference</span><strong className='text-right'>{s.difference === null ? '—' : formatCurrency(s.difference)}</strong><span>Status</span><span className='text-right'><CashupStatusBadge row={s}/></span></div></section><DepositTable rows={d.deposits}/><MovementTable d={d}/></div>; }
function DepositTable({ rows }: {
    rows: CashupDetail['deposits'];
}) { return <section><h3 className='mb-3 font-semibold'>Bank Deposits</h3><DataTable columns={['Date', 'Time', 'Bank', 'Reference', 'Amount', 'Recorded By', 'Notes'].map((header, key) => ({ key: String(key), header }))} isEmpty={!rows.length}>{rows.map(v => <tr key={v.id}><Cell>{new Date(v.date).toLocaleDateString()}</Cell><Cell>{new Date(v.date).toLocaleTimeString()}</Cell><Cell>{v.bank}</Cell><Cell>{v.reference || '—'}</Cell><Cell>{formatCurrency(v.amount)}</Cell><Cell>{v.recorded_by}</Cell><Cell>{v.notes || '—'}</Cell></tr>)}</DataTable></section>; }
function MovementTable({ d }: {
    d: CashupDetail;
}) { return <>{d.refunds.length > 0 && <section><h3 className='mb-3 font-semibold'>Returns / Refunds</h3><DataTable columns={['Return No', 'Invoice', 'Time', 'Method', 'Amount', 'Processed By'].map((header, key) => ({ key: String(key), header }))}>{d.refunds.map(r => <tr key={r.id}><Cell>{r.return_number}</Cell><Cell>{r.invoice}</Cell><Cell>{formatDateTime(r.date)}</Cell><Cell>{r.method}</Cell><Cell>{formatCurrency(r.amount)}</Cell><Cell>{r.processed_by}</Cell></tr>)}</DataTable></section>}{d.expenses.length > 0 && <section><h3 className='mb-3 font-semibold'>Cash Expenses</h3><DataTable columns={['Time', 'Note', 'Amount', 'User'].map((header, key) => ({ key: String(key), header }))}>{d.expenses.map(e => <tr key={e.id}><Cell>{formatDateTime(e.date)}</Cell><Cell>{e.description}</Cell><Cell>{formatCurrency(-e.amount)}</Cell><Cell>{e.user}</Cell></tr>)}</DataTable></section>}</>; }
function Info({ values }: {
    values: Array<[
        string,
        string
    ]>;
}) { return <div className='grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-4'>{values.map(([l, v]) => <div key={l}><p className='text-xs uppercase text-dashboard-text-label'>{l}</p><p className='mt-1 text-sm font-medium'>{v}</p></div>)}</div>; }
function Cell({ children }: {
    children: ReactNode;
}) { return <td className='whitespace-nowrap px-4 py-3 text-sm text-dashboard-text-sub'>{children}</td>; }
