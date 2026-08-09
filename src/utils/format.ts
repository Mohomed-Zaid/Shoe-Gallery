export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
  }).format(value);
}

export function formatBarcodeLabelPrice(value: number): string {
  return `RS. ${new Intl.NumberFormat('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}
