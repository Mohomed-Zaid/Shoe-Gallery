import type { Sale } from '../../types';
import { formatCurrency } from '../../utils/format';

const Row=({label,value}:{label:string;value:string})=><div className="receipt-row"><span>{label}</span><span>{value}</span></div>;
export function ReceiptTotals({sale}:{sale:Sale}) {
  return <section className="receipt-section receipt-totals"><Row label="Subtotal" value={formatCurrency(Number(sale.subtotal))}/>{Number(sale.discount_amount)>0&&<Row label="Discount" value={`-${formatCurrency(Number(sale.discount_amount))}`}/>} {Number(sale.tax_amount)!==0&&<Row label="Tax" value={formatCurrency(Number(sale.tax_amount))}/>}<div className="receipt-grand-total"><Row label="TOTAL" value={formatCurrency(Number(sale.total_amount))}/></div></section>;
}
