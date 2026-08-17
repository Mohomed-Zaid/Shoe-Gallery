import type{CashupRow}from'../types/cashupReport';export const cashupStatusLabel=(r:Pick<CashupRow,'status'|'difference_status'>)=>r.status==='open'?'OPEN':r.difference_status.toUpperCase();
