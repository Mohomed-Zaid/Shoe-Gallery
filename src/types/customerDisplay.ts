export const CUSTOMER_DISPLAY_CHANNEL = 'shoe-gallery-customer-display';
export const CUSTOMER_DISPLAY_STORAGE_KEY = 'shoe-gallery-customer-display-event';

export interface CustomerDisplayItem {
  productName: string;
  article: string | null;
  size: string;
  colour: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

export interface CustomerDisplaySnapshot {
  storeName: string;
  storeAddress: string | null;
  customerName: string | null;
  items: CustomerDisplayItem[];
  subtotal: number;
  itemDiscount: number;
  saleDiscount: number;
  grandTotal: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'credit';
  amountReceived: number;
  changeDue: number;
}

export interface CustomerDisplaySaleCompleted {
  storeName: string;
  grandTotal: number;
  amountReceived: number;
  changeDue: number;
}
export interface CustomerDisplayReturn {
  productName: string;
  variant: string;
  returnAmount: number;
}

export type CustomerDisplayMessage =
  | { type: 'CUSTOMER_DISPLAY_READY' }
  | { type: 'CUSTOMER_DISPLAY_HEARTBEAT' }
  | { type: 'STATE_UPDATE'; payload: CustomerDisplaySnapshot }
  | { type: 'SALE_COMPLETED'; payload: CustomerDisplaySaleCompleted }
  | { type: 'RETURN_MODE'; payload: CustomerDisplayReturn | null }
  | { type: 'RETURN_CANCELLED' }
  | { type: 'RETURN_COMPLETED'; payload: CustomerDisplayReturn };

export function sendCustomerDisplayFallback(message: CustomerDisplayMessage) {
  try {
    localStorage.setItem(
      CUSTOMER_DISPLAY_STORAGE_KEY,
      JSON.stringify({ message, sentAt: Date.now(), nonce: Math.random() }),
    );
    localStorage.removeItem(CUSTOMER_DISPLAY_STORAGE_KEY);
  } catch {
    // BroadcastChannel remains the primary transport.
  }
}

export function readCustomerDisplayFallback(value: string | null): CustomerDisplayMessage | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { message?: CustomerDisplayMessage };
    return parsed.message ?? null;
  } catch {
    return null;
  }
}
