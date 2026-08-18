import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, PackageOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as inventoryService from '../services/inventoryService';
import type { InventoryProductSummary } from '../services/inventoryService';
import type { InventoryPriceRange } from '../services/inventoryService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import { Alert, Button, DataTable, Input, LoadingSpinner, PageHeader } from '../components/ui';

function stockStatus(stock: number) {
  if (stock <= 0) return { label: 'Out', className: 'bg-red-500/20 text-red-300' };
  if (stock < 10) return { label: 'Low', className: 'bg-yellow-500/20 text-yellow-300' };
  return { label: 'In Stock', className: 'bg-green-500/20 text-green-300' };
}

function formatCompactPrice(value: number) {
  return formatCurrency(value).replace('LKR', '').trim();
}

function formatPriceRange(range: InventoryPriceRange | null) {
  if (!range) return '-';
  if (range.min === range.max) return formatCompactPrice(range.min);
  return `${formatCompactPrice(range.min)} - ${formatCompactPrice(range.max)}`;
}

export function Inventory() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<InventoryProductSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await inventoryService.getInventoryProducts();
    if (result.error) setError(getErrorMessage(result.error));
    else setProducts(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [product.code, product.item_article, product.item_number, product.name, product.category?.name, product.brand?.name]
        .some((value) => value?.toLowerCase().includes(term))
      || product.product_variants.some((variant) => variant.barcode_number?.toLowerCase().includes(term))
    );
  }, [products, search]);

  return (
    <div className="inventory-page min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <PageHeader
        title="Inventory"
        description="One summary row per product. Open a product to manage its size × colour stock matrix."
      />

      {error && <Alert message={error} />}

      <section className="glass-card p-4">
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-dashboard-accent/15 p-2.5 text-dashboard-accent">
              <PackageOpen size={20} />
            </span>
            <div>
              <p className="font-semibold text-dashboard-text-primary">Product Inventory</p>
              <p className="text-xs text-dashboard-text-sub">{filteredProducts.length} main products</p>
            </div>
          </div>
          <Input
            aria-label="Search inventory products"
            className="sm:max-w-xs"
            placeholder="Search product, article number, or barcode"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          className="inventory-table-wrapper"
          tableClassName="inventory-table"
          fitToWidth
          columns={[
            { key: 'product', header: 'Product', className: 'w-[28%]' },
            { key: 'article', header: 'Article', className: 'w-[10%]' },
            { key: 'variants', header: 'Variants', className: 'w-[9%] text-center' },
            { key: 'stock', header: 'Stock', className: 'w-[9%] text-center' },
            { key: 'cost', header: 'Cost', className: 'w-[13%] text-right' },
            { key: 'price', header: 'Selling Price', className: 'w-[15%] text-right' },
            { key: 'status', header: 'Status', className: 'w-[10%] text-center' },
            { key: 'actions', header: 'Action', className: 'w-[6%] text-center' },
          ]}
          isEmpty={filteredProducts.length === 0}
          emptyMessage={search ? 'No products match your search' : 'No products found'}
        >
          {filteredProducts.map((product) => {
            const status = stockStatus(product.total_stock);
            return (
              <tr
                key={product.id}
                className="cursor-pointer hover:bg-dashboard-hover"
                onClick={() => navigate(`/inventory/${product.id}`)}
              >
                <td className="min-w-0 overflow-hidden px-2 py-2.5">
                  <p className="truncate text-sm font-medium text-dashboard-text-primary" title={product.name}>{product.name}</p>
                  {(product.category?.name || product.brand?.name) && (
                    <p className="mt-0.5 truncate text-xs text-dashboard-text-sub" title={[product.category?.name, product.brand?.name].filter(Boolean).join(' · ')}>
                      {[product.category?.name, product.brand?.name].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </td>
                <td className="min-w-0 truncate px-2 py-2.5 text-sm text-dashboard-text-sub" title={product.item_article || '*'}>
                  {product.item_article || '*'}
                </td>
                <td className="min-w-0 px-2 py-2.5 text-center text-sm text-dashboard-text-sub">{product.product_variants.length}</td>
                <td className="min-w-0 px-2 py-2.5 text-center text-sm font-semibold text-dashboard-text-primary">{product.total_stock}</td>
                <td className="min-w-0 truncate px-2 py-2.5 text-right text-sm tabular-nums text-dashboard-text-sub" title={formatPriceRange(product.cost_price_range)}>
                  {formatPriceRange(product.cost_price_range)}
                </td>
                <td className="min-w-0 truncate px-2 py-2.5 text-right text-sm font-medium tabular-nums text-dashboard-text-primary" title={formatPriceRange(product.selling_price_range)}>
                  {formatPriceRange(product.selling_price_range)}
                </td>
                <td className="min-w-0 px-1.5 py-2.5 text-center">
                  <span className={`inline-flex max-w-full truncate rounded-full px-2 py-1 text-[11px] font-medium ${status.className}`}>{status.label}</span>
                </td>
                <td className="min-w-0 px-1 py-2.5 text-center" onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" variant="ghost" title="Open Inventory Matrix" aria-label={`Open ${product.name} inventory matrix`} className="h-8 w-8 max-w-full p-0" onClick={() => navigate(`/inventory/${product.id}`)}>
                    <FileSpreadsheet size={16} />
                  </Button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
