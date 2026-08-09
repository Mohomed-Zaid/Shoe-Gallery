import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import receiptCss from '../styles/thermal-receipt.css?raw';

interface ReceiptPrintOptions {
  orientation?: 'portrait' | 'landscape';
}

function getPrintWindowFeatures() {
  const availableWidth = window.screen.availWidth || window.innerWidth;
  const availableHeight = window.screen.availHeight || window.innerHeight;
  const width = Math.max(800, Math.floor(availableWidth * 0.9));
  const height = Math.max(700, Math.floor(availableHeight * 0.9));
  const left = Math.max(0, Math.floor((availableWidth - width) / 2));
  const top = Math.max(0, Math.floor((availableHeight - height) / 2));

  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

function completePrint(printWindow: Window) {
  printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 100);
}

export function printReceipt(
  receipt: ReactNode,
  { orientation = 'landscape' }: ReceiptPrintOptions = {},
) {
  const printWindow = window.open('', 'thermal-receipt-print', getPrintWindowFeatures());
  if (!printWindow) throw new Error('Pop-up blocked. Allow pop-ups to print the receipt.');

  const documentCss = `
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
      width: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: #fff !important;
    }
    body {
      display: block !important;
    }
    .thermal-receipt,
    .thermal-receipt * {
      box-sizing: border-box !important;
    }
    .thermal-receipt {
      position: static !important;
      width: var(--receipt-printable-width, 72mm) !important;
      max-width: var(--receipt-printable-width, 72mm) !important;
      margin: 0 !important;
      padding: var(--receipt-top-padding, 2mm) var(--receipt-right-padding, 3mm)
        var(--receipt-bottom-padding, 2mm) var(--receipt-left-padding, 2mm) !important;
      overflow: hidden !important;
      transform: translateX(var(--receipt-horizontal-offset, 0mm));
      transform-origin: top left;
      box-shadow: none !important;
    }
  `;

  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html data-receipt-orientation="${orientation}"><head><meta charset="utf-8"><title>Receipt</title><style>${receiptCss}\n${documentCss}</style></head><body>${renderToStaticMarkup(receipt)}</body></html>`,
  );
  printWindow.document.close();
  completePrint(printWindow);
}

export function printReceiptWidthTest() {
  const printWindow = window.open('', 'thermal-receipt-width-test', getPrintWindowFeatures());
  if (!printWindow) throw new Error('Pop-up blocked. Allow pop-ups to print the width test.');

  const widths = [68, 70, 72, 74, 76];
  const boundaryLines = widths.map((width) => `
    <section class="width-test">
      <strong>${width}mm</strong>
      <div class="boundary" style="width:${width}mm">
        <span>|LEFT</span><span>RIGHT|</span>
      </div>
    </section>
  `).join('');

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt Width Test</title>
        <style>
          @page { margin: 0; }
          html, body { width: auto; margin: 0; padding: 0; background: #fff; }
          body { padding: 2mm 0; font-family: "Courier New", Courier, monospace; font-size: 10px; line-height: 1.25; }
          *, *::before, *::after { box-sizing: border-box; color: #000; }
          h1 { width: 68mm; margin: 0 0 3mm; text-align: center; font-size: 13px; }
          p { width: 68mm; margin: 0 0 3mm; text-align: center; white-space: normal; }
          .width-test { margin: 0 0 3mm; break-inside: avoid; }
          .width-test strong { display: block; margin: 0 0 1mm; }
          .boundary { display: flex; justify-content: space-between; border-block: 1px dashed #000; padding: 1mm 0; white-space: nowrap; }
        </style>
      </head>
      <body>
        <h1>PRINT WIDTH TEST</h1>
        <p>Choose the widest line where both LEFT and RIGHT boundaries print completely.</p>
        ${boundaryLines}
      </body>
    </html>`);
  printWindow.document.close();
  completePrint(printWindow);
}
