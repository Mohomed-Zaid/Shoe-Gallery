export type ReceiptPrintStyle = 'normal' | 'dark' | 'extra-dark';
export type ReceiptPrintingMode = 'browser' | 'silent';

const RECEIPT_PRINT_STYLE_KEY = 'shoe-gallery-receipt-print-style';
const RECEIPT_PRINTING_MODE_KEY = 'shoe-gallery-receipt-printing-mode';

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

export function getReceiptPrintingMode(): ReceiptPrintingMode {
  try {
    return window.localStorage.getItem(RECEIPT_PRINTING_MODE_KEY) === 'silent'
      ? 'silent'
      : 'browser';
  } catch {
    return 'browser';
  }
}

export function setReceiptPrintingMode(mode: ReceiptPrintingMode) {
  try {
    window.localStorage.setItem(RECEIPT_PRINTING_MODE_KEY, mode);
  } catch {
    // Browser printing remains available if browser storage is unavailable.
  }
}
