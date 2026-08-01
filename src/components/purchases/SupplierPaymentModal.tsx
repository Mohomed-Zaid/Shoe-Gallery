import { useState } from 'react';
import { Alert, Button, Input, Modal, Select, Textarea } from '../ui';
import { recordSupplierPayment } from '../../services/purchaseService';
import { formatCurrency } from '../../utils/format';
import { getErrorMessage } from '../../utils/errors';

export function SupplierPaymentModal({ purchaseId, balance, onClose, onSaved }: { purchaseId:string; balance:number; onClose:()=>void; onSaved:()=>void }) {
  const [amount,setAmount]=useState(balance); const [method,setMethod]=useState('Cash'); const [reference,setReference]=useState(''); const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false); const [error,setError]=useState<string|null>(null);
  const save=async()=>{if(amount<=0||amount>balance){setError(`Payment must be between 0 and ${formatCurrency(balance)}.`);return;} setSaving(true);setError(null);try{await recordSupplierPayment(purchaseId,amount,method,reference,notes);onSaved();}catch(e){setError(getErrorMessage(e,'Payment failed.'));}finally{setSaving(false);}};
  return <Modal title="Record supplier payment" onClose={onClose}>{error&&<div className="mb-4"><Alert message={error}/></div>}<div className="space-y-4"><p className="text-sm text-dashboard-text-sub">Outstanding: <strong className="text-dashboard-text-primary">{formatCurrency(balance)}</strong></p><Input label="Amount" type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/><Select label="Payment method" value={method} onChange={e=>setMethod(e.target.value)}>{['Cash','Card','Bank Transfer','Cheque','Other'].map(x=><option key={x}>{x}</option>)}</Select><Input label="Reference number" value={reference} onChange={e=>setReference(e.target.value)}/><Textarea label="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/><div className="flex justify-end gap-3"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={save}>{saving?'Saving…':'Record payment'}</Button></div></div></Modal>;
}
