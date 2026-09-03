import { useEffect, useState, type ReactNode } from 'react';
import { Download, Edit2 } from 'lucide-react';
import { Alert, Button, DataTable, Input, LoadingSpinner, Modal } from '../ui';
import { getCashupDetail } from '../../services/cashupReportService';
import { updateCashExpense } from '../../services/cashRegisterService';
import { downloadIndividualCashupPdf } from '../../services/cashupReportExport';
import type { CashupDetail, CashupExpense, CashupRow } from '../../types/cashupReport';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { getErrorMessage } from '../../utils/errors';
import { useAuth } from '../../context/AuthContext';
import { CashupStatusBadge } from './CashupStatusBadge';

export function CashupDetailModal({ session, onClose, onUpdated }: {
  session: CashupRow;
  onClose: () => void;
  onUpdated?: () => void | Promise<void>;
}) {
  const { profile } = useAuth();
  const [detail, setDetail] = useState<CashupDetail>();
  const [loadError, setLoadError] = useState<string>();
  const [editError, setEditError] = useState<string>();
  const [editing, setEditing] = useState<CashupExpense>();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getCashupDetail(session)
      .then((value) => { if (active) setDetail(value); })
      .catch((error) => { if (active) setLoadError(getErrorMessage(error, 'Unable to load cashup details.')); });
    return () => { active = false; };
  }, [session]);

  const beginEdit = (expense: CashupExpense) => {
    setEditing(expense);
    setAmount(String(expense.amount));
    setDescription(expense.description);
    setEditError(undefined);
  };

  const saveExpense = async () => {
    if (!editing || !detail) return;
    const nextAmount = Number(amount);
    const nextDescription = description.trim();
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setEditError('Expense amount must be greater than 0.');
      return;
    }
    if (!nextDescription) {
      setEditError('Description is required.');
      return;
    }

    setSaving(true);
    setEditError(undefined);
    try {
      await updateCashExpense(editing.id, nextAmount, nextDescription);
      const currentSession = detail.session;
      const cashExpenses = Number(currentSession.cash_expenses) - editing.amount + nextAmount;
      const expectedCash = Number(currentSession.expected_cash) + editing.amount - nextAmount;
      const difference = currentSession.counted_cash === null ? null : Number(currentSession.counted_cash) - expectedCash;
      const differenceStatus = currentSession.status === 'open'
        ? 'open'
        : currentSession.auto_closed
          ? 'auto_closed'
          : difference !== null && Math.abs(difference) <= 0.01
            ? 'balanced'
            : difference !== null && difference < 0 ? 'short' : 'over';
      setDetail({
        ...detail,
        session: { ...currentSession, cash_expenses: cashExpenses, expected_cash: expectedCash, difference, difference_status: differenceStatus },
        expenses: detail.expenses.map((expense) => expense.id === editing.id
          ? { ...expense, amount: nextAmount, description: nextDescription }
          : expense),
      });
      setEditing(undefined);
      await onUpdated?.();
    } catch (error) {
      setEditError(getErrorMessage(error, 'Unable to update expense.'));
    } finally {
      setSaving(false);
    }
  };

  return <>
    {!editing && <Modal title={session.cashup_number} onClose={onClose} size='xl' respectSidebar>
      {loadError ? <Alert message={loadError}/> : !detail
        ? <div className='flex min-h-64 items-center justify-center'><LoadingSpinner /></div>
        : <Detail detail={detail} canEditExpenses={profile?.role === 'admin'} onEditExpense={beginEdit}/>
      }
    </Modal>}
    {editing && <Modal title='Edit Cash Expense' onClose={() => setEditing(undefined)} size='sm'>
      <div className='space-y-4'>
        {editError && <Alert message={editError}/>}
        <Input id='cashup-expense-amount' label='Expense Amount' type='number' min={0.01} step='0.01' value={amount} onChange={(event) => setAmount(event.target.value)}/>
        <Input id='cashup-expense-description' label='Description' value={description} onChange={(event) => setDescription(event.target.value)}/>
        <div className='flex justify-end gap-2 pt-2'>
          <Button variant='secondary' disabled={saving} onClick={() => setEditing(undefined)}>Cancel</Button>
          <Button disabled={saving} onClick={() => void saveExpense()}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </Modal>}
  </>;
}

function Detail({ detail, canEditExpenses, onEditExpense }: {
  detail: CashupDetail;
  canEditExpenses: boolean;
  onEditExpense: (expense: CashupExpense) => void;
}) {
  const session = detail.session;
  return <div className='space-y-6'>
    <div className='flex justify-end'><Button variant='secondary' onClick={() => downloadIndividualCashupPdf(detail)}><Download size={16}/>Download Cashup PDF</Button></div>
    <section><h3 className='mb-3 font-semibold'>Cashup Information</h3><Info values={[
      ['Cashup Number', session.cashup_number], ['Cashier', session.cashier_name], ['Status', session.auto_closed ? 'AUTO CLOSED' : session.status.toUpperCase()],
      ['Close Type', session.auto_closed ? 'Automatic' : session.status === 'closed' ? 'Manual' : '—'], ['Opened At', formatDateTime(session.opening_time)],
      ['Closed At', session.closing_time ? formatDateTime(session.closing_time) : '—'], ['Opening Cash', formatCurrency(session.opening_cash)], ['Closing Notes', session.notes || '—'],
    ]}/></section>
    <section><h3 className='mb-3 font-semibold'>Card Settlement</h3><Info values={[
      ['Gross Card Sales', formatCurrency(session.card_sales)], ['Card Fee (2.75%)', session.card_processing_fees === 0 ? formatCurrency(0) : `-${formatCurrency(session.card_processing_fees)}`],
      ['Net Card Amount', formatCurrency(session.net_card_amount)],
    ]}/></section>
    <section><h3 className='mb-3 font-semibold'>Cash Reconciliation</h3><div className='grid max-w-xl grid-cols-2 gap-2 rounded-xl border border-white/10 p-4'>
      {[
        ['Opening Cash', session.opening_cash], ['+ Cash Sales', session.cash_sales], ['- Cash Refunds', -session.cash_refunds],
        ['- Cash Expenses', -session.cash_expenses], ['- Bank Deposits', -session.bank_deposits], ['Expected Cash', session.expected_cash],
      ].map(([label, value]) => <div className='contents' key={String(label)}><span>{label}</span><strong className='text-right'>{formatCurrency(Number(value))}</strong></div>)}
      <span>Counted Cash</span><strong className='text-right'>{session.counted_cash === null ? '—' : formatCurrency(session.counted_cash)}</strong>
      <span>Difference</span><strong className='text-right'>{session.difference === null ? '—' : formatCurrency(session.difference)}</strong>
      <span>Status</span><span className='text-right'><CashupStatusBadge row={session}/></span>
    </div></section>
    <DepositTable rows={detail.deposits}/>
    <MovementTable detail={detail} canEditExpenses={canEditExpenses} onEditExpense={onEditExpense}/>
  </div>;
}

function DepositTable({ rows }: { rows: CashupDetail['deposits'] }) {
  return <section><h3 className='mb-3 font-semibold'>Bank Deposits</h3><DataTable columns={['Date', 'Time', 'Bank', 'Reference', 'Amount', 'Recorded By', 'Notes'].map((header, key) => ({ key: String(key), header }))} isEmpty={!rows.length}>
    {rows.map((deposit) => <tr key={deposit.id}><Cell>{new Date(deposit.date).toLocaleDateString()}</Cell><Cell>{new Date(deposit.date).toLocaleTimeString()}</Cell><Cell>{deposit.bank}</Cell><Cell>{deposit.reference || '—'}</Cell><Cell>{formatCurrency(deposit.amount)}</Cell><Cell>{deposit.recorded_by}</Cell><Cell>{deposit.notes || '—'}</Cell></tr>)}
  </DataTable></section>;
}

function MovementTable({ detail, canEditExpenses, onEditExpense }: {
  detail: CashupDetail;
  canEditExpenses: boolean;
  onEditExpense: (expense: CashupExpense) => void;
}) {
  return <>
    {detail.refunds.length > 0 && <section><h3 className='mb-3 font-semibold'>Returns / Refunds</h3><DataTable columns={['Return No', 'Invoice', 'Time', 'Method', 'Amount', 'Processed By'].map((header, key) => ({ key: String(key), header }))}>
      {detail.refunds.map((refund) => <tr key={refund.id}><Cell>{refund.return_number}</Cell><Cell>{refund.invoice}</Cell><Cell>{formatDateTime(refund.date)}</Cell><Cell>{refund.method}</Cell><Cell>{formatCurrency(refund.amount)}</Cell><Cell>{refund.processed_by}</Cell></tr>)}
    </DataTable></section>}
    {detail.expenses.length > 0 && <section><h3 className='mb-3 font-semibold'>Cash Expenses</h3><DataTable columns={[
      ...['Time', 'Note', 'Amount', 'User'].map((header, key) => ({ key: String(key), header })),
      ...(canEditExpenses ? [{ key: 'actions', header: 'Actions', className: 'text-right' }] : []),
    ]}>
      {detail.expenses.map((expense) => <tr key={expense.id}><Cell>{formatDateTime(expense.date)}</Cell><Cell>{expense.description}</Cell><Cell>{formatCurrency(-expense.amount)}</Cell><Cell>{expense.user}</Cell>{canEditExpenses && <td className='whitespace-nowrap px-4 py-3 text-right'><button type='button' onClick={() => onEditExpense(expense)} className='rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white' aria-label={`Edit expense ${expense.description}`} title='Edit expense'><Edit2 size={17}/></button></td>}</tr>)}
    </DataTable></section>}
  </>;
}

function Info({ values }: { values: Array<[string, string]> }) {
  return <div className='grid gap-3 rounded-xl border border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-4'>{values.map(([label, value]) => <div key={label}><p className='text-xs uppercase text-dashboard-text-label'>{label}</p><p className='mt-1 text-sm font-medium'>{value}</p></div>)}</div>;
}

function Cell({ children }: { children: ReactNode }) {
  return <td className='whitespace-nowrap px-4 py-3 text-sm text-dashboard-text-sub'>{children}</td>;
}
