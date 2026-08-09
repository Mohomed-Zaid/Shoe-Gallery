import { useCallback, useEffect, useState } from 'react';
import { Banknote, Download, FileSpreadsheet, LockKeyhole, Plus, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Alert, Button, DataTable, Input, LoadingSpinner, Modal, PageHeader, Pagination, Select, Textarea } from '../components/ui';
import { addCashExpense, closeRegister, getCurrentRegister, getRegisterSessions, getRegisterSummary, openRegister } from '../services/cashRegisterService';
import type { CashRegisterSession, CashRegisterSummary } from '../types/cashRegister';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/errors';
import { downloadBlob } from '../services/salesReportService';
const EXPENSE_TYPES = ['Shop Supplies', 'Utilities', 'Transport / Delivery', 'Repairs & Maintenance', 'Staff Expense', 'Rent', 'Refreshments', 'Other'] as const;
export function CashRegisterPage() {
    const [current, setCurrent] = useState<CashRegisterSummary | null>();
    const [rows, setRows] = useState<CashRegisterSession[]>([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [opening, setOpening] = useState(false);
    const [closing, setClosing] = useState(false);
    const [expense, setExpense] = useState(false);
    const [openAmount, setOpenAmount] = useState(0);
    const [actual, setActual] = useState(0);
    const [amount, setAmount] = useState(0);
    const [notes, setNotes] = useState('');
    const [description, setDescription] = useState('');
    const [expenseType, setExpenseType] = useState<(typeof EXPENSE_TYPES)[number]>('Shop Supplies');
    const load = useCallback(async () => { setLoading(true); try {
    const [c, h] = await Promise.all([getCurrentRegister(), getRegisterSessions(page)]);
    setCurrent(c);
    setRows(h.rows);
    setCount(h.count);
    setError(undefined);
}
catch (e) {
    setError(getErrorMessage(e));
}
finally {
    setLoading(false);
} }, [page]); useEffect(() => { void load(); }, [load]);
    const doOpen = async () => { try {
    await openRegister(openAmount, notes);
    setOpening(false);
    setNotes('');
    await load();
}
catch (e) {
    setError(getErrorMessage(e));
} };
    const doClose = async () => { if (!current)
    return; try {
    await closeRegister(current.id, actual, notes);
    setClosing(false);
    setNotes('');
    await load();
}
catch (e) {
    setError(getErrorMessage(e));
} };
    const doExpense = async () => {
        if (!current)
            return;
        const details = description.trim();
        const expenseDescription = details ? `${expenseType} - ${details}` : expenseType;
        try {
            await addCashExpense(current.id, amount, expenseDescription);
            setExpense(false);
            setAmount(0);
            setExpenseType('Shop Supplies');
            setDescription('');
            await load();
        }
        catch (e) {
            setError(getErrorMessage(e));
        }
    };
    const pdf = async (id: string) => { const x = await getRegisterSummary(id);
    const d = new jsPDF(); d.setFontSize(18); d.text('Cash Up Report', 14, 18); d.setFontSize(9); d.text(`${x.cashier_name} · ${formatDateTime(x.opening_time)} to ${x.closing_time ? formatDateTime(x.closing_time) : 'Open'}`, 14, 27); autoTable(d, { startY: 35, head: [['Metric', 'Amount']], body: [['Opening Cash', formatCurrency(Number(x.opening_balance))], ['Cash Sales', formatCurrency(Number(x.cash_sales))], ['Card Sales', formatCurrency(Number(x.card_sales))], ['Bank Sales', formatCurrency(Number(x.bank_sales))], ['Cash Refunds', formatCurrency(Number(x.cash_refunds))], ['Cash Expenses', formatCurrency(Number(x.cash_expenses))], ['Expected Cash', formatCurrency(Number(x.expected_cash ?? x.expected_cash_live))], ['Actual Cash', x.actual_cash == null ? '—' : formatCurrency(Number(x.actual_cash))], ['Difference', x.difference == null ? '—' : formatCurrency(Number(x.difference))]], theme: 'grid' }); d.save(`cash-up-${x.opening_time.slice(0, 10)}.pdf`); };
    const excel = async (id: string) => { const x = await getRegisterSummary(id);
    const rows = [['Cash Up Report', ''], ['Cashier', x.cashier_name], ['Open Time', x.opening_time], ['Close Time', x.closing_time || 'Open'], ['Opening Cash', x.opening_balance], ['Cash Sales', x.cash_sales], ['Card Sales', x.card_sales], ['Bank Sales', x.bank_sales], ['Cash Refunds', x.cash_refunds], ['Cash Expenses', x.cash_expenses], ['Expected Cash', x.expected_cash ?? x.expected_cash_live], ['Actual Cash', x.actual_cash ?? ''], ['Difference', x.difference ?? '']];
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Cash Up"><Table>${rows.map(r => `<Row>${r.map(v => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${v}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`; downloadBlob('cash-up-report.xls', xml, 'application/vnd.ms-excel'); }; return <div className="space-y-6"><PageHeader title="Cash Register" description="Open cash, live drawer position, expenses, cash up and shift history." action={<Button variant="secondary" onClick={() => void load()}><RefreshCw size={16}/>Refresh</Button>}/>{error && <Alert message={error}/>} {loading ? <LoadingSpinner /> : <><section className={`glass-card p-5 ${current ? 'border-emerald-400/25' : 'border-amber-400/25'}`}><div className="relative z-10"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-dashboard-text-label">Register status</p><h2 className={`mt-1 text-2xl font-bold ${current ? 'text-emerald-300' : 'text-amber-300'}`}>{current ? 'OPEN' : 'CLOSED'}</h2>{current && <p className="mt-1 text-sm text-dashboard-text-sub">Opened {formatDateTime(current.opening_time)} by {current.cashier_name}</p>}</div><div className="flex flex-wrap gap-2">{!current ? <Button onClick={() => setOpening(true)}><LockKeyhole size={16}/>Open Register</Button> : <><Button variant="secondary" onClick={() => setExpense(true)}><Plus size={16}/>Cash Expense</Button><Button variant="danger" onClick={() => { setActual(Number(current.expected_cash_live)); setClosing(true); }}><Banknote size={16}/>Cash Up & Close</Button></>}</div></div>{current && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"><Metric l="Opening" v={current.opening_balance}/><Metric l="Cash Sales" v={current.cash_sales}/><Metric l="Card Sales" v={current.card_sales}/><Metric l="Bank Sales" v={current.bank_sales}/><Metric l="Cash Refunds" v={-current.cash_refunds}/><Metric l="Expenses" v={-current.cash_expenses}/><Metric l="Expected Cash" v={current.expected_cash_live} strong/></div>}</div></section><section><h2 className="mb-3 font-semibold">Register History</h2><DataTable columns={[{ key: 'cashier', header: 'Cashier' }, { key: 'open', header: 'Open Time' }, { key: 'close', header: 'Close Time' }, { key: 'opening', header: 'Opening' }, { key: 'expected', header: 'Expected' }, { key: 'actual', header: 'Actual' }, { key: 'difference', header: 'Difference' }, { key: 'status', header: 'Status' }, { key: 'actions', header: 'Cash Up Report' }]} isEmpty={!rows.length}>{rows.map(x => <tr key={x.id}><td className="px-4 py-3">{x.cashier?.full_name || x.cashier?.email || 'Cashier'}</td><td className="px-4 py-3">{formatDateTime(x.opening_time)}</td><td className="px-4 py-3">{x.closing_time ? formatDateTime(x.closing_time) : '—'}</td><td className="px-4 py-3">{formatCurrency(Number(x.opening_balance))}</td><td className="px-4 py-3">{x.expected_cash == null ? '—' : formatCurrency(Number(x.expected_cash))}</td><td className="px-4 py-3">{x.actual_cash == null ? '—' : formatCurrency(Number(x.actual_cash))}</td><td className="px-4 py-3">{x.difference == null ? '—' : formatCurrency(Number(x.difference))}</td><td className="px-4 py-3 uppercase">{x.status}</td><td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => void pdf(x.id)}><Download size={14}/>PDF</Button><Button size="sm" variant="secondary" onClick={() => void excel(x.id)}><FileSpreadsheet size={14}/>Excel</Button></div></td></tr>)}</DataTable><Pagination page={page} totalPages={Math.max(1, Math.ceil(count / 20))} onPageChange={setPage}/></section></>}{opening && <Modal title="Open Cash Register" onClose={() => setOpening(false)}><Input label="Opening Cash Amount" type="number" min={0} step="0.01" value={openAmount} onChange={e => setOpenAmount(Number(e.target.value))}/><div className="mt-4"><Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)}/></div><Button className="mt-5 w-full" onClick={() => void doOpen()}>Open Register</Button></Modal>}
        {expense && <Modal title="Record Cash Expense" onClose={() => setExpense(false)}>
            <Input label="Expense Amount" type="number" min={0.01} step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))}/>
            <div className="mt-4">
                <Select
                    label="Expense Type"
                    value={expenseType}
                    onChange={e => setExpenseType(e.target.value as (typeof EXPENSE_TYPES)[number])}
                >
                    {EXPENSE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </Select>
            </div>
            <div className="mt-4"><Input label="Additional Details (Optional)" value={description} onChange={e => setDescription(e.target.value)}/></div>
            <Button className="mt-5 w-full" onClick={() => void doExpense()}>Save Expense</Button>
        </Modal>}
        {closing && current && <Modal title="Cash Up & Close Register" onClose={() => setClosing(false)}><div className="mb-4 space-y-2 text-sm"><Line l="Opening Cash" v={current.opening_balance}/><Line l="Cash Sales" v={current.cash_sales}/><Line l="Cash Refunds" v={-current.cash_refunds}/><Line l="Cash Expenses" v={-current.cash_expenses}/><Line l="Expected Cash" v={current.expected_cash_live} strong/></div><Input label="Actual Cash Counted" type="number" min={0} step="0.01" value={actual} onChange={e => setActual(Number(e.target.value))}/><p className={`mt-2 text-sm font-semibold ${actual - current.expected_cash_live === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>Difference: {formatCurrency(actual - current.expected_cash_live)}</p><div className="mt-4"><Textarea label="Closing Notes" value={notes} onChange={e => setNotes(e.target.value)}/></div><Button variant="danger" className="mt-5 w-full" onClick={() => void doClose()}>Close Register</Button></Modal>}</div>; }
function Metric({ l, v, strong = false }: {
    l: string;
    v: number;
    strong?: boolean;
}) { return <div className={`rounded-xl border p-3 ${strong ? 'border-sky-400/30 bg-sky-400/10' : 'border-white/10 bg-white/[.03]'}`}><p className="text-xs text-dashboard-text-sub">{l}</p><p className="mt-1 font-bold">{formatCurrency(Number(v))}</p></div>; }
function Line({ l, v, strong = false }: {
    l: string;
    v: number;
    strong?: boolean;
}) { return <div className={`flex justify-between ${strong ? 'border-t border-white/10 pt-2 font-bold' : ''}`}><span>{l}</span><span>{formatCurrency(Number(v))}</span></div>; }
