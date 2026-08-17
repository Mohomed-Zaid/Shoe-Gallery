import { RotateCcw, Search } from 'lucide-react';
import { Button, Input, Select } from '../ui';
import type { InventoryReportFilters as Filters, InventoryReportOptions } from '../../types/inventoryReport';

export function InventoryReportFilters({ value, options, onChange, onApply, onReset }: { value: Filters; options: InventoryReportOptions; onChange: (value: Filters) => void; onApply: () => void; onReset: () => void }) {
  const set = (key: keyof Filters, next: string) => onChange({ ...value, [key]: next });
  return <section className="glass-card p-4 print-hidden"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <Input label="Search" placeholder="Search product, article, barcode..." value={value.search} onChange={(event) => set('search', event.target.value)} />
    <Select label="Category" value={value.categoryId} onChange={(event) => set('categoryId', event.target.value)}><option value="">All categories</option>{options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
    <Select label="Brand" value={value.brandId} onChange={(event) => set('brandId', event.target.value)}><option value="">All brands</option>{options.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
    <Select label="Stock Status" value={value.stockStatus} onChange={(event) => set('stockStatus', event.target.value)}><option value="">All</option><option value="in_stock">In Stock</option><option value="low_stock">Low Stock</option><option value="out_of_stock">Out of Stock</option></Select>
    <div className="flex items-end gap-2"><Button className="flex-1" onClick={onApply}><Search size={16} />Run report</Button><Button variant="secondary" onClick={onReset} title="Clear filters"><RotateCcw size={16} /></Button></div>
  </div></section>;
}
