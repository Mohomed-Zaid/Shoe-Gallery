import { useEffect, useRef } from 'react';
import {
  generateBarcode,
  getBarcodePrintDensity,
  type BarcodePrintDensity,
} from '../../services/barcodeLabelPrintService';
import '../../styles/barcode-label-print.css';
import { formatBarcodeLabelPrice } from '../../utils/format';
import { encodeCostPrice } from '../../utils/costCode';

export interface BarcodeLabelProps {
  barcodeNumber: string;
  articleNumber?: string;
  storeName?: string;
  sellingPrice: number;
  costPrice?: number | string;
  density?: BarcodePrintDensity;
}

export function BarcodeLabel({
  barcodeNumber,
  articleNumber,
  storeName = 'SHOE GALLERY',
  sellingPrice,
  costPrice,
  density = getBarcodePrintDensity(),
}: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const costCode = costPrice == null ? '' : encodeCostPrice(costPrice);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    try {
      generateBarcode(svgElement, barcodeNumber, { density });
    } catch (error) {
      console.error('Barcode generation failed:', error);
    }
  }, [barcodeNumber, density]);

  return (
    <div className={`barcode-label barcode-density-${density}`}>
      <div className="barcode-label-header">
        <span className="barcode-store-name">{storeName.trim() || 'SHOE GALLERY'}</span>
        {articleNumber && <span className="barcode-article-number">Article: {articleNumber}</span>}
      </div>
      <div className="barcode-label-body">
        <div className="barcode-label-main">
          <div className="barcode-svg-wrapper">
            <svg ref={svgRef} className="barcode-svg" aria-hidden="true" />
          </div>
          <div className="barcode-meta-row">
            <span className="barcode-number">{barcodeNumber}</span>
            {costCode && <span className="barcode-cost-code">{costCode}</span>}
          </div>
          <div className="barcode-label-price">{formatBarcodeLabelPrice(sellingPrice)}</div>
        </div>
      </div>
    </div>
  );
}
