import JsBarcode from 'jsbarcode';

export interface BarcodePrintOptions {
  barcodeNumber: string;
  copies?: number;
  barcodeWidth?: number;
  barcodeHeight?: number;
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
}

function createBarcodeSvg(value:string,widthAdjustment:number,height:number) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const moduleCount=11*(value.length+3)+35;
  const fittedWidth=Math.min(widthAdjustment,Math.max(.45,102/moduleCount));
  try {
    JsBarcode(svg,value,{format:'CODE128',displayValue:false,margin:0,height,width:fittedWidth,background:'#fff',lineColor:'#000'});
  } catch(error) {
    console.error('Barcode generation failed:',error);
    throw new Error('Barcode could not be generated.');
  }
  if(!svg.querySelector('rect,path'))throw new Error('Barcode could not be generated.');
  svg.classList.add('barcode-svg');
  svg.setAttribute('aria-hidden','true');
  return svg.outerHTML;
}

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
}

export function printBarcodeLabels(options:BarcodePrintOptions) {
  const value=options.barcodeNumber.trim();
  if(!value)throw new Error('Barcode could not be generated.');
  const copies=Math.min(100,Math.max(1,Math.floor(options.copies??1)));
  const svgMarkup=createBarcodeSvg(value,Number(options.barcodeWidth??1),Number(options.barcodeHeight??30));
  const numberClass=value.length>13?'barcode-number barcode-number--long':'barcode-number';
  const labels=Array.from({length:copies},()=>`<section class="barcode-page"><div class="barcode-label">${svgMarkup}<div class="${numberClass}">${escapeHtml(value)}</div></div></section>`).join('');

  const printWindow=window.open('','barcode-label-print','popup,width=360,height=300');
  if(!printWindow)throw new Error('Print window was blocked. Please allow popups for this site.');
  const x=Number(options.horizontalOffsetMm??0),y=Number(options.verticalOffsetMm??0);
  const css=`
    @page { size: 30mm 20mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 30mm; margin: 0; padding: 0; background: #fff; }
    body { display: block; }
    .barcode-page { width: 30mm; height: 20mm; margin: 0; padding: 0; overflow: hidden; break-after: page; page-break-after: always; }
    .barcode-page:last-child { break-after: auto; page-break-after: auto; }
    .barcode-label { width: 30mm; height: 20mm; margin: 0; padding: 1mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; color: #000; background: #fff; transform: translate(${x}mm,${y}mm); transform-origin: top left; }
    .barcode-svg { display: block; width: 26mm; max-width: 26mm; height: auto; max-height: 9mm; flex: none; }
    .barcode-number { max-width: 28mm; margin-top: .6mm; overflow: hidden; color: #000; font: 600 2.4mm/1 ui-monospace, monospace; letter-spacing: .05mm; text-align: center; white-space: nowrap; }
    .barcode-number--long { font-size: 1.8mm; letter-spacing: 0; }
    @media print { html, body { width: 30mm !important; margin: 0 !important; padding: 0 !important; } }
  `;

  return new Promise<void>((resolve,reject)=>{
    let printStarted=false;
    let settled=false;
    const fail=(error:unknown)=>{console.error('Barcode print-window error:',error);if(!settled){settled=true;reject(new Error('Unable to open barcode print window.'))}};
    const startPrint=()=>{
      if(printStarted||printWindow.closed)return;
      if(printWindow.document.querySelectorAll('.barcode-svg rect, .barcode-svg path').length===0)return;
      printStarted=true;
      try { printWindow.focus(); printWindow.print(); if(!settled){settled=true;resolve()} }
      catch(error) { printStarted=false; fail(error) }
    };
    printWindow.addEventListener('afterprint',()=>window.setTimeout(()=>printWindow.close(),500),{once:true});
    printWindow.addEventListener('error',event=>fail(event),{once:true});
    printWindow.addEventListener('load',()=>window.setTimeout(startPrint,300),{once:true});
    try {
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode Label</title><style>${css}</style></head><body>${labels}</body></html>`);
      printWindow.document.close();
      window.setTimeout(startPrint,350);
    } catch(error) { fail(error) }
  });
}
