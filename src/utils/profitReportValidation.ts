import type { ProfitInvoiceRow, ProfitSummary } from '../types/profitReport';
export function validateProfitRows(rows: ProfitInvoiceRow[], summary?: ProfitSummary) { const ids = rows.map(r => r.sale_id); if (ids.length !== new Set(ids).size) {
    if (import.meta.env.DEV)
        console.error('Profit Report contains duplicate sale rows');
    throw new Error('Profit Report returned duplicate invoices.');
} if (summary && import.meta.env.DEV) {
    const tolerance = .05;
    const profit = summary.gross_profit;
        if (profit !== null && Math.abs(profit - (summary.net_revenue - (summary.cogs ?? 0))) > tolerance)
            console.error('Profit Report totals do not reconcile');
        if (summary.net_profit !== null && Math.abs(summary.net_profit - ((summary.gross_product_profit ?? 0) - summary.card_processing_fees)) > tolerance)
            console.error('Profit Report card fee totals do not reconcile');
} }
