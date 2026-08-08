import type { Customer, Sale, SaleItem, StoreSettings } from '../../types';
import type { SaleWithRelations } from '../../services/salesService';

export interface ReceiptPayment {
  id?: string;
  payment_method: string;
  amount: number;
}

export interface ReceiptProps {
  sale: Sale | SaleWithRelations;
  items: SaleWithRelations['sale_items'] | SaleItem[];
  payments: ReceiptPayment[];
  customer: Customer | null;
  store: StoreSettings | null;
}
