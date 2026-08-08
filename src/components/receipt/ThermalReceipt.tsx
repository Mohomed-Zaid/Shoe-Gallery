import { ReceiptFooter } from './ReceiptFooter';
import { ReceiptHeader } from './ReceiptHeader';
import { ReceiptItems } from './ReceiptItems';
import { ReceiptPayments } from './ReceiptPayments';
import { ReceiptTotals } from './ReceiptTotals';
import type { ReceiptProps } from './types';

export function ThermalReceipt({sale,items,payments,customer,store}:ReceiptProps) {
  const created=new Date(sale.created_at);
  return <div className={`thermal-receipt thermal-receipt--${store?.receipt_paper_width_mm===58?'58':'80'}`} role="document"><ReceiptHeader store={store}/><section className="receipt-section receipt-info"><div className="receipt-row"><span>Invoice:</span><span>{sale.invoice_number||sale.id.slice(0,8)}</span></div><div className="receipt-row"><span>Date:</span><span>{created.toLocaleDateString()}</span></div><div className="receipt-row"><span>Time:</span><span>{created.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div><div className="receipt-row"><span>Cashier:</span><span>{'cashier' in sale?(sale.cashier?.full_name||sale.cashier?.email||'Cashier'):'Cashier'}</span></div>{customer&&store?.receipt_show_customer!==false&&<div className="receipt-row"><span>Customer:</span><span>{customer.name}</span></div>}</section><ReceiptItems items={items}/><ReceiptTotals sale={sale}/><ReceiptPayments sale={sale} payments={payments}/><ReceiptFooter store={store}/></div>;
}
