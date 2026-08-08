export interface BarcodePrintSettings {
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
  barcodeHeight?: number;
}

export function buildPrintStyles(settings: BarcodePrintSettings = {}) {
  const x = settings.horizontalOffsetMm ?? 0;
  const y = settings.verticalOffsetMm ?? 0;
  const barcodeHeightMm = Math.min((settings.barcodeHeight ?? 30) * 0.2646, 10);

  return `
    @media print {
      @page {
        size: 30mm 20mm;
        margin: 0;
      }

      html,
      body {
        width: 30mm !important;
        height: 20mm !important;
        min-width: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: white !important;
      }

      body * {
        visibility: hidden !important;
      }

      .barcode-print-root,
      .barcode-print-root * {
        visibility: visible !important;
      }

      .barcode-print-root {
        width: 30mm !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: white !important;
        transform: translate(${x}mm, ${y}mm) !important;
        transform-origin: top left !important;
      }

      .barcode-label-print-item {
        width: 30mm !important;
        height: 20mm !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        break-after: page !important;
        page-break-after: always !important;
      }

      .barcode-label-print-item:last-child {
        break-after: auto !important;
        page-break-after: auto !important;
      }

      .barcode-label {
        width: 30mm !important;
        height: 20mm !important;
        margin: 0 !important;
        padding: 1mm !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        background: white !important;
        color: black !important;
      }

      .barcode-svg {
        display: block !important;
        width: auto !important;
        max-width: 27mm !important;
        height: ${barcodeHeightMm}mm !important;
        max-height: 10mm !important;
        flex: none !important;
      }

      .barcode-label-number {
        margin-top: 0.7mm !important;
        color: black !important;
        max-width: 28mm !important;
        overflow: hidden !important;
        font: 600 2.4mm/1 ui-monospace, monospace !important;
        letter-spacing: 0.05mm !important;
        text-align: center !important;
        white-space: nowrap !important;
      }

      .barcode-label-number--long { font-size: 1.8mm !important; letter-spacing: 0 !important; }
    }
  `;
}
