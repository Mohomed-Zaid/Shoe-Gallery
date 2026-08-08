import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { formatCurrency } from '../../utils/format';

export interface BarcodeLabelProps {
  barcodeNumber: string | null;
  sellingPrice: number;
  className?: string;
  productName?: string | null;
  showProductName?: boolean;
  barcodeWidth?: number;
  barcodeHeight?: number;
}

export function BarcodeLabel({ barcodeNumber, sellingPrice, productName, showProductName=false, barcodeWidth=1.35, barcodeHeight=38, className = '' }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !barcodeNumber) return;
    svgRef.current.innerHTML = '';
    JsBarcode(svgRef.current, barcodeNumber, {
      format: 'CODE128',
      width: barcodeWidth,
      height: barcodeHeight,
      margin: 0,
      displayValue: false,
      background: '#ffffff',
      lineColor: '#000000',
    });
  }, [barcodeHeight, barcodeNumber, barcodeWidth]);

  return (
    <div className={`barcode-label ${className}`}>
      {showProductName&&productName&&<div className="barcode-label-name">{productName}</div>}
      <svg ref={svgRef} className="barcode-svg" style={{ width:'44mm',maxWidth:'44mm',height:`${Math.min(barcodeHeight*.2646,10)}mm` }} />
      <div className="barcode-label-number">
        {barcodeNumber || '—'}
      </div>
      <div className="barcode-label-price">
        {formatCurrency(sellingPrice)}
      </div>
    </div>
  );
}
