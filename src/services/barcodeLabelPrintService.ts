import JsBarcode from 'jsbarcode';
import barcodeLabelCss from '../styles/barcode-label-print.css?inline';
import { formatBarcodeLabelPrice } from '../utils/format';
import { encodeCostPrice } from '../utils/costCode';
import { getColourShortName } from '../utils/colour';

export interface BarcodeLabelPrintOptions {
  copies?: number;
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
  barcodeWidth?: number;
  barcodeHeight?: number;
  articleNumber?: string;
  colour?: string;
  size?: string;
  sellingPrice?: number;
  costPrice?: number | string;
  density?: BarcodePrintDensity;
}

export interface BarcodeLabelBatchItem {
  barcodeNumber: string;
  articleNumber?: string;
  colour?: string;
  size?: string;
  sellingPrice?: number | null;
  costPrice?: number | string | null;
  copies?: number;
}

export type BarcodeLabelBatchOptions = Pick<
  BarcodeLabelPrintOptions,
  | 'horizontalOffsetMm'
  | 'verticalOffsetMm'
  | 'barcodeWidth'
  | 'barcodeHeight'
  | 'density'
>;

export type BarcodePrintDensity = 'normal' | 'dark' | 'extra-dark';

interface BarcodeGenerationOptions {
  density?: BarcodePrintDensity;
  height?: number;
  widthScale?: number;
}

const BARCODE_GENERATION_ERROR = 'Barcode could not be generated.';
const PRINT_WINDOW_ERROR = 'Unable to open barcode print window.';
const DEFAULT_BARCODE_HEIGHT = 36;
const DEFAULT_BARCODE_WIDTH_SCALE = 1;
const BARCODE_HEIGHT_OPTIONS: readonly number[] = [24, 28, 32, 36, 40];
const BARCODE_DENSITY_KEY = 'shoe-gallery-barcode-print-density';
const BARCODE_MAX_WIDTH_PX = 104;
const BARCODE_MIN_WIDTH_PX = 83;
const DENSITY_BAR_WIDTH: Record<BarcodePrintDensity, number> = {
  normal: 1.3,
  dark: 1.5,
  'extra-dark': 1.6,
};
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

function isBarcodePrintDensity(value: string | null): value is BarcodePrintDensity {
  return value === 'normal' || value === 'dark' || value === 'extra-dark';
}

export function getBarcodePrintDensity(): BarcodePrintDensity {
  try {
    const savedDensity = window.localStorage.getItem(BARCODE_DENSITY_KEY);
    return isBarcodePrintDensity(savedDensity) ? savedDensity : 'dark';
  } catch {
    return 'dark';
  }
}

export function setBarcodePrintDensity(density: BarcodePrintDensity) {
  try {
    window.localStorage.setItem(BARCODE_DENSITY_KEY, density);
  } catch {
    // Printing still works with the default when browser storage is unavailable.
  }
}

export function generateBarcode(
  svgElement: SVGSVGElement,
  barcodeNumber: string,
  options: BarcodeGenerationOptions = {},
) {
  const density = options.density ?? 'dark';
  const height = normaliseBarcodeHeight(options.height);
  const widthScale = normaliseBarcodeWidthScale(options.widthScale);
  const preferredBarWidth = DENSITY_BAR_WIDTH[density];

  // Measure CODE128 at one unit, then generate it directly at the final physical width.
  // This avoids producing a large SVG and shrinking away thin thermal-printer bars in CSS.
  svgElement.innerHTML = '';
  JsBarcode(svgElement, barcodeNumber, {
    format: 'CODE128',
    displayValue: false,
    margin: 0,
    background: '#ffffff',
    lineColor: '#000000',
    width: 1,
    height,
  });
  const unitWidth = Number(svgElement.getAttribute('width'));
  const targetWidth = BARCODE_MIN_WIDTH_PX +
    (BARCODE_MAX_WIDTH_PX - BARCODE_MIN_WIDTH_PX) * widthScale;
  const fittedBarWidth = Number.isFinite(unitWidth) && unitWidth > 0
    ? Math.min(preferredBarWidth, targetWidth / unitWidth)
    : preferredBarWidth;

  try {
    JsBarcode(svgElement, barcodeNumber, {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      height,
      background: '#ffffff',
      lineColor: '#000000',
      width: fittedBarWidth,
    });
  } catch (error) {
    console.error('Barcode generation failed:', error);
    throw new Error(BARCODE_GENERATION_ERROR);
  }

  if (svgElement.querySelectorAll('rect').length < 2) {
    throw new Error(BARCODE_GENERATION_ERROR);
  }

  if (import.meta.env.DEV) {
    const barRectangles = Array.from(svgElement.querySelectorAll<SVGRectElement>('g rect'));
    console.debug('Barcode SVG geometry', {
      width: svgElement.getAttribute('width'),
      height: svgElement.getAttribute('height'),
      viewBox: svgElement.getAttribute('viewBox'),
      barCount: barRectangles.length,
      sampleBarWidths: barRectangles.slice(0, 8).map((rect) => rect.getAttribute('width')),
    });
  }

  svgElement.classList.add('barcode-svg');
  svgElement.setAttribute('aria-hidden', 'true');
  svgElement.setAttribute('shape-rendering', 'crispEdges');
}

function generateBarcodeSvg(barcodeNumber: string, options: BarcodeGenerationOptions = {}) {
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  generateBarcode(svgElement, barcodeNumber, options);
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
  const sellingPrice = Number(options.sellingPrice);
  if (!Number.isFinite(sellingPrice)) throw new Error('Selling price is required.');

  return printBarcodeLabelBatch(
    [{
      barcodeNumber: value,
      articleNumber: options.articleNumber,
      colour: options.colour,
      size: options.size,
      sellingPrice,
      costPrice: options.costPrice,
      copies: options.copies,
    }],
    options,
  );
}

export async function printBarcodeLabelBatch(
  items: BarcodeLabelBatchItem[],
  options: BarcodeLabelBatchOptions = {},
): Promise<void> {
  if (items.length === 0) throw new Error('Select at least one barcode to print.');
  const normalisedItems = items.map((item) => ({
    ...item,
    barcodeNumber: item.barcodeNumber.trim(),
  }));
  if (normalisedItems.some((item) => !item.barcodeNumber)) {
    throw new Error('Barcode number is required.');
  }

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

  const density = options.density ?? getBarcodePrintDensity();
  let labels: string;
  try {
    labels = normalisedItems.map((item) => {
      const svgMarkup = generateBarcodeSvg(item.barcodeNumber, {
        density,
        height: options.barcodeHeight,
        widthScale: options.barcodeWidth,
      });
      const escapedNumber = escapeHtml(item.barcodeNumber);
      const escapedArticleNumber = escapeHtml(item.articleNumber?.trim() || '');
      const escapedColour = escapeHtml(getColourShortName(item.colour));
      const escapedSize = escapeHtml(item.size?.trim() || '');
      const headingMarkup = `<span class="barcode-heading-article">${escapedArticleNumber}</span><span>${escapedColour}</span><span>${escapedSize}</span>`;
      const hasSellingPrice = typeof item.sellingPrice === 'number' && Number.isFinite(item.sellingPrice);
      const escapedSellingPrice = hasSellingPrice
        ? escapeHtml(formatBarcodeLabelPrice(item.sellingPrice as number))
        : '-';
      const costCode = item.costPrice == null ? '' : encodeCostPrice(item.costPrice);
      const escapedCostCode = escapeHtml(costCode);
      const costCodeMarkup = escapedCostCode
        ? `<span class="barcode-cost-code">${escapedCostCode}</span>`
        : '';
      const labelMarkup = `<section class="barcode-page"><div class="barcode-label barcode-density-${density}"><div class="barcode-label-header">${headingMarkup}</div><div class="barcode-label-body"><div class="barcode-label-main"><div class="barcode-svg-wrapper">${svgMarkup}</div><div class="barcode-meta-row"><span class="barcode-number">${escapedNumber}</span>${costCodeMarkup}</div><div class="barcode-label-price">${escapedSellingPrice}</div></div></div></div></section>`;

      return Array.from({ length: normaliseCopies(item.copies) }, () => labelMarkup).join('');
    }).join('');
  } catch (error) {
    closeWindow(printWindow);
    if (error instanceof Error && error.message === BARCODE_GENERATION_ERROR) throw error;
    throw new Error(BARCODE_GENERATION_ERROR);
  }

  const horizontalOffset = boundedNumber(options.horizontalOffsetMm, 0, -3, 3);
  const verticalOffset = boundedNumber(options.verticalOffsetMm, 0, -3, 3);
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
