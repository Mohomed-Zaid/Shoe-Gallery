import type { ReturnsReportRow } from '../types/returnsReport';
export function assertUniqueReturnsReportRows(rows:ReturnsReportRow[]){const ids=rows.map(row=>row.return_id);if(ids.length!==new Set(ids).size){if(import.meta.env.DEV)console.error('Returns Report contains duplicate return rows');throw new Error('Returns Report returned duplicate return transactions.')}}
