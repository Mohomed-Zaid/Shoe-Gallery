export type ReceiptPrintStyle = 'normal' | 'dark' | 'extra-dark';

const RECEIPT_PRINT_STYLE_KEY = 'shoe-gallery-receipt-print-style';

function isReceiptPrintStyle(value: string | null): value is ReceiptPrintStyle {
  return value === 'normal' || value === 'dark' || value === 'extra-dark';
}

export function getReceiptPrintStyle(): ReceiptPrintStyle {
  try {
    const savedStyle = window.localStorage.getItem(RECEIPT_PRINT_STYLE_KEY);
    return isReceiptPrintStyle(savedStyle) ? savedStyle : 'dark';
  } catch {
    return 'dark';
  }
}

export function setReceiptPrintStyle(style: ReceiptPrintStyle) {
  try {
    window.localStorage.setItem(RECEIPT_PRINT_STYLE_KEY, style);
  } catch {
    // The default dark style remains active if browser storage is unavailable.
  }
}
