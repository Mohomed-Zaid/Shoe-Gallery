import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import receiptCss from '../styles/thermal-receipt.css?raw';

interface ReceiptPrintOptions { orientation?:'portrait'|'landscape' }

export function printReceipt(receipt:ReactNode,{orientation='landscape'}:ReceiptPrintOptions={}) {
  const printWindow=window.open('','thermal-receipt-print','popup,width=480,height=720');
  if(!printWindow)throw new Error('Pop-up blocked. Allow pop-ups to print the receipt.');
  const landscape=orientation==='landscape';
  const pageRule=landscape?'@page{size:landscape;margin:0}':'@page{margin:0}';
  const layoutRule=landscape?'html,body{width:100%}body>.thermal-receipt{width:100%;max-width:none}':'';
  const documentCss=`${pageRule}html,body{margin:0;padding:0;background:#fff}body{width:${landscape?'100%':'fit-content'}}.thermal-receipt{margin:0;box-shadow:none}${layoutRule}`;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title><style>${receiptCss}\n${documentCss}</style></head><body>${renderToStaticMarkup(receipt)}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener('afterprint',()=>printWindow.close(),{once:true});
  printWindow.focus();
  window.setTimeout(()=>printWindow.print(),100);
}
