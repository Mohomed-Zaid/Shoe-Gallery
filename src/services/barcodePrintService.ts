import barcodeCss from '../styles/barcode-print.css?raw';

export interface BarcodePrintOptions {
  forceCustomPageSize?: boolean;
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
}

const failureMessage='Barcode printing failed. Please check:\n1. Barcode printer is connected.\n2. Correct printer is selected.\n3. Printer driver has 30mm × 20mm label size.\n4. Printer is online and has labels loaded.';

export function printBarcodeLabels(root:HTMLElement|null,options:BarcodePrintOptions={}) {
  if(!root)throw new Error('Barcode could not be generated.');
  const labels=Array.from(root.querySelectorAll<HTMLElement>('.barcode-label'));
  const svgs=Array.from(root.querySelectorAll<SVGSVGElement>('.barcode-svg'));
  if(!labels.length||svgs.length!==labels.length||svgs.some(svg=>svg.dataset.barcodeError==='true'||!svg.querySelector('rect,path')))throw new Error('Barcode could not be generated.');
  if(svgs.some((svg,index)=>svg.getBoundingClientRect().width>labels[index].getBoundingClientRect().width))throw new Error('Barcode could not be generated.');

  const printWindow=window.open('','barcode-label-print','popup,width=360,height=300');
  if(!printWindow)throw new Error(`${failureMessage}\n\nPop-up blocked by the browser.`);
  const x=Number(options.horizontalOffsetMm??0),y=Number(options.verticalOffsetMm??0);
  const pageSize=options.forceCustomPageSize?'size:30mm 20mm;':'';
  const printCss=`
    @page{${pageSize}margin:0}
    html,body{margin:0!important;padding:0!important;background:#fff!important}
    body{display:block!important;width:30mm!important}
    .barcode-print-root{width:30mm!important;margin:0!important;padding:0!important;transform:translate(${x}mm,${y}mm);transform-origin:top left}
    .barcode-label-print-item{width:30mm!important;height:20mm!important;margin:0!important;padding:0!important;overflow:hidden!important;box-sizing:border-box!important;break-after:page;page-break-after:always}
    .barcode-label-print-item:last-child{break-after:auto;page-break-after:auto}
    .barcode-label{width:30mm!important;height:20mm!important;margin:0!important;padding:1mm!important;box-sizing:border-box!important;overflow:hidden!important}
    .barcode-svg{display:block!important;width:auto!important;max-width:27mm!important;max-height:10mm!important}
  `;

  return new Promise<void>((resolve,reject)=>{
    const fail=(error:unknown)=>{console.error('Barcode print error:',error);try{printWindow.close()}catch{ /* window may already be unavailable */ }reject(new Error(failureMessage));};
    printWindow.addEventListener('error',event=>fail(event),{once:true});
    printWindow.addEventListener('afterprint',()=>window.setTimeout(()=>printWindow.close(),500),{once:true});
    printWindow.addEventListener('load',()=>{
      window.setTimeout(()=>{
        try{
          const readySvgs=printWindow.document.querySelectorAll('.barcode-svg rect, .barcode-svg path');
          if(!readySvgs.length){fail(new Error('Barcode SVG missing from print window.'));return;}
          printWindow.focus();
          printWindow.print();
          resolve();
        }catch(error){fail(error)}
      },250);
    },{once:true});
    try{
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode Labels</title><style>${barcodeCss}\n${printCss}</style></head><body>${root.outerHTML}</body></html>`);
      printWindow.document.close();
    }catch(error){fail(error)}
  });
}
