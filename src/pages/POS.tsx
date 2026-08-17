import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CreditCard, LayoutGrid, Minus, Monitor, Package2, Plus, Printer, ScanLine, Search, Trash2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { Category, Customer, Product, ProductVariant, StoreSettings } from '../types';
import type { CartItem, SaleWithRelations } from '../services/salesService';
import * as categoryService from '../services/categoryService';
import * as customerService from '../services/customerService';
import * as productService from '../services/productService';
import * as salesService from '../services/salesService';
import * as settingsService from '../services/settingsService';
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
import { POSItemNumberInput } from '../components/pos/POSItemNumberInput';
import { ProductVariantSelector } from '../components/pos/ProductVariantSelector';
import type { POSProduct } from '../services/productService';
import { ThermalReceipt } from '../components/receipt/ThermalReceipt';
import { printReceiptAutomatically } from '../services/receiptPrintService';
import {
  CUSTOMER_DISPLAY_CHANNEL,
  CUSTOMER_DISPLAY_STORAGE_KEY,
  readCustomerDisplayFallback,
  sendCustomerDisplayFallback,
  type CustomerDisplayMessage,
  type CustomerDisplaySnapshot,
} from '../types/customerDisplay';

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
  cost_price: number;
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
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showProductBrowser, setShowProductBrowser] = useState(false);
  const [mobilePosTab, setMobilePosTab] = useState<'products' | 'cart'>('products');
  const [selectedProduct, setSelectedProduct] = useState<ProductWithCategory | null>(null);
  const [itemNumberProduct, setItemNumberProduct] = useState<POSProduct | null>(null);
  const [keepVariantGridOpen, setKeepVariantGridOpen] = useState(() => localStorage.getItem('pos-keep-variant-grid-open') === 'true');
  const [lowStockLimit, setLowStockLimit] = useState(10);
  const [autoPrintAfterSale, setAutoPrintAfterSale] = useState(true);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [amountReceived, setAmountReceived] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'credit'>('cash');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('walk-in');
  const [saleNotes, setSaleNotes] = useState('');
  const [showSaleNotes, setShowSaleNotes] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showHeldSalesModal, setShowHeldSalesModal] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [activeHeldSaleId, setActiveHeldSaleId] = useState<string | null>(null);
  const [showInstantBillingModal, setShowInstantBillingModal] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CustomerFormValues>();
  const instantBillingForm = useForm<InstantBillingFormValues>({
    defaultValues: { cost_price: 0, quantity: 1, discount: 0 }
  });
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const itemNumberInputRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const checkoutInProgressRef = useRef(false);
  const automaticallyPrintedSaleIdsRef = useRef(new Set<string>());
  const latestCompletedSaleIdRef = useRef<string | null>(null);
  const customerDisplayChannelRef = useRef<BroadcastChannel | null>(null);
  const customerDisplayWindowRef = useRef<Window | null>(null);
  const latestCustomerDisplaySnapshotRef = useRef<CustomerDisplaySnapshot | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [productsResult, variantsResult, categoriesResult, customersResult, heldSalesResult, settingsResult] = await Promise.all([
      productService.getProductsWithRelations(),
      productService.getAllProductVariants(),
      categoryService.getCategories(),
      customerService.getCustomers({ page: 1, pageSize: 100 }),
      salesService.getHeldSales(),
      settingsService.getStoreSettings(),
    ]);

    if (productsResult.error || variantsResult.error || categoriesResult.error || customersResult.error || heldSalesResult.error) {
      setError(getErrorMessage(productsResult.error ?? variantsResult.error ?? categoriesResult.error ?? customersResult.error ?? heldSalesResult.error));
    } else {
      setProducts((productsResult.data as ProductWithCategory[]) ?? []);
      setVariants((variantsResult.data as VariantWithProduct[]) ?? []);
      setCategories((categoriesResult.data as Category[]) ?? []);
      setCustomers((customersResult.data as Customer[]) ?? []);
      setHeldSales((heldSalesResult.data as HeldSaleWithCustomer[]) ?? []);
      setLowStockLimit(Number(settingsResult.data?.default_low_stock_limit ?? 10));
      setAutoPrintAfterSale(settingsResult.data?.receipt_printing !== 'none');
      setStoreSettings((settingsResult.data as StoreSettings | null) ?? null);
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

  const focusItemNumberInput = useCallback(() => {
    window.setTimeout(() => itemNumberInputRef.current?.focus(), 50);
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
        product.item_article?.toLowerCase().includes(query) ||
        product.item_number?.toLowerCase().includes(query) ||
        product.code.toLowerCase().includes(query);
      const matchesCategory = !categoryFilter || product.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const subtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const lineDiscountTotal = cart.reduce((sum, item) => sum + item.discount_amount, 0);
  const maximumCartDiscount = Math.max(subtotal - lineDiscountTotal, 0);
  const totalAfterDiscount = subtotal - lineDiscountTotal - cartDiscount;
  const cardPaymentFee = paymentMethod === 'card' ? salesService.calculateCardPaymentFee(totalAfterDiscount) : 0;
  const grandTotal = totalAfterDiscount + cardPaymentFee;
  const changeDue = paymentMethod === 'cash' ? Math.max(amountReceived - grandTotal, 0) : 0;

  const customerDisplaySnapshot = useMemo<CustomerDisplaySnapshot>(() => ({
    storeName: storeSettings?.store_name || 'SHOE GALLERY',
    storeAddress: storeSettings?.address ?? null,
    customerName: selectedCustomer?.name ?? null,
    items: cart.map((item) => ({
      id: item.variant_id,
      productName: item.product_name,
      size: item.size,
      colour: item.color,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      discount: item.discount_amount,
      lineTotal: item.unit_price * item.quantity - item.discount_amount,
    })),
    subtotal,
    itemDiscount: lineDiscountTotal,
    saleDiscount: cartDiscount,
    paymentFee: cardPaymentFee,
    grandTotal,
    paymentMethod,
    amountReceived,
    changeDue,
  }), [
    amountReceived,
    cardPaymentFee,
    cart,
    cartDiscount,
    changeDue,
    grandTotal,
    lineDiscountTotal,
    paymentMethod,
    selectedCustomer?.name,
    storeSettings?.address,
    storeSettings?.store_name,
    subtotal,
  ]);
  latestCustomerDisplaySnapshotRef.current = customerDisplaySnapshot;

  const broadcastCustomerDisplay = useCallback((message: CustomerDisplayMessage) => {
    if (customerDisplayChannelRef.current) {
      customerDisplayChannelRef.current.postMessage(message);
      return;
    }
    sendCustomerDisplayFallback(message);
  }, []);

  useEffect(() => {
    const respondToRequest = (message: CustomerDisplayMessage) => {
      if (message.type === 'STATE_REQUEST' && latestCustomerDisplaySnapshotRef.current) {
        broadcastCustomerDisplay({ type: 'STATE_UPDATE', payload: latestCustomerDisplaySnapshotRef.current });
      }
    };

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      customerDisplayChannelRef.current = channel;
      channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => respondToRequest(event.data);
      return () => {
        channel.close();
        customerDisplayChannelRef.current = null;
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CUSTOMER_DISPLAY_STORAGE_KEY) return;
      const message = readCustomerDisplayFallback(event.newValue);
      if (message) respondToRequest(message);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [broadcastCustomerDisplay]);

  useEffect(() => {
    broadcastCustomerDisplay({ type: 'STATE_UPDATE', payload: customerDisplaySnapshot });
  }, [broadcastCustomerDisplay, customerDisplaySnapshot]);

  const openCustomerDisplay = useCallback(() => {
    const existingWindow = customerDisplayWindowRef.current;
    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
      return;
    }

    customerDisplayWindowRef.current = window.open(
      '/customer-display',
      'shoe-gallery-customer-display',
      'popup=yes,width=1100,height=760',
    );
    customerDisplayWindowRef.current?.focus();
  }, []);

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

  const addVariantToCart = useCallback((variant: VariantWithProduct, quantity = 1, returnFocus: 'barcode' | 'item-number' = 'barcode') => {
    const requested = Math.max(1, Math.floor(quantity));
    const currentQuantity = cart.find((item) => item.variant_id === variant.id)?.quantity ?? 0;
    if (currentQuantity + requested > variant.stock_quantity) {
      setError(`Only ${variant.stock_quantity} items are available.`);
      return false;
    }
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.variant_id === variant.id);
      if (existingItem) {
        return currentCart.map((item) =>
          item.variant_id === variant.id
            ? { ...item, quantity: item.quantity + requested }
            : item
        );
      }

      return [
        ...currentCart,
        {
          variant_id: variant.id,
          quantity: requested,
          unit_price: Number(variant.selling_price),
          cost_price: Number(variant.cost_price),
          discount_amount: 0,
          product_name: variant.product.name,
          item_number: variant.product.item_article || variant.product.item_number || variant.product.code,
          barcode_number: variant.barcode_number,
          size: variant.size,
          color: variant.color,
        },
      ];
    });
    setSelectedProduct(null);
    setError(null);
    setSuccess(`${variant.product.name} · ${variant.size} / ${variant.color} added to the invoice.`);
    window.setTimeout(() => setSuccess(null), 2500);
    if (returnFocus === 'item-number') focusItemNumberInput(); else focusBarcodeInput();
    return true;
  }, [cart, focusBarcodeInput, focusItemNumberInput]);

  const addItemNumberVariant = (variant: ProductVariant, quantity: number) => {
    if (!itemNumberProduct) return false;
    const enriched = { ...variant, product: itemNumberProduct } as VariantWithProduct;
    return addVariantToCart(enriched, quantity, 'item-number');
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
  }, [addVariantToCart, focusBarcodeInput, variants]);

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
    setShowSaleNotes(false);
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
        cost_price: Number(values.cost_price),
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
    setShowSaleNotes(Boolean(heldSale.notes));
    setActiveHeldSaleId(heldSale.id);
    setShowHeldSalesModal(false);
  };

  const printCompletedSale = useCallback(async (saleId: string) => {
    const { data, error: saleLoadError } = await salesService.getSaleById(saleId);
    if (saleLoadError || !data) {
      throw saleLoadError ?? new Error('Completed sale could not be loaded for printing.');
    }

    const completedSale = data as SaleWithRelations;
    await printReceiptAutomatically(
      <ThermalReceipt
        sale={completedSale}
        items={completedSale.sale_items ?? []}
        payments={completedSale.sale_payments ?? []}
        customer={completedSale.customer}
        store={storeSettings}
      />,
      { orientation: storeSettings?.receipt_orientation ?? 'landscape' },
    );
  }, [storeSettings]);

  const handleCompleteSale = useCallback(async () => {
    if (checkoutInProgressRef.current) return;
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

    checkoutInProgressRef.current = true;
    setIsCompletingSale(true);

    try {
      setError(null);
      setSuccess(null);
      const sale = await salesService.createSale({
        customer_id: selectedCustomerId === 'walk-in' ? null : selectedCustomerId,
        payment_method: paymentMethod,
        items: cart,
        discount_amount: cartDiscount,
        paid_amount: paymentMethod === 'cash' ? amountReceived : paymentMethod === 'credit' ? 0 : grandTotal,
        notes: saleNotes || undefined,
      });

      if (activeHeldSaleId) {
        try {
          await salesService.deleteHeldSale(activeHeldSaleId);
          setHeldSales((current) => current.filter((heldSale) => heldSale.id !== activeHeldSaleId));
        } catch (heldSaleError) {
          console.error('Completed held sale could not be removed:', heldSaleError);
        }
      }

      setLastSaleId(sale.id);
      latestCompletedSaleIdRef.current = sale.id;
      const shouldPrintReceipt = autoPrintAfterSale && !automaticallyPrintedSaleIdsRef.current.has(sale.id);
      if (shouldPrintReceipt) {
        automaticallyPrintedSaleIdsRef.current.add(sale.id);
      }

      const soldQuantities = cart.reduce<Record<string, number>>((totals, item) => {
        if (!item.is_instant_sale) {
          totals[item.variant_id] = (totals[item.variant_id] ?? 0) + item.quantity;
        }
        return totals;
      }, {});
      setVariants((current) => current.map((variant) => ({
        ...variant,
        stock_quantity: Math.max(0, variant.stock_quantity - (soldQuantities[variant.id] ?? 0)),
      })));
      broadcastCustomerDisplay({
        type: 'SALE_COMPLETED',
        payload: {
          storeName: storeSettings?.store_name || 'SHOE GALLERY',
          grandTotal,
          amountReceived: paymentMethod === 'cash' ? amountReceived : grandTotal,
          changeDue,
        },
      });
      clearCart();
      setSuccess(shouldPrintReceipt
        ? 'Sale completed successfully. Printing receipt…'
        : 'Sale completed successfully.');

      if (shouldPrintReceipt) {
        void printCompletedSale(sale.id).then(() => {
          if (latestCompletedSaleIdRef.current === sale.id) {
            setSuccess('Sale completed successfully and the receipt was sent to the printer.');
          }
        }).catch((printError) => {
          console.error('Automatic receipt printing failed:', printError);
          if (latestCompletedSaleIdRef.current === sale.id) {
            setError('Sale completed successfully, but receipt could not be printed. Use Reprint Receipt to try again.');
            setSuccess('Sale completed successfully.');
          }
        });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      checkoutInProgressRef.current = false;
      setIsCompletingSale(false);
      focusBarcodeInput();
    }
  }, [activeHeldSaleId, amountReceived, autoPrintAfterSale, broadcastCustomerDisplay, cart, cartDiscount, changeDue, clearCart, focusBarcodeInput, grandTotal, maximumCartDiscount, paymentMethod, printCompletedSale, saleNotes, selectedCustomerId, storeSettings?.store_name]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        void handleCompleteSale();
      }

      if (event.key === 'Escape') {
        setSelectedProduct(null);
        setItemNumberProduct(null);
      }

      if (event.key === 'F2') {
        event.preventDefault();
        focusItemNumberInput();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusItemNumberInput, handleCompleteSale]);

  const handlePrintInvoice = async () => {
    if (!lastSaleId) return;
    setError(null);
    try {
      await printCompletedSale(lastSaleId);
    } catch (printError) {
      setError(getErrorMessage(printError, 'Receipt could not be printed.'));
    }
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
    <div className="pos-page flex min-h-0 flex-col gap-4 overflow-hidden">
      <PageHeader
        title="Point of Sale"
        description="Scan, select, and complete the sale."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openCustomerDisplay}>
              <Monitor size={16} />
              Customer Display
            </Button>
            <Button variant="secondary" onClick={() => setShowInstantBillingModal(true)}>
              <Zap size={16} />
              Instant Billing
            </Button>
            <Button variant="secondary" onClick={() => void handlePrintInvoice()} disabled={!lastSaleId || isCompletingSale}>
              <Printer size={16} />
              Reprint Receipt
            </Button>
          </div>
        }
      />

      {error && <Alert message={error} />}
      {success && <div role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

      <div className="pos-mobile-tabs grid grid-cols-2 rounded-xl border border-white/10 bg-white/[.04] p-1">
        <button type="button" onClick={() => setMobilePosTab('products')} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${mobilePosTab === 'products' ? 'bg-emerald-500 text-white' : 'text-dashboard-text-label'}`}>Products</button>
        <button type="button" onClick={() => setMobilePosTab('cart')} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${mobilePosTab === 'cart' ? 'bg-emerald-500 text-white' : 'text-dashboard-text-label'}`}>Cart ({cart.reduce((sum,item)=>sum+item.quantity,0)})</button>
      </div>

      <div className="pos-workspace grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)] xl:gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(340px,1fr)]">
        <div className={`pos-products-pane min-h-0 min-w-0 flex flex-col gap-4 overflow-hidden ${mobilePosTab === 'products' ? 'pos-pane-active' : ''}`}>
          <section className="glass-card overflow-visible p-5">
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Fast add</p><h2 className="mt-1 font-semibold text-dashboard-text-primary">Add an item to the invoice</h2></div>
                <span className="hidden rounded-full bg-white/[.06] px-3 py-1 text-xs text-dashboard-text-sub sm:block">Barcode · Item number · Manual search</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center justify-between text-sm font-medium text-dashboard-text-label"><span>Scan Barcode</span><ScanLine size={16}/></label>
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
                    placeholder="Scan or enter barcode"
                    className="pl-10"
                  />
                  <ScanLine className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16} />
                </div>
              </div>
              <POSItemNumberInput inputRef={itemNumberInputRef} onSelect={(product) => setItemNumberProduct(product)} onError={setError}/>
            </div>
              <button type="button" onClick={() => setShowProductBrowser((open) => !open)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.035] px-4 py-3 text-sm text-dashboard-text-label transition hover:bg-white/[.07] hover:text-dashboard-text-primary">
                <span className="flex items-center gap-2"><LayoutGrid size={16}/>Search products manually</span><ChevronDown size={16} className={`transition ${showProductBrowser ? 'rotate-180' : ''}`}/>
              </button>
            </div>
          </section>

          {showProductBrowser && <section className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto overscroll-contain pr-1">
            <div className="glass-card grid gap-3 p-4 sm:grid-cols-[1fr_220px]">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16}/><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Product name or article number" className="pl-10"/></div>
              <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const productVariants = variantsByProduct[product.id] ?? [];
              const totalStock = productVariants.reduce((sum, item) => sum + item.stock_quantity, 0);
              const startPrice = Math.min(...productVariants.map((item) => Number(item.selling_price)));

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedProduct(product)}
                  className="glass-card-hover p-4 text-left"
                >
                  <div className="relative z-10 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-dashboard-accent/15 text-dashboard-text-primary">
                      <Package2 size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-dashboard-text-primary">{product.name}</p>
                      <p className="mt-1 truncate text-xs text-dashboard-text-sub">{product.item_article || product.item_number || product.code} · {product.category?.name || 'Uncategorized'}</p>
                      <div className="mt-2 flex items-center justify-between text-sm">
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
            <div className="glass-card p-8 text-center text-dashboard-text-sub">
              No products match the current filters.
            </div>
          )}
          </section>}

          <section ref={cartRef} className="glass-card flex min-h-[300px] min-w-0 flex-1 flex-col overflow-hidden p-0">
            <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Current sale items</p>
                <p className="mt-1 text-sm text-dashboard-text-sub">Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</p>
              </div>
              <button type="button" onClick={clearCart} disabled={!cart.length} className="text-xs text-red-300 transition hover:text-red-200 disabled:opacity-40">Clear</button>
            </div>

            <div className="pos-cart-items min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
              {cart.length === 0 ? (
                <div className="cart-empty flex h-full min-h-[180px] items-center justify-center p-6 text-center text-sm text-dashboard-text-sub">
                  Add products to begin the sale.
                </div>
              ) : (
                <table className="w-full min-w-[900px] table-fixed text-left text-xs">
                  <colgroup>
                    <col className="w-[15%]" />
                    <col className="w-[8%]" />
                    <col className="w-[6%]" />
                    <col className="w-[7%]" />
                    <col className="w-[10%]" />
                    <col className="w-[13%]" />
                    <col className="w-[11%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[6%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#0a211a] text-[10px] uppercase tracking-wider text-dashboard-text-sub">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Item</th>
                      <th className="px-2 py-3 font-semibold">Article</th>
                      <th className="px-2 py-3 font-semibold">Size</th>
                      <th className="px-2 py-3 font-semibold">Colour</th>
                      <th className="px-2 py-3 font-semibold">Barcode</th>
                      <th className="px-2 py-3 text-center font-semibold">Qty</th>
                      <th className="px-2 py-3 text-right font-semibold">Price</th>
                      <th className="px-2 py-3 font-semibold">Discount</th>
                      <th className="px-2 py-3 text-right font-semibold">Total</th>
                      <th className="px-2 py-3 text-center font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {cart.map((item) => (
                      <tr key={item.variant_id} className="bg-white/[.015] align-middle transition hover:bg-white/[.04]">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-dashboard-text-primary" title={item.product_name}>{item.product_name}</span>
                            {item.is_instant_sale && <span className="shrink-0 rounded-full bg-dashboard-accent/20 px-1.5 py-0.5 text-[9px] font-medium text-dashboard-accent">Instant</span>}
                          </div>
                        </td>
                        <td className="truncate px-2 py-3 text-dashboard-text-label" title={item.item_number || '-'}>{item.item_number || '-'}</td>
                        <td className="truncate px-2 py-3 text-dashboard-text-label">{item.size || '-'}</td>
                        <td className="truncate px-2 py-3 text-dashboard-text-label" title={item.color || '-'}>{item.color || '-'}</td>
                        <td className="truncate px-2 py-3 font-mono text-[11px] text-dashboard-text-sub" title={item.barcode_number || '-'}>{item.barcode_number || '-'}</td>
                        <td className="px-2 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" aria-label={`Decrease ${item.product_name} quantity`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-dashboard-text-primary transition hover:bg-white/10" onClick={() => updateCartQuantity(item.variant_id, item.quantity - 1)}>
                              <Minus size={12} />
                            </button>
                            <span className="min-w-6 text-center font-medium text-dashboard-text-primary">{item.quantity}</span>
                            <button type="button" aria-label={`Increase ${item.product_name} quantity`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-dashboard-text-primary transition hover:bg-white/10" onClick={() => updateCartQuantity(item.variant_id, item.quantity + 1)}>
                              <Plus size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right text-dashboard-text-primary">{formatCurrency(item.unit_price)}</td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label={`Discount for ${item.product_name}`}
                            className="min-h-8 px-2 py-1 text-right text-xs"
                            type="number"
                            min="0"
                            max={item.unit_price * item.quantity}
                            step="0.01"
                            value={item.discount_amount}
                            onChange={(event) => updateItemDiscount(item.variant_id, Number(event.target.value))}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-dashboard-text-primary">{formatCurrency(item.unit_price * item.quantity - item.discount_amount)}</td>
                        <td className="px-2 py-3 text-center">
                          <button type="button" aria-label={`Remove ${item.product_name} from cart`} onClick={() => updateCartQuantity(item.variant_id, 0)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-500/10 hover:text-red-300">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <div className={`pos-cart-pane glass-card min-h-0 min-w-0 self-stretch overflow-hidden p-3 sm:p-4 ${mobilePosTab === 'cart' ? 'pos-pane-active' : ''}`}>
          <div className="relative z-10 flex h-full min-h-0 flex-col gap-3">
            <div className="pos-customer-controls shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs uppercase tracking-wider text-dashboard-text-sub">Current invoice</p><h3 className="text-lg font-semibold text-dashboard-text-primary">Cart <span className="text-sm font-normal text-dashboard-text-sub">({cart.reduce((sum, item) => sum + item.quantity, 0)})</span></h3></div>
                <button type="button" onClick={clearCart} disabled={!cart.length} className="text-xs text-red-300 transition hover:text-red-200 disabled:opacity-40">Clear</button>
              </div>
              <Select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
                <option value="walk-in">Walk-in Customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" className="pos-control flex-1" onClick={() => setShowCustomerModal(true)}>
                  <Plus size={16} />
                  Add New
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="pos-control flex-1"
                  onClick={() => selectedCustomer && navigate(`/customers/${selectedCustomer.id}`)}
                  disabled={!selectedCustomer}
                >
                  View Profile
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" className="pos-control" variant="outline" onClick={handleHoldSale} disabled={!cart.length}>Hold sale</Button>
                <Button size="sm" className="pos-control" variant="outline" onClick={() => setShowHeldSalesModal(true)}>Held sales {heldSales.length ? `(${heldSales.length})` : ''}</Button>
              </div>
            </div>

            <div className="pos-checkout-controls mt-1 shrink-0 space-y-2 border-t border-white/10 pt-3">
              <div className={`pos-payment-grid grid gap-2 ${paymentMethod === 'cash' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div>
                  <Select label="Payment Method" className="pos-control" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'card' | 'bank_transfer' | 'credit')}>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="credit">Credit</option>
                  </Select>
                </div>
                {paymentMethod === 'cash' && (
                  <div>
                    <Input
                      label="Amount Received"
                      className="pos-control"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountReceived}
                      onChange={(event) => setAmountReceived(Math.max(Number(event.target.value), 0))}
                      placeholder="Cash received"
                    />
                  </div>
                )}
                <div>
                  <Input
                    label="Sale Discount"
                    className="pos-control"
                    type="number"
                    min="0"
                    max={maximumCartDiscount}
                    step="0.01"
                    value={cartDiscount}
                    onChange={(event) => setCartDiscount(Math.min(Math.max(Number(event.target.value), 0), maximumCartDiscount))}
                    placeholder="Enter discount amount"
                  />
                </div>
              </div>

              <Button type="button" size="sm" variant="ghost" className="pos-note-toggle w-full justify-between" onClick={() => setShowSaleNotes((visible) => !visible)}>
                <span>{showSaleNotes ? 'Hide Sale Note' : '+ Add Sale Note'}{saleNotes && !showSaleNotes ? ' · Added' : ''}</span>
                <ChevronDown size={15} className={`transition-transform ${showSaleNotes ? 'rotate-180' : ''}`} />
              </Button>
              {showSaleNotes && <Textarea rows={2} className="pos-sale-notes" placeholder="Sale notes" value={saleNotes} onChange={(event) => setSaleNotes(event.target.value)} />}

              <div className="pos-totals space-y-1 text-sm">
                <div className="flex items-center justify-between text-dashboard-text-sub">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-dashboard-text-sub">
                  <span>Discount</span>
                  <span>{formatCurrency(lineDiscountTotal + cartDiscount)}</span>
                </div>
                {paymentMethod === 'card' && (
                  <div className="flex items-center justify-between text-dashboard-text-sub">
                    <span>Card Fee (2.75%)</span>
                    <span>{formatCurrency(cardPaymentFee)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-white/10 pt-2 text-base font-semibold text-dashboard-text-primary">
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

              <Button className="pos-complete-sale min-h-11 w-full" onClick={() => void handleCompleteSale()} disabled={cart.length === 0 || isCompletingSale}>
                <CreditCard size={16} />
                {isCompletingSale ? 'Completing Sale…' : 'Complete Sale'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {mobilePosTab === 'cart' && <div className="pos-mobile-checkout fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-[#061711]/95 p-3 shadow-2xl backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3"><div className="min-w-0 flex-1"><p className="text-xs text-dashboard-text-sub">Grand Total</p><p className="truncate text-lg font-bold text-dashboard-text-primary">{formatCurrency(grandTotal)}</p></div><Button className="min-h-12 flex-1" onClick={() => void handleCompleteSale()} disabled={!cart.length || isCompletingSale}><CreditCard size={17}/>{isCompletingSale ? 'Completing…' : 'Complete Sale'}</Button></div>
      </div>}

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
                <p className="font-medium text-dashboard-text-primary">{variant.product.item_article || variant.product.item_number || variant.product.code} - {variant.size} / {variant.color}</p>
                <p className="mt-1 text-sm text-dashboard-text-sub">{formatCurrency(Number(variant.selling_price))}</p>
                <p className="mt-2 text-xs text-dashboard-text-sub">{variant.stock_quantity} in stock</p>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {itemNumberProduct && (
        <ProductVariantSelector
          product={itemNumberProduct}
          cartQuantities={cart.reduce<Record<string, number>>((result, item) => { result[item.variant_id] = item.quantity; return result; }, {})}
          lowStockLimit={lowStockLimit}
          keepOpen={keepVariantGridOpen}
          onKeepOpenChange={(value) => { setKeepVariantGridOpen(value); localStorage.setItem('pos-keep-variant-grid-open', String(value)); }}
          onAdd={addItemNumberVariant}
          onClose={() => { setItemNumberProduct(null); focusItemNumberInput(); }}
          onViewCart={() => { setItemNumberProduct(null); cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
        />
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
            <div className="grid gap-4 md:grid-cols-3">
              <Input type="number" step="0.01" label="Cost Price" error={instantBillingForm.formState.errors.cost_price?.message} {...instantBillingForm.register('cost_price', { required: 'Cost is required', min: { value: 0, message: 'Cost cannot be negative' }, valueAsNumber: true })} />
              <Input type="number" step="0.01" label="Selling Price" error={instantBillingForm.formState.errors.selling_price?.message} {...instantBillingForm.register('selling_price', { required: 'Price is required', min: { value: 0, message: 'Price cannot be negative' }, valueAsNumber: true })} />
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
