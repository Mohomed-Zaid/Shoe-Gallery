import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export interface BarcodeLabelProps {
  barcodeNumber: string | null;
  className?: string;
  barcodeWidth?: number;
  barcodeHeight?: number;
}

export function BarcodeLabel({ barcodeNumber, barcodeWidth=1, barcodeHeight=30, className = '' }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const value=barcodeNumber||'';
  const moduleCount=11*(value.length+3)+35;
  const fittedWidth=Math.min(barcodeWidth,Math.max(.45,102/moduleCount));

  useEffect(() => {
    if (!svgRef.current || !barcodeNumber) return;
    svgRef.current.innerHTML = '';
    JsBarcode(svgRef.current, barcodeNumber, {
      format: 'CODE128',
      width: fittedWidth,
      height: barcodeHeight,
      margin: 0,
      displayValue: false,
      background: '#ffffff',
      lineColor: '#000000',
    });
  }, [barcodeHeight, barcodeNumber, fittedWidth]);

  return (
    <div className={`barcode-label ${className}`}>
      <svg ref={svgRef} className="barcode-svg" />
      <div className={`barcode-label-number${value.length>13?' barcode-label-number--long':''}`}>
        {barcodeNumber || '—'}
      </div>
    </div>
  );
}
