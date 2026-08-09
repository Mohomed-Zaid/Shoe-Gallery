import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import receiptCss from '../styles/thermal-receipt.css?raw';
import { getReceiptPrintStyle } from './receiptPrintStyle';

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
  const printStyle = getReceiptPrintStyle();

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
      margin: 0 0 0 var(--receipt-horizontal-offset, 0mm) !important;
      padding: var(--receipt-top-padding, 2mm) var(--receipt-right-padding, 3mm)
        1mm var(--receipt-left-padding, 2mm) !important;
      overflow: hidden !important;
      background: #fff !important;
      color: #000 !important;
      opacity: 1 !important;
      text-shadow: none !important;
      box-shadow: none !important;
      filter: none !important;
      transform: none !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt-footer {
      margin-bottom: 2mm !important;
    }
  `;

  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html data-receipt-orientation="${orientation}"><head><meta charset="utf-8"><title>Receipt</title><style>${receiptCss}\n${documentCss}</style></head><body class="receipt-document-${printStyle}">${renderToStaticMarkup(receipt)}</body></html>`,
  );
  printWindow.document.close();
  completePrint(printWindow);
}

export function printReceiptQualityTest() {
  const printWindow = window.open('', 'thermal-receipt-quality-test', getPrintWindowFeatures());
  if (!printWindow) throw new Error('Pop-up blocked. Allow pop-ups to print the quality test.');

  const testLines = `
    <p>NORMAL TEXT</p>
    <p class="bold">BOLD TEXT</p>
    <p class="extra-bold">EXTRA BOLD TEXT</p>
    <p>1234567890</p>
    <p>LKR 1,500.00</p>
    <p>LKR 25,000.00</p>
    <p>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
  `;
  const styles = [
    { name: 'NORMAL', className: 'normal' },
    { name: 'DARK', className: 'dark' },
    { name: 'EXTRA DARK', className: 'extra-dark' },
  ];
  const tests = styles.map(({ name, className }) => `
    <section class="quality-test quality-test--${className}">
      <h2>${name}</h2>
      ${testLines}
    </section>
  `).join('');

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt Print Quality Test</title>
        <style>
          @page { margin: 0; }
          html, body {
            width: auto;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible;
            background: #fff !important;
          }
          body {
            width: 68mm;
            padding: 2mm 2mm 1mm !important;
            color: #000 !important;
            font-family: Arial, Helvetica, "Arial Black", sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          *, *::before, *::after {
            box-sizing: border-box;
            color: #000 !important;
            opacity: 1 !important;
            text-shadow: none !important;
            box-shadow: none !important;
            filter: none !important;
          }
          h1 { margin: 0 0 2mm; text-align: center; font-size: 16px; font-weight: 900; }
          h2 { margin: 0 0 1mm; font-size: 14px; font-weight: 900; }
          p { margin: 0.6mm 0; overflow-wrap: anywhere; }
          .quality-test { padding: 2mm 0; border-top: 1px dashed #000; break-inside: avoid; }
          .quality-test--normal { font-size: 11px; font-weight: 500; }
          .quality-test--dark { font-size: 11px; font-weight: 600; }
          .quality-test--extra-dark { font-size: 12px; font-weight: 700; }
          .bold { font-weight: 700; }
          .extra-bold { font-weight: 900; }
        </style>
      </head>
      <body>
        <h1>PRINT QUALITY TEST</h1>
        ${tests}
      </body>
    </html>`);
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
