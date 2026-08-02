import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard, Minus, Package2, Plus, Printer, Search, Trash2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { Category, Customer, Product, ProductVariant } from '../types';
import type { CartItem } from '../services/salesService';
import * as categoryService from '../services/categoryService';
import * as customerService from '../services/customerService';
import * as productService from '../services/productService';
import * as salesService from '../services/salesService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import {
  Alert,
  Button,
  Input,
  LoadingSpinner,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui';

interface ProductWithCategory extends Product {
  category: Category | null;
}

interface VariantWithProduct extends ProductVariant {
  product: ProductWithCategory;
}

interface CustomerFormValues {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

interface InstantBillingFormValues {
  product_name: string;
  selling_price: number;
  quantity: number;
  discount: number;
  notes: string;
}

interface HeldSaleWithCustomer {
  id: string;
  customer_id?: string | null;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  discount_amount: number;
  grand_total: number;
  notes: string | null;
  cart_data: CartItem[];
}

export function POS() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductWithCategory[]>([]);
  const [variants, setVariants] = useState<VariantWithProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [heldSales, setHeldSales] = useState<HeldSaleWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductWithCategory | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [amountReceived, setAmountReceived] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'credit'>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [saleNotes, setSaleNotes] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showHeldSalesModal, setShowHeldSalesModal] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [activeHeldSaleId, setActiveHeldSaleId] = useState<string | null>(null);
  const [showInstantBillingModal, setShowInstantBillingModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CustomerFormValues>();
  const instantBillingForm = useForm<InstantBillingFormValues>({
    defaultValues: { quantity: 1, discount: 0 }
  });
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [productsResult, variantsResult, categoriesResult, customersResult, heldSalesResult] = await Promise.all([
      productService.getProductsWithRelations(),
      productService.getAllProductVariants(),
      categoryService.getCategories(),
      customerService.getCustomers({ page: 1, pageSize: 100 }),
      salesService.getHeldSales(),
    ]);

    if (productsResult.error || variantsResult.error || categoriesResult.error || customersResult.error || heldSalesResult.error) {
      setError(getErrorMessage(productsResult.error ?? variantsResult.error ?? categoriesResult.error ?? customersResult.error ?? heldSalesResult.error));
    } else {
      setProducts((productsResult.data as ProductWithCategory[]) ?? []);
      setVariants((variantsResult.data as VariantWithProduct[]) ?? []);
      setCategories((categoriesResult.data as Category[]) ?? []);
      setCustomers((customersResult.data as Customer[]) ?? []);
      setHeldSales((heldSalesResult.data as HeldSaleWithCustomer[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const focusBarcodeInput = useCallback(() => {
    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  }, []);

  useEffect(() => {
    focusBarcodeInput();
  }, [focusBarcodeInput]);

  const variantsByProduct = useMemo(() => {
    return variants.reduce<Record<string, VariantWithProduct[]>>((acc, variant) => {
      acc[variant.product_id] = acc[variant.product_id] ? [...acc[variant.product_id], variant] : [variant];
      return acc;
    }, {});
  }, [variants]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = search.toLowerCase();
      const matchesSearch =
        product.name.toLowerCase().includes(query) ||
        product.code.toLowerCase().includes(query);
      const matchesCategory = !categoryFilter || product.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const lineDiscountTotal = cart.reduce((sum, item) => sum + item.discount_amount, 0);
  const maximumCartDiscount = Math.max(subtotal - lineDiscountTotal, 0);
  const grandTotal = subtotal - lineDiscountTotal - cartDiscount;
  const changeDue = paymentMethod === 'cash' ? Math.max(amountReceived - grandTotal, 0) : 0;

  const playScanSuccessSound = () => {
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    } catch {
      // Ignore browser audio issues.
    }
  };

  const addVariantToCart = (variant: VariantWithProduct) => {
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.variant_id === variant.id);
      if (existingItem) {
        return currentCart.map((item) =>
          item.variant_id === variant.id
            ? { ...item, quantity: Math.min(item.quantity + 1, variant.stock_quantity) }
            : item
        );
      }

      return [
        ...currentCart,
        {
          variant_id: variant.id,
          quantity: 1,
          unit_price: Number(variant.selling_price),
          discount_amount: 0,
          product_name: variant.product.name,
          size: variant.size,
          color: variant.color,
        },
      ];
    });
    setSelectedProduct(null);
    focusBarcodeInput();
  };

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    const trimmedBarcode = barcode.trim();
    if (!trimmedBarcode) return;

    setError(null);
    const { data, error: barcodeError } = await productService.getVariantByBarcode(trimmedBarcode);

    if (barcodeError) {
      setError(getErrorMessage(barcodeError));
      focusBarcodeInput();
      return;
    }

    if (!data) {
      setError('Barcode not found.');
      focusBarcodeInput();
      return;
    }

    const matchedVariant = variants.find((variant) => variant.id === data.id) ?? null;
    if (!matchedVariant) {
      setError('Barcode not found.');
      focusBarcodeInput();
      return;
    }

    addVariantToCart(matchedVariant);
    playScanSuccessSound();
    setBarcodeInput('');
  }, [focusBarcodeInput, variants]);

  const updateCartQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((currentCart) => currentCart.filter((item) => item.variant_id !== variantId));
      return;
    }
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.variant_id === variantId) {
          if (item.is_instant_sale) {
            return { ...item, quantity };
          }
          const stock = variants.find((variant) => variant.id === variantId)?.stock_quantity ?? 0;
          return { ...item, quantity: Math.min(quantity, stock) };
        }
        return item;
      })
    );
  };

  const updateItemDiscount = (variantId: string, discountAmount: number) => {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.variant_id === variantId
          ? { ...item, discount_amount: Math.min(Math.max(discountAmount, 0), item.unit_price * item.quantity) }
          : item
      )
    );
  };

  const clearCart = useCallback(() => {
    setCart([]);
    setCartDiscount(0);
    setAmountReceived(0);
    setSaleNotes('');
    setSelectedCustomerId('walk-in');
    setPaymentMethod('cash');
    setActiveHeldSaleId(null);
    focusBarcodeInput();
  }, [focusBarcodeInput]);

  const handleInstantBillingSubmit = (values: InstantBillingFormValues) => {
    setCart((currentCart) => [
      ...currentCart,
      {
        variant_id: `instant-${Date.now()}`,
        quantity: Number(values.quantity),
        unit_price: Number(values.selling_price),
        discount_amount: Number(values.discount || 0),
        product_name: values.product_name,
        size: '-',
        color: '-',
        is_instant_sale: true,
      },
    ]);
    setShowInstantBillingModal(false);
    instantBillingForm.reset();
    focusBarcodeInput();
  };

  const handleHoldSale = async () => {
    if (cart.length === 0) {
      setError('Add items before holding a sale.');
      return;
    }

    const { error: holdError } = await salesService.createHeldSale({
      customer_id: selectedCustomerId === 'walk-in' ? null : selectedCustomerId,
      customer_name: selectedCustomer?.name ?? 'Walk-in Customer',
      payment_method: paymentMethod,
      subtotal,
      discount_amount: cartDiscount,
      grand_total: grandTotal,
      notes: saleNotes,
      cart_data: cart,
    });

    if (holdError) {
      setError(getErrorMessage(holdError));
      return;
    }

    clearCart();
    fetchData();
  };

  const handleResumeHeldSale = (heldSale: HeldSaleWithCustomer) => {
    setCart(heldSale.cart_data);
    setCartDiscount(Number(heldSale.discount_amount ?? 0));
    setPaymentMethod((heldSale.payment_method as 'cash' | 'card' | 'bank_transfer' | 'credit') ?? 'cash');
    setSelectedCustomerId(heldSale.customer_id || 'walk-in');
    setSaleNotes(heldSale.notes ?? '');
    setActiveHeldSaleId(heldSale.id);
    setShowHeldSalesModal(false);
  };

  const openInvoicePrint = useCallback((saleId: string) => {
    const existingFrame = document.getElementById('invoice-print-frame');
    if (existingFrame) {
      existingFrame.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'invoice-print-frame';
    iframe.src = `/sales/${saleId}?print=1`;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    iframe.onload = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 60000);
    };

    document.body.appendChild(iframe);
  }, []);

  const handleCompleteSale = useCallback(async () => {
    if (cart.length === 0) {
      setError('Add at least one item to complete the sale.');
      return;
    }

    if (cartDiscount < 0 || cartDiscount > maximumCartDiscount || grandTotal < 0) {
      setError('The overall discount cannot exceed the sale amount.');
      return;
    }

    if (paymentMethod === 'cash' && amountReceived < grandTotal) {
      setError('Amount received must be equal to or greater than the total.');
      return;
    }

    try {
      setError(null);
      const sale = await salesService.createSale({
        customer_id: selectedCustomerId === 'walk-in' ? null : selectedCustomerId,
        payment_method: paymentMethod,
        items: cart,
        discount_amount: cartDiscount,
        paid_amount: paymentMethod === 'cash' ? amountReceived : paymentMethod === 'credit' ? 0 : grandTotal,
        notes: saleNotes || undefined,
      });

      if (activeHeldSaleId) {
        await salesService.deleteHeldSale(activeHeldSaleId);
      }

      setLastSaleId(sale.id);
      clearCart();
      navigate(`/sales/${sale.id}?print=1`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [activeHeldSaleId, amountReceived, cart, cartDiscount, clearCart, grandTotal, maximumCartDiscount, navigate, paymentMethod, saleNotes, selectedCustomerId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        void handleCompleteSale();
      }

      if (event.key === 'Escape') {
        setSelectedProduct(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCompleteSale]);

  const handlePrintInvoice = () => {
    if (!lastSaleId) return;
    openInvoicePrint(lastSaleId);
  };

  const handleCreateCustomer = async (values: CustomerFormValues) => {
    const { data, error: createError } = await customerService.createCustomer({
      name: values.name,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      notes: values.notes || null,
    });

    if (createError || !data) {
      setError(getErrorMessage(createError));
      return;
    }

    setCustomers((current) => [data as Customer, ...current]);
    setSelectedCustomerId((data as Customer).id);
    setShowCustomerModal(false);
    reset();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Point Of Sale"
        description="Fast checkout with customer selection, held sales, and inventory sync."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleHoldSale}>
              Hold Sale
            </Button>
            <Button variant="secondary" onClick={() => setShowHeldSalesModal(true)}>
              Resume Held Sale
            </Button>
            <Button variant="secondary" onClick={() => setShowInstantBillingModal(true)}>
              <Zap size={16} />
              Instant Billing
            </Button>
            <Button variant="outline" onClick={clearCart}>
              Clear Cart
            </Button>
            <Button variant="secondary" onClick={handlePrintInvoice} disabled={!lastSaleId}>
              <Printer size={16} />
              Print Invoice
            </Button>
          </div>
        }
      />

      {error && <Alert message={error} />}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="glass-card p-5">
            <div className="relative z-10 grid gap-4 md:grid-cols-[1fr_220px]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-dashboard-text-label">Barcode Scanner</label>
                <div className="relative">
                  <Input
                    ref={barcodeInputRef}
                    value={barcodeInput}
                    onChange={(event) => setBarcodeInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleBarcodeScan(barcodeInput);
                      }
                    }}
                    placeholder="Scan barcode or type and press Enter"
                    className="pl-10"
                  />
                  <Search className="pointer-events-none absolute left-3 top-[calc(50%+2px)] -translate-y-1/2 text-dashboard-text-sub" size={16} />
                </div>
                <p className="text-xs text-dashboard-text-sub">The scanner input stays active so checkout remains fast.</p>
              </div>
              <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16} />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products by code or name"
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const productVariants = variantsByProduct[product.id] ?? [];
              const totalStock = productVariants.reduce((sum, item) => sum + item.stock_quantity, 0);
              const startPrice = Math.min(...productVariants.map((item) => Number(item.selling_price)));

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedProduct(product)}
                  className="glass-card-hover p-5 text-left"
                >
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dashboard-accent/20 text-dashboard-text-primary">
                      <Package2 size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-dashboard-text-primary">{product.name}</p>
                      <p className="mt-1 text-xs text-dashboard-text-sub">{product.code} • {product.category?.name || 'Uncategorized'}</p>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-medium text-dashboard-text-primary">{Number.isFinite(startPrice) ? formatCurrency(startPrice) : '-'}</span>
                        <span className={`rounded-full px-2 py-1 text-xs ${totalStock > 0 ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
                          {totalStock} in stock
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="glass-card p-10 text-center text-dashboard-text-sub">
              No products match the current filters.
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="relative z-10 space-y-5">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-dashboard-text-primary">Shopping Cart</h3>
              <Select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                <option value="walk-in">Walk-in Customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowCustomerModal(true)}>
                  <Plus size={16} />
                  Add New Customer
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => selectedCustomer && navigate(`/customers/${selectedCustomer.id}`)}
                  disabled={!selectedCustomer}
                >
                  View Profile
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-dashboard-text-sub">
                  Add products to begin the sale.
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.variant_id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-dashboard-text-primary">{item.product_name}</p>
                          {item.is_instant_sale && (
                            <span className="rounded-full bg-dashboard-accent/20 px-2 py-0.5 text-[10px] font-medium text-dashboard-accent">
                              Instant
                            </span>
                          )}
                        </div>
                        {!item.is_instant_sale && (
                          <p className="text-xs text-dashboard-text-sub">{item.size} / {item.color}</p>
                        )}
                      </div>
                      <button type="button" onClick={() => updateCartQuantity(item.variant_id, 0)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[auto_1fr_120px]">
                      <div className="flex items-center gap-2">
                        <button type="button" className="rounded-lg border border-white/10 p-2 text-dashboard-text-primary" onClick={() => updateCartQuantity(item.variant_id, item.quantity - 1)}>
                          <Minus size={14} />
                        </button>
                        <span className="min-w-8 text-center text-dashboard-text-primary">{item.quantity}</span>
                        <button type="button" className="rounded-lg border border-white/10 p-2 text-dashboard-text-primary" onClick={() => updateCartQuantity(item.variant_id, item.quantity + 1)}>
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="text-sm text-dashboard-text-sub">
                        Unit Price: <span className="text-dashboard-text-primary">{formatCurrency(item.unit_price)}</span>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.discount_amount}
                        onChange={(event) => updateItemDiscount(item.variant_id, Number(event.target.value))}
                        placeholder="Discount"
                      />
                    </div>

                    <div className="mt-3 flex justify-between text-sm">
                      <span className="text-dashboard-text-sub">Line Total</span>
                      <span className="font-medium text-dashboard-text-primary">
                        {formatCurrency(item.unit_price * item.quantity - item.discount_amount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-3 border-t border-white/10 pt-5">
              <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'card' | 'bank_transfer' | 'credit')}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit">Credit</option>
              </Select>
              {paymentMethod === 'cash' && (
                <Input
                  label="Amount Received"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountReceived}
                  onChange={(event) => setAmountReceived(Math.max(Number(event.target.value), 0))}
                  placeholder="Enter cash received"
                />
              )}
              <Textarea rows={2} placeholder="Sale notes" value={saleNotes} onChange={(event) => setSaleNotes(event.target.value)} />
              <Input
                label="Overall Sale Discount"
                type="number"
                min="0"
                max={maximumCartDiscount}
                step="0.01"
                value={cartDiscount}
                onChange={(event) => setCartDiscount(Math.min(Math.max(Number(event.target.value), 0), maximumCartDiscount))}
                placeholder="Enter discount amount"
              />

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-dashboard-text-sub">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-dashboard-text-sub">
                  <span>Discount</span>
                  <span>{formatCurrency(lineDiscountTotal + cartDiscount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-3 text-base font-semibold text-dashboard-text-primary">
                  <span>Grand Total</span>
                  <span>{formatCurrency(grandTotal)}</span>
                </div>
                {paymentMethod === 'cash' && (
                  <>
                    <div className="flex items-center justify-between text-dashboard-text-sub">
                      <span>Amount Received</span>
                      <span>{formatCurrency(amountReceived)}</span>
                    </div>
                    <div className="flex items-center justify-between font-semibold text-dashboard-accent">
                      <span>Change Due</span>
                      <span>{formatCurrency(changeDue)}</span>
                    </div>
                  </>
                )}
              </div>

              <Button className="w-full" onClick={() => void handleCompleteSale()} disabled={cart.length === 0}>
                <CreditCard size={16} />
                Complete Sale
              </Button>
            </div>
          </div>
        </div>
      </div>

      {selectedProduct && (
        <Modal title={`Select Variant - ${selectedProduct.name}`} onClose={() => setSelectedProduct(null)} size="lg">
          <div className="grid gap-3 sm:grid-cols-2">
            {(variantsByProduct[selectedProduct.id] ?? []).map((variant) => (
              <button
                key={variant.id}
                type="button"
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-dashboard-accent/40 hover:bg-dashboard-accent/10"
                onClick={() => addVariantToCart(variant)}
                disabled={variant.stock_quantity <= 0}
              >
                <p className="font-medium text-dashboard-text-primary">{variant.product.code} - {variant.size} / {variant.color}</p>
                <p className="mt-1 text-sm text-dashboard-text-sub">{formatCurrency(Number(variant.selling_price))}</p>
                <p className="mt-2 text-xs text-dashboard-text-sub">{variant.stock_quantity} in stock</p>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {showCustomerModal && (
        <Modal title="Add New Customer" onClose={() => setShowCustomerModal(false)}>
          <form onSubmit={handleSubmit(handleCreateCustomer)} className="space-y-4">
            <Input label="Name" error={errors.name?.message} {...register('name', { required: 'Name is required' })} />
            <Input label="Phone" {...register('phone')} />
            <Input label="Email" type="email" {...register('email')} />
            <Textarea label="Address" rows={3} {...register('address')} />
            <Textarea label="Notes" rows={3} {...register('notes')} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCustomerModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Create Customer'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {showHeldSalesModal && (
        <Modal title="Resume Held Sale" onClose={() => setShowHeldSalesModal(false)} size="lg">
          <div className="space-y-3">
            {heldSales.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-dashboard-text-sub">
                No held sales available.
              </div>
            ) : (
              heldSales.map((heldSale) => (
                <div key={heldSale.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div>
                    <p className="font-medium text-dashboard-text-primary">{heldSale.customer_name || 'Walk-in Customer'}</p>
                    <p className="text-xs text-dashboard-text-sub">
                      {heldSale.cart_data.length} items • {formatCurrency(Number(heldSale.grand_total))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => handleResumeHeldSale(heldSale)}>
                      Resume
                    </Button>
                    <Button variant="danger" onClick={async () => {
                      await salesService.deleteHeldSale(heldSale.id);
                      fetchData();
                    }}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {showInstantBillingModal && (
        <Modal title="Instant Billing" onClose={() => setShowInstantBillingModal(false)}>
          <form onSubmit={instantBillingForm.handleSubmit(handleInstantBillingSubmit)} className="space-y-4">
            <Input label="Product Name" error={instantBillingForm.formState.errors.product_name?.message} {...instantBillingForm.register('product_name', { required: 'Product Name is required' })} />
            <div className="grid gap-4 md:grid-cols-2">
              <Input type="number" step="0.01" label="Selling Price" error={instantBillingForm.formState.errors.selling_price?.message} {...instantBillingForm.register('selling_price', { required: 'Price is required', min: 0 })} />
              <Input type="number" label="Quantity" error={instantBillingForm.formState.errors.quantity?.message} {...instantBillingForm.register('quantity', { required: 'Quantity is required', min: 1 })} />
            </div>
            <Input type="number" step="0.01" label="Discount" error={instantBillingForm.formState.errors.discount?.message} {...instantBillingForm.register('discount', { min: 0 })} />
            <Textarea label="Notes" rows={2} {...instantBillingForm.register('notes')} />
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowInstantBillingModal(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={instantBillingForm.formState.isSubmitting}>
                Add to Cart
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
