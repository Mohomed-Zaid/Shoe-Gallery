import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import receiptCss from '../styles/thermal-receipt.css?raw';

interface ReceiptPrintOptions { orientation?:'portrait'|'landscape' }

export function printReceipt(receipt:ReactNode,{orientation='landscape'}:ReceiptPrintOptions={}) {
  const printWindow=window.open('','thermal-receipt-print','popup,width=480,height=720');
  if(!printWindow)throw new Error('Pop-up blocked. Allow pop-ups to print the receipt.');
  const documentCss=`
    @page { margin: 0; }
    html,
    body,
    .thermal-receipt {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
    }
    html,
    body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    body {
      display: block !important;
      width: fit-content !important;
    }
    .thermal-receipt {
      position: static !important;
      margin: 0 !important;
      padding-top: 2mm !important;
      box-shadow: none !important;
    }
  `;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html data-receipt-orientation="${orientation}"><head><meta charset="utf-8"><title>Receipt</title><style>${receiptCss}\n${documentCss}</style></head><body>${renderToStaticMarkup(receipt)}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener('afterprint',()=>printWindow.close(),{once:true});
  printWindow.focus();
  window.setTimeout(()=>printWindow.print(),100);
}
