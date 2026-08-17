import{formatCurrency}from'./format';export const profitMoney=(v:number|null)=>v===null?'Unavailable':formatCurrency(v);export const profitMargin=(v:number)=>`${v.toFixed(2)}%`;
