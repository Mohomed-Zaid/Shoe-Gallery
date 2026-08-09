import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import '../../styles/barcode-label-print.css';

export interface BarcodeLabelProps {
  barcodeNumber: string;
}

export function BarcodeLabel({ barcodeNumber }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    svgElement.innerHTML = '';
    try {
      JsBarcode(svgElement, barcodeNumber, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        height: 32,
        width: 1,
      });
    } catch (error) {
      console.error('Barcode generation failed:', error);
    }
  }, [barcodeNumber]);

  return (
    <div className="barcode-label">
      <svg ref={svgRef} className="barcode-svg" />
      <div className="barcode-number">{barcodeNumber}</div>
    </div>
  );
}
