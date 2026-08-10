export type UserRole = 'admin' | 'cashier';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  code: string;
  item_number?: string;
  is_active?: boolean;
  name: string;
  category_id: string | null;
  brand_id: string | null;
  description: string | null;
  image_url: string | null;
  base_cost_price?: number | null;
  base_selling_price?: number | null;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  color: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  barcode_number: string | null;
  is_active?: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  outstanding_balance: number;
  created_at: string;
}

export interface Purchase {
  id: string;
  supplier_id: string | null;
  purchase_date: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  variant_id: string | null;
  quantity: number;
  cost_price: number;
}

export interface Sale {
  id: string;
  customer_id: string | null;
  user_id: string | null;
  invoice_number: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  card_payment_fee: number;
  total_amount: number;
  paid_amount: number;
  amount_tendered: number | null;
  change_due: number;
  balance_due: number;
  payment_method: string;
  status: 'held' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  variant_id: string | null;
  quantity: number;
  selling_price: number;
  cost_price: number | null;
  discount_amount: number;
  line_total: number;
  product_name_snapshot: string | null;
  size_snapshot: string | null;
  color_snapshot: string | null;
  product_name: string | null;
  is_instant_sale: boolean;
}

export interface InventoryHistory {
  id: string;
  variant_id: string;
  change_type: 'add' | 'remove' | 'purchase' | 'sale';
  quantity_changed: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string | null;
  user_id: string | null;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  purchase_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

export interface Return {
  id: string;
  sale_id: string;
  customer_id: string | null;
  return_type: string;
  refund_amount: number;
  store_credit_amount: number;
  created_by: string | null;
  created_at: string;
}

export interface ReturnItem {
  id: string;
  return_id: string;
  variant_id: string | null;
  quantity: number;
  reason: string | null;
}

export interface StoreSettings {
  id: string;
  store_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  receipt_footer: string | null;
  currency_code: string;
  tax_percentage: number;
  invoice_prefix: string;
  default_low_stock_limit: number;
  receipt_printing?: 'ask' | 'automatic' | 'none';
  barcode_label_width_mm?: number; barcode_label_height_mm?: number;
  barcode_horizontal_offset_mm?: number; barcode_vertical_offset_mm?: number;
  barcode_width?: number; barcode_height?: number;
  receipt_paper_width_mm?: 58|80; receipt_printable_width_mm?:number; receipt_left_padding_mm?:number; receipt_right_padding_mm?:number; receipt_top_padding_mm?:number; receipt_bottom_padding_mm?:number; receipt_font_size_px?:number; receipt_horizontal_offset_mm?:number;
  receipt_orientation?:'portrait'|'landscape';
  receipt_show_logo?:boolean; receipt_show_customer?:boolean; receipt_show_barcode?:boolean; receipt_show_return_policy?:boolean;
  created_at: string;
  updated_at: string;
}

export interface HeldSale {
  id: string;
  user_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  discount_amount: number;
  grand_total: number;
  notes: string | null;
  cart_data: unknown[];
  created_at: string;
  updated_at: string;
}
