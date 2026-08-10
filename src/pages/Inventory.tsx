import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, FileSpreadsheet, PackageOpen, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as inventoryService from '../services/inventoryService';
import * as productService from '../services/productService';
import type { InventoryProductSummary } from '../services/inventoryService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import { Alert, Button, DataTable, Input, LoadingSpinner, PageHeader } from '../components/ui';

function stockStatus(stock: number) {
  if (stock <= 0) return { label: 'Out of Stock', className: 'bg-red-500/20 text-red-300' };
  if (stock < 10) return { label: 'Low Stock', className: 'bg-yellow-500/20 text-yellow-300' };
  return { label: 'In Stock', className: 'bg-green-500/20 text-green-300' };
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
      [product.item_number, product.code, product.name, product.item_article, product.category?.name, product.brand?.name]
        .some((value) => value?.toLowerCase().includes(term))
      || product.product_variants.some((variant) => variant.barcode_number?.toLowerCase().includes(term))
    );
  }, [products, search]);

  const handleDelete = async (product: InventoryProductSummary) => {
    if (!confirm(`Delete ${product.name}? This also removes its variants and inventory matrix.`)) return;
    const result = await productService.deleteProduct(product.id);
    if (result.error) {
      setError(getErrorMessage(result.error));
      return;
    }
    void fetchInventory();
  };

  return (
    <div className="space-y-6">
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
            placeholder="Search product, code, article, or barcode"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <DataTable
          columns={[
            { key: 'code', header: 'Code' },
            { key: 'product', header: 'Product' },
            { key: 'article', header: 'Article' },
            { key: 'category', header: 'Category' },
            { key: 'brand', header: 'Brand' },
            { key: 'cost', header: 'Cost Price' },
            { key: 'price', header: 'Selling Price' },
            { key: 'stock', header: 'Total Stock' },
            { key: 'value', header: 'Stock Value' },
            { key: 'status', header: 'Status' },
            { key: 'actions', header: 'Actions', className: 'text-right' },
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
                <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-dashboard-text-primary xl:px-6">
                  {product.item_number || product.code}
                </td>
                <td className="min-w-48 px-4 py-4 xl:px-6">
                  <p className="text-sm font-medium text-dashboard-text-primary">{product.name}</p>
                  <p className="max-w-56 truncate text-xs text-dashboard-text-sub">{product.description || '—'}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-dashboard-text-sub xl:px-6">{product.item_article || '-'}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-dashboard-text-sub xl:px-6">{product.category?.name || '—'}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-dashboard-text-sub xl:px-6">{product.brand?.name || '—'}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-dashboard-text-sub xl:px-6">{formatCurrency(product.base_cost_price)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-dashboard-text-primary xl:px-6">{formatCurrency(product.base_selling_price)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-dashboard-text-primary xl:px-6">{product.total_stock}</td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-dashboard-text-primary xl:px-6">{formatCurrency(product.stock_value)}</td>
                <td className="whitespace-nowrap px-4 py-4 xl:px-6">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right xl:px-6" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" title="Open Inventory Matrix" onClick={() => navigate(`/inventory/${product.id}`)}>
                      <FileSpreadsheet size={17} />
                      <span className="hidden 2xl:inline">Open Matrix</span>
                    </Button>
                    <Button size="sm" variant="ghost" title="View Product Details" onClick={() => navigate(`/products/${product.id}`)}>
                      <Eye size={17} />
                    </Button>
                    <Button size="sm" variant="ghost" title="Delete Product" className="text-red-400 hover:text-red-300" onClick={() => void handleDelete(product)}>
                      <Trash2 size={17} />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
