import type { Sale } from '../../types';
import { formatCurrency } from '../../utils/format';
import type { ReceiptPayment } from './types';

const title=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const Row=({label,value}:{label:string;value:string})=><div className="receipt-row"><span>{label}</span><span>{value}</span></div>;
export function ReceiptPayments({sale,payments}:{sale:Sale;payments:ReceiptPayment[]}) {
  const paid=payments.length>1?payments.reduce((sum,payment)=>sum+Number(payment.amount),0):Number(sale.amount_tendered??sale.paid_amount??0),change=Number(sale.change_due??0),outstanding=Number(sale.balance_due??0);
  return <section className="receipt-section receipt-payments">{payments.length>1?payments.map((payment,index)=><Row key={payment.id||`${payment.payment_method}-${index}`} label={title(payment.payment_method)} value={formatCurrency(Number(payment.amount))}/>):<Row label="Payment Method" value={title(payments[0]?.payment_method||sale.payment_method)}/>}<Row label="Paid" value={formatCurrency(paid)}/>{change>0&&<Row label="Change" value={formatCurrency(change)}/>} {outstanding>0&&<Row label="Outstanding" value={formatCurrency(outstanding)}/>}</section>;
}
