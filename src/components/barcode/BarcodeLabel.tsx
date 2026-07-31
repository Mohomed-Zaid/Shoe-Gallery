import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { formatCurrency } from '../../utils/format';

export interface BarcodeLabelProps {
  barcodeNumber: string | null;
  sellingPrice: number;
  className?: string;
}

export function BarcodeLabel({ barcodeNumber, sellingPrice, className = '' }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !barcodeNumber) return;
    svgRef.current.innerHTML = '';
    JsBarcode(svgRef.current, barcodeNumber, {
      format: 'CODE128',
      width: 1.5,
      height: 35,
      margin: 0,
      displayValue: false,
      background: '#ffffff',
      lineColor: '#000000',
    });
  }, [barcodeNumber]);

  return (
    <div className={`flex h-[30mm] w-[50mm] flex-col items-center justify-center bg-white overflow-hidden ${className}`}>
      <svg ref={svgRef} style={{ width: '35mm', height: '12mm' }} />
      <div className="mt-[1mm] text-[3mm] font-semibold tracking-wider text-black leading-none">
        {barcodeNumber || '—'}
      </div>
      <div className="mt-[2mm] text-[4mm] font-bold text-black leading-none">
        {formatCurrency(sellingPrice)}
      </div>
    </div>
  );
}
