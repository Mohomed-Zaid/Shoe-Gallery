export interface BarcodePrintSettings {
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
  barcodeHeight?: number;
}

export function buildPrintStyles(settings: BarcodePrintSettings = {}) {
  const x = settings.horizontalOffsetMm ?? 0;
  const y = settings.verticalOffsetMm ?? 0;
  const barcodeHeightMm = Math.min((settings.barcodeHeight ?? 35) * 0.2646, 10);

  return `
    @media print {
      @page {
        size: 50mm 30mm;
        margin: 0;
      }

      html,
      body {
        width: 50mm !important;
        height: 30mm !important;
        min-width: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
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
        position: fixed !important;
        left: 0 !important;
        top: 0 !important;
        width: 50mm !important;
        height: 30mm !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        background: white !important;
        transform: translate(${x}mm, ${y}mm) !important;
        transform-origin: top left !important;
      }

      .barcode-label-print-item {
        width: 50mm !important;
        height: 30mm !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }

      .barcode-label {
        width: 50mm !important;
        height: 30mm !important;
        margin: 0 !important;
        padding: 2mm !important;
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
        width: 44mm !important;
        max-width: 44mm !important;
        height: ${barcodeHeightMm}mm !important;
        max-height: 10mm !important;
        flex: none !important;
      }

      .barcode-label-number {
        margin-top: 0.7mm !important;
        color: black !important;
        font: 600 2.7mm/1 ui-monospace, monospace !important;
        letter-spacing: 0.15mm !important;
        text-align: center !important;
        white-space: nowrap !important;
      }

      .barcode-label-price {
        margin-top: 1.4mm !important;
        color: black !important;
        font: 700 3.7mm/1 Arial, sans-serif !important;
        text-align: center !important;
        white-space: nowrap !important;
      }
    }
  `;
}
