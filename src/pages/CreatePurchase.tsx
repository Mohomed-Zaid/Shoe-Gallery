import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Search } from 'lucide-react';
import type { Supplier, ProductVariant, Product } from '../types';
import * as purchaseService from '../services/purchaseService';
import * as supplierService from '../services/supplierService';
import * as productService from '../services/productService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import {
  Alert,
  Button,
  Input,
  LoadingSpinner,
  PageHeader,
  Select,
  Textarea,
  DataTable,
} from '../components/ui';

interface PurchaseItem {
  id?: string;
  variant_id: string;
  quantity: number;
  cost_price: number;
  mrp: number;
  description?: string;
  expiry_date?: string;
  remarks?: string;
}

interface VariantWithProduct extends ProductVariant {
  product: Product;
}

export function CreatePurchase() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<VariantWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form fields
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [refNo, setRefNo] = useState<string>('');
  const [purchaseType, setPurchaseType] = useState<string>('Purchase');
  const [paymentType, setPaymentType] = useState<string>('Cash');

  // Item form
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemCost, setItemCost] = useState<number>(0);
  const [itemMrp, setItemMrp] = useState<number>(0);
  const [itemDescription, setItemDescription] = useState<string>('');
  const [itemExpiryDate, setItemExpiryDate] = useState<string>('');
  const [itemRemarks, setItemRemarks] = useState<string>('');

  // Added items
  const [items, setItems] = useState<PurchaseItem[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [suppliersRes, variantsRes] = await Promise.all([
        supplierService.getSuppliers(),
        productService.getAllProductVariants(),
      ]);

      if (suppliersRes.error) throw suppliersRes.error;
      if (variantsRes.error) throw variantsRes.error;

      setSuppliers((suppliersRes.data as Supplier[]) ?? []);
      setVariants((variantsRes.data as VariantWithProduct[]) ?? []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter variants based on search query
  const filteredVariants = variants.filter(v => 
    v.product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.product.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getVariant = (variantId: string) => {
    return variants.find(v => v.id === variantId);
  };

  // When variant is selected, populate cost and mrp
  const handleVariantSelect = (variantId: string) => {
    setSelectedVariant(variantId);
    const variant = getVariant(variantId);
    if (variant) {
      setItemCost(variant.cost_price);
      setItemMrp(variant.selling_price);
    }
  };

  // Add item to items list
  const addItem = () => {
    if (!selectedVariant || itemQty <= 0) return;
    const newItem: PurchaseItem = {
      id: Date.now().toString(),
      variant_id: selectedVariant,
      quantity: itemQty,
      cost_price: itemCost,
      mrp: itemMrp,
      description: itemDescription,
      expiry_date: itemExpiryDate,
      remarks: itemRemarks
    };
    setItems([...items, newItem]);
    // Reset item form
    setSelectedVariant('');
    setItemQty(1);
    setItemCost(0);
    setItemMrp(0);
    setItemDescription('');
    setItemExpiryDate('');
    setItemRemarks('');
  };

  // Remove item from items list
  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  // Calculate totals
  const totalItems = items.length;
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await purchaseService.createPurchase({
        supplier_id: selectedSupplier || null,
        payment_status: paymentType === 'Cash' ? 'paid' : 'unpaid', // Map to existing field for now
        items: items.map(item => ({
          variant_id: item.variant_id,
          quantity: item.quantity,
          cost_price: item.cost_price
        })),
      });
      navigate('/purchases');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Purchase"
        description="Record a new purchase"
        action={
          <Button variant="secondary" onClick={() => navigate('/purchases')}>
            <ArrowLeft size={18} />
            Back
          </Button>
        }
      />

      {error && <Alert message={error} />}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column - Form */}
        <div className="lg:col-span-3 space-y-6">
          {/* Purchase Details */}
          <div className="glass-card p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">SELECT VENDOR</label>
                <Select
                  value={selectedSupplier}
                  onChange={(e) => setSelectedSupplier(e.target.value)}
                >
                  <option value="">Please select vendor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">Date</label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">REF NO</label>
                <Input
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  placeholder="PUR-0010"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">TYPE</label>
                <Select
                  value={purchaseType}
                  onChange={(e) => setPurchaseType(e.target.value)}
                >
                  <option value="Purchase">Purchase</option>
                  <option value="Return">Return</option>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dashboard-text-primary mb-2">PAYMENT TYPE</label>
              <Select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit">Credit</option>
              </Select>
            </div>
          </div>

          {/* Product Search & Item Form */}
          <div className="glass-card p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dashboard-text-primary mb-2">PRODUCT SEARCH</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dashboard-text-sub" size={18} />
                <Input
                  placeholder="Search by code or name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">PRODUCT</label>
                <Select
                  value={selectedVariant}
                  onChange={(e) => handleVariantSelect(e.target.value)}
                >
                  <option value="">Select Product</option>
                  {filteredVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.product.name} - {v.size} / {v.color}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">QTY</label>
                <Input
                  type="number"
                  min="0"
                  value={itemQty}
                  onChange={(e) => setItemQty(parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">COST</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemCost}
                  onChange={(e) => setItemCost(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">MRP</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemMrp}
                  onChange={(e) => setItemMrp(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={addItem}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dashboard-text-primary mb-2">DESCRIPTION</label>
                <Textarea
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  rows={1}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dashboard-text-primary mb-2">EXP DATE</label>
                  <Input
                    type="date"
                    value={itemExpiryDate}
                    onChange={(e) => setItemExpiryDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dashboard-text-primary mb-2">REMARKS</label>
                  <Textarea
                    value={itemRemarks}
                    onChange={(e) => setItemRemarks(e.target.value)}
                    rows={1}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="glass-card p-6 space-y-4">
            <DataTable
              columns={[
                { key: 'product', header: 'PRODUCT' },
                { key: 'qty', header: 'QTY' },
                { key: 'cost', header: 'COST' },
                { key: 'mrp', header: 'MRP' },
                { key: 'profit', header: 'PROFIT %' },
                { key: 'total', header: 'TOTAL' },
                { key: 'description', header: 'DESCRIPTION' },
                { key: 'exp', header: 'EXP' },
                { key: 'remarks', header: 'REMARKS' },
                { key: 'actions', header: '', className: 'text-right' }
              ]}
              isEmpty={items.length === 0}
              emptyMessage="Add items to this purchase."
            >
              {items.map((item) => {
                const variant = getVariant(item.variant_id);
                const profitPercent = item.mrp > 0 ? (((item.mrp - item.cost_price) / item.mrp) * 100).toFixed(1) : '0';
                const itemTotal = item.quantity * item.cost_price;
                return (
                  <tr key={item.id} className="hover:bg-dashboard-hover">
                    <td className="px-6 py-4 text-sm font-medium text-dashboard-text-primary">
                      {variant?.product.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {formatCurrency(item.cost_price)}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {formatCurrency(item.mrp)}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {profitPercent}%
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {formatCurrency(itemTotal)}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {item.description || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {item.expiry_date || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-dashboard-text-sub">
                      {item.remarks || '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id!)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={isSubmitting || items.length === 0}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m-4 8h10a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Save Purchase
              </Button>
            </div>
          </div>
        </div>

        {/* Right Column - Summary */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6 space-y-6 sticky top-6">
            <div>
              <h3 className="text-lg font-semibold text-dashboard-text-primary mb-4">Summary</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-dashboard-text-sub">Total Items</span>
                  <span className="font-semibold text-dashboard-text-primary">{totalItems}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-dashboard-text-sub">Total Quantity</span>
                  <span className="font-semibold text-dashboard-text-primary">{totalQuantity}</span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-white/10">
                  <span className="text-dashboard-text-primary font-semibold">Purchase</span>
                  <span className="font-bold text-xl text-dashboard-text-primary">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-dashboard-text-sub">Saving a purchase will increase product stock.</p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
