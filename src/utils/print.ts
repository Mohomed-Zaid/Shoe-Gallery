export interface PrintLabelOptions {
  documentTitle?: string;
}

export function buildPrintStyles() {
  return `
    @page {
      size: A4;
      margin: 10mm;
    }

    @media print {
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }

      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body * {
        visibility: hidden;
      }

      .barcode-label-print-area,
      .barcode-label-print-area * {
        visibility: visible;
      }

      .barcode-label-print-area {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        gap: 3mm;
        align-content: flex-start;
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .barcode-label-print-item {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  `;
}
