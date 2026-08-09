import JsBarcode from 'jsbarcode';
import barcodeLabelCss from '../styles/barcode-label-print.css?inline';

export interface BarcodeLabelPrintOptions {
  copies?: number;
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
  barcodeWidth?: number;
  barcodeHeight?: number;
}

const BARCODE_GENERATION_ERROR = 'Barcode could not be generated.';
const PRINT_WINDOW_ERROR = 'Unable to open barcode print window.';
const DEFAULT_BARCODE_HEIGHT = 32;
const DEFAULT_BARCODE_WIDTH_SCALE = 1;
const BARCODE_HEIGHT_OPTIONS: readonly number[] = [24, 28, 32, 36, 40];
let activePrintWindow: Window | null = null;

function finiteNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const number = finiteNumber(value, fallback);
  return Math.min(maximum, Math.max(minimum, number));
}

function normaliseCopies(value: number | undefined) {
  return Math.min(100, Math.max(1, Math.floor(finiteNumber(value, 1))));
}

function getPrintWindowFeatures() {
  const availableWidth = window.screen.availWidth || window.innerWidth || 1200;
  const availableHeight = window.screen.availHeight || window.innerHeight || 900;
  const width = Math.max(320, Math.min(1100, Math.floor(availableWidth * 0.85)));
  const height = Math.max(500, Math.min(800, Math.floor(availableHeight * 0.85)));
  const left = Math.max(0, Math.floor((availableWidth - width) / 2));
  const top = Math.max(0, Math.floor((availableHeight - height) / 2));

  return [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    'width=' + width,
    'height=' + height,
    'left=' + left,
    'top=' + top,
  ].join(',');
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]!,
  );
}

function normaliseBarcodeWidthScale(value: number | undefined) {
  return boundedNumber(value, DEFAULT_BARCODE_WIDTH_SCALE, 0.8, 1);
}

function normaliseBarcodeHeight(value: number | undefined) {
  const height = finiteNumber(value, DEFAULT_BARCODE_HEIGHT);
  return BARCODE_HEIGHT_OPTIONS.includes(height) ? height : DEFAULT_BARCODE_HEIGHT;
}

function generateBarcodeSvg(barcodeNumber: string, height = DEFAULT_BARCODE_HEIGHT) {
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  try {
    JsBarcode(svgElement, barcodeNumber, {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      height,
      width: 1,
    });
  } catch (error) {
    console.error('Barcode generation failed:', error);
    throw new Error(BARCODE_GENERATION_ERROR);
  }

  if (svgElement.querySelectorAll('rect').length < 2) {
    throw new Error(BARCODE_GENERATION_ERROR);
  }

  svgElement.classList.add('barcode-svg');
  svgElement.setAttribute('aria-hidden', 'true');
  return svgElement.outerHTML;
}

function closeWindow(printWindow: Window) {
  try {
    if (!printWindow.closed) printWindow.close();
  } catch {
    // The browser may already be closing the popup.
  } finally {
    if (activePrintWindow === printWindow) activePrintWindow = null;
  }
}

export function validateBarcodeNumber(barcodeNumber: string) {
  const value = barcodeNumber.trim();
  if (!value) throw new Error('Barcode number is required.');
  generateBarcodeSvg(value);
}

export async function printBarcodeLabels(
  barcodeNumber: string,
  options: BarcodeLabelPrintOptions = {},
): Promise<void> {
  const value = barcodeNumber.trim();
  if (!value) throw new Error('Barcode number is required.');

  if (activePrintWindow) {
    try {
      if (!activePrintWindow.closed) {
        activePrintWindow.focus();
        throw new Error('Barcode label printing is already in progress.');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Barcode label printing is already in progress.') {
        throw error;
      }
    }
    activePrintWindow = null;
  }

  // Keep this before barcode generation so it runs directly in the click event.
  let printWindow: Window | null;
  try {
    printWindow = window.open('', '_blank', getPrintWindowFeatures());
  } catch (error) {
    console.error('Barcode print window could not be opened:', error);
    throw new Error(PRINT_WINDOW_ERROR);
  }
  if (!printWindow) {
    throw new Error('Print window was blocked. Please allow popups for this site.');
  }
  activePrintWindow = printWindow;

  let svgMarkup: string;
  try {
    svgMarkup = generateBarcodeSvg(value, normaliseBarcodeHeight(options.barcodeHeight));
  } catch (error) {
    closeWindow(printWindow);
    if (error instanceof Error && error.message === BARCODE_GENERATION_ERROR) throw error;
    throw new Error(BARCODE_GENERATION_ERROR);
  }

  const copies = normaliseCopies(options.copies);
  const escapedNumber = escapeHtml(value);
  const labels = Array.from(
    { length: copies },
    () =>
      `<section class="barcode-page"><div class="barcode-label">${svgMarkup}<div class="barcode-number">${escapedNumber}</div></div></section>`,
  ).join('');
  const horizontalOffset = boundedNumber(options.horizontalOffsetMm, 0, -3, 3);
  const verticalOffset = boundedNumber(options.verticalOffsetMm, 0, -3, 3);
  const barcodeWidthMm = 26 * normaliseBarcodeWidthScale(options.barcodeWidth);
  const popupCss = `
    @page {
      size: 30mm 20mm;
      margin: 0;
    }

    html,
    body {
      width: 30mm;
      height: 20mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: white;
    }

    body {
      display: block;
    }

    .barcode-page {
      width: 30mm;
      height: 20mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
    }

    .barcode-page:last-of-type {
      break-after: auto;
      page-break-after: auto;
    }

    .barcode-page .barcode-label {
      transform: translate(${horizontalOffset}mm, ${verticalOffset}mm);
      transform-origin: top left;
    }

    .barcode-page .barcode-svg {
      width: ${barcodeWidthMm}mm;
      max-width: 26mm;
    }

    .print-controls {
      position: fixed;
      z-index: 10;
      top: 2px;
      left: 2px;
    }

    .print-controls button {
      border: 1px solid #111827;
      border-radius: 4px;
      padding: 4px 8px;
      background: #111827;
      color: white;
      cursor: pointer;
      font: 12px/1.2 sans-serif;
    }

    @media print {
      html,
      body {
        height: auto;
        overflow: visible;
      }

      .print-controls {
        display: none !important;
      }
    }
  `;

  try {
    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>Barcode Label</title><style>${barcodeLabelCss}\n${popupCss}</style></head><body>${labels}<div class="print-controls"><button type="button" onclick="window.print()">Print Now</button></div></body></html>`,
    );
    printWindow.document.close();
  } catch (error) {
    console.error('Barcode print document failed:', error);
    closeWindow(printWindow);
    throw new Error(PRINT_WINDOW_ERROR);
  }

  await new Promise<void>((resolve, reject) => {
    let printStarted = false;
    let printScheduled = false;
    let manualPrintStarted = false;
    let settled = false;

    const fail = (error: unknown) => {
      console.error('Barcode print window failed:', error);
      if (settled) return;
      settled = true;
      closeWindow(printWindow);
      reject(new Error(PRINT_WINDOW_ERROR));
    };

    const startPrint = () => {
      if (printStarted || manualPrintStarted || settled) return;
      if (printWindow.closed) {
        fail(new Error('Print window closed before printing.'));
        return;
      }

      printStarted = true;
      try {
        printWindow.focus();
        printWindow.print();
        if (!settled) {
          settled = true;
          resolve();
        }
      } catch (error) {
        fail(error);
      }
    };

    const schedulePrint = () => {
      if (printScheduled || manualPrintStarted || settled) return;
      printScheduled = true;
      window.setTimeout(startPrint, 300);
    };

    try {
      printWindow.onafterprint = () => closeWindow(printWindow);
      printWindow.addEventListener('error', (event) => fail(event), { once: true });
      printWindow.document.querySelector<HTMLButtonElement>('.print-controls button')
        ?.addEventListener(
          'click',
          () => {
            manualPrintStarted = true;
            if (!settled) {
              settled = true;
              resolve();
            }
          },
          { capture: true },
        );

      if (printWindow.document.readyState === 'complete') {
        schedulePrint();
      } else {
        printWindow.addEventListener('load', schedulePrint, { once: true });
      }
    } catch (error) {
      fail(error);
    }
  });
}
