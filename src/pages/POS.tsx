import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, CreditCard, LayoutGrid, Minus, Monitor, Package2, Plus, Printer, RotateCcw, ScanLine, Search, Trash2, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import type { Category, Customer, Product, ProductVariant, StoreSettings } from '../types';
import type { CartItem, SaleWithRelations } from '../services/salesService';
import type { POSReturnCandidate, SalesReturnRecord } from '../types/salesReturn';
import * as categoryService from '../services/categoryService';
import * as customerService from '../services/customerService';
import * as productService from '../services/productService';
import * as salesService from '../services/salesService';
import * as salesReturnService from '../services/salesReturnService';
import * as settingsService from '../services/settingsService';
import { getErrorMessage } from '../utils/errors';
import { formatCurrency } from '../utils/format';
import { calculateItemDiscount, getDiscountPrice, getDiscountPriceError } from '../utils/itemDiscount';
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
import { ReturnReceipt } from '../components/receipt/ReturnReceipt';
import { printReceipt, printReceiptAutomatically } from '../services/receiptPrintService';
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
  const [returnMode, setReturnMode] = useState(false);
  const [returnCandidates, setReturnCandidates] = useState<POSReturnCandidate[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<POSReturnCandidate | null>(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [returnToStock, setReturnToStock] = useState(true);
  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundReference, setRefundReference] = useState('');
  const [returnReason, setReturnReason] = useState('POS barcode return');
  const [isCompletingReturn, setIsCompletingReturn] = useState(false);
  const [completedReturn, setCompletedReturn] = useState<SalesReturnRecord | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showHeldSalesModal, setShowHeldSalesModal] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [activeHeldSaleId, setActiveHeldSaleId] = useState<string | null>(null);
  const [showInstantBillingModal, setShowInstantBillingModal] = useState(false);
  const [isCustomerDisplayConnected, setIsCustomerDisplayConnected] = useState(false);
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
  const customerDisplayLastSeenRef = useRef(0);

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
  const hasInvalidDiscountPrice = cart.some((item) => getDiscountPriceError(
    item.unit_price,
    getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity),
  ));
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
      productName: item.product_name,
      article: item.item_number ?? null,
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
    amountReceived: paymentMethod === 'cash' ? amountReceived : grandTotal,
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
    const respondToCustomerDisplay = (message: CustomerDisplayMessage) => {
      if (message.type === 'CUSTOMER_DISPLAY_READY' || message.type === 'CUSTOMER_DISPLAY_HEARTBEAT') {
        customerDisplayLastSeenRef.current = Date.now();
        setIsCustomerDisplayConnected(true);
      }
      if (message.type === 'CUSTOMER_DISPLAY_READY' && latestCustomerDisplaySnapshotRef.current) {
        broadcastCustomerDisplay({ type: 'STATE_UPDATE', payload: latestCustomerDisplaySnapshotRef.current });
      }
    };

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      customerDisplayChannelRef.current = channel;
      channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => respondToCustomerDisplay(event.data);
      return () => {
        channel.close();
        customerDisplayChannelRef.current = null;
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== CUSTOMER_DISPLAY_STORAGE_KEY) return;
      const message = readCustomerDisplayFallback(event.newValue);
      if (message) respondToCustomerDisplay(message);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [broadcastCustomerDisplay]);

  useEffect(() => {
    const connectionTimer = window.setInterval(() => {
      setIsCustomerDisplayConnected(Date.now() - customerDisplayLastSeenRef.current < 7000);
    }, 2000);
    return () => window.clearInterval(connectionTimer);
  }, []);

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
            ? {
              ...item,
              quantity: item.quantity + requested,
              discount_amount: getDiscountPriceError(
                item.unit_price,
                getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity),
              ) ? 0 : calculateItemDiscount(
                item.unit_price,
                getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity),
                item.quantity + requested,
              ).lineDiscount,
            }
            : item
        );
      }

      return [
        ...currentCart,
        {
          variant_id: variant.id,
          quantity: requested,
          unit_price: Number(variant.selling_price),
          discount_price: Number(variant.selling_price),
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

  const enterReturnMode = useCallback(() => {
    setReturnMode(true);
    setReturnCandidates([]);
    setSelectedReturn(null);
    setBarcodeInput('');
    setShowProductBrowser(false);
    setError(null);
    setSuccess(null);
    broadcastCustomerDisplay({ type: 'RETURN_MODE', payload: null });
    focusBarcodeInput();
  }, [broadcastCustomerDisplay, focusBarcodeInput]);

  const cancelReturnMode = useCallback(() => {
    setReturnMode(false);
    setReturnCandidates([]);
    setSelectedReturn(null);
    setBarcodeInput('');
    broadcastCustomerDisplay({ type: 'RETURN_CANCELLED' });
    focusBarcodeInput();
  }, [broadcastCustomerDisplay, focusBarcodeInput]);

  const chooseReturnCandidate = useCallback((candidate: POSReturnCandidate) => {
    setSelectedReturn(candidate);
    setReturnQuantity(1);
    setReturnToStock(true);
    setRefundMethod('cash');
    setRefundReference('');
    setReturnReason('POS barcode return');
    broadcastCustomerDisplay({
      type: 'RETURN_MODE',
      payload: {
        productName: candidate.product_name,
        variant: [candidate.size, candidate.colour].filter(Boolean).join(' / '),
        returnAmount: Number(candidate.return_unit_value),
      },
    });
  }, [broadcastCustomerDisplay]);

  const handleReturnBarcodeScan = useCallback(async (barcode: string) => {
    const value = barcode.trim();
    if (!value) return;
    setError(null);
    try {
      const variantResult = await productService.getVariantByBarcode(value);
      if (variantResult.error) throw variantResult.error;
      if (!variantResult.data) {
        setError('Barcode not found.');
        return;
      }
      const candidates = await salesReturnService.getPOSReturnCandidates(value);
      setBarcodeInput('');
      if (!candidates.length) {
        setError('This barcode exists, but no completed historical sale was found.');
        return;
      }
      const eligible = candidates.filter((candidate) => candidate.eligible);
      if (!eligible.length) {
        if (candidates.every((candidate) => candidate.available_quantity <= 0)) {
          setError('This item has already been fully returned.');
        } else if (candidates.every((candidate) => candidate.return_period_expired)) {
          setError('Return period has expired.');
        } else {
          setError('No eligible completed sale was found for this barcode.');
        }
        return;
      }
      playScanSuccessSound();
      setReturnCandidates(eligible);
      if (eligible.length === 1) chooseReturnCandidate(eligible[0]);
    } catch (scanError) {
      setError(getErrorMessage(scanError));
    } finally {
      focusBarcodeInput();
    }
  }, [chooseReturnCandidate, focusBarcodeInput]);

  const returnValue = selectedReturn ? Number(selectedReturn.return_unit_value) * returnQuantity : 0;

  const handleConfirmReturn = async () => {
    if (!selectedReturn) return;
    if (returnQuantity < 1 || returnQuantity > selectedReturn.available_quantity) {
      setError('Return quantity cannot exceed the available quantity.');
      return;
    }
    if ((refundMethod === 'card' || refundMethod === 'bank_transfer') && !refundReference.trim()) {
      setError('A reference is required for card and bank transfer refunds.');
      return;
    }
    setIsCompletingReturn(true);
    setError(null);
    try {
      const refundAmount = refundMethod === 'no_refund' ? 0 : returnValue;
      const returnId = await salesReturnService.completeSalesReturn({
        sale_id: selectedReturn.sale_id,
        return_type: refundAmount > 0 ? 'refund' : 'no_refund',
        reason: returnReason.trim() || 'POS barcode return',
        refund_method: refundMethod,
        refund_amount: refundAmount,
        store_credit_amount: 0,
        refund_reference: refundReference.trim(),
        items: [{
          sale_item_id: selectedReturn.sale_item_id,
          quantity: returnQuantity,
          condition: returnToStock ? 'resellable' : 'damaged',
          restock: returnToStock,
        }],
      });
      const record = await salesReturnService.getSalesReturn(returnId);
      setCompletedReturn(record);
      setReturnMode(false);
      setReturnCandidates([]);
      setSelectedReturn(null);
      setBarcodeInput('');
      setSuccess('Return completed against ' + selectedReturn.invoice_number + '. Scan the replacement as a normal new sale.');
      broadcastCustomerDisplay({
        type: 'RETURN_COMPLETED',
        payload: {
          productName: selectedReturn.product_name,
          variant: [selectedReturn.size, selectedReturn.colour].filter(Boolean).join(' / '),
          returnAmount: returnValue,
        },
      });
      await fetchData();
      focusBarcodeInput();
    } catch (returnError) {
      setError(getErrorMessage(returnError));
    } finally {
      setIsCompletingReturn(false);
    }
  };

  const printReturnReceipt = useCallback(() => {
    if (!completedReturn) return;
    try {
      printReceipt(<ReturnReceipt record={completedReturn} store={storeSettings}/>, {
        orientation: storeSettings?.receipt_orientation ?? 'landscape',
      });
    } catch (printError) {
      setError(getErrorMessage(printError, 'Unable to open return receipt.'));
    }
  }, [completedReturn, storeSettings]);
  const updateCartQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((currentCart) => currentCart.filter((item) => item.variant_id !== variantId));
      return;
    }
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.variant_id === variantId) {
          const discountPrice = getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity);
          const updatedDiscount = getDiscountPriceError(item.unit_price, discountPrice)
            ? 0
            : calculateItemDiscount(item.unit_price, discountPrice, quantity).lineDiscount;
          if (item.is_instant_sale) {
            return { ...item, quantity, discount_price: discountPrice, discount_amount: updatedDiscount };
          }
          const stock = variants.find((variant) => variant.id === variantId)?.stock_quantity ?? 0;
          const nextQuantity = Math.min(quantity, stock);
          return {
            ...item,
            quantity: nextQuantity,
            discount_price: discountPrice,
            discount_amount: getDiscountPriceError(item.unit_price, discountPrice)
              ? 0
              : calculateItemDiscount(item.unit_price, discountPrice, nextQuantity).lineDiscount,
          };
        }
        return item;
      })
    );
  };

  const updateDiscountPrice = (variantId: string, discountPrice: number) => {
    setCart((currentCart) =>
      currentCart.map((item) =>
        item.variant_id === variantId
          ? {
            ...item,
            discount_price: discountPrice,
            discount_amount: getDiscountPriceError(item.unit_price, discountPrice)
              ? 0
              : calculateItemDiscount(item.unit_price, discountPrice, item.quantity).lineDiscount,
          }
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
    const quantity = Number(values.quantity);
    const unitPrice = Number(values.selling_price);
    const lineDiscount = Number(values.discount || 0);
    const discountPrice = getDiscountPrice(unitPrice, undefined, lineDiscount, quantity);
    setCart((currentCart) => [
      ...currentCart,
      {
        variant_id: `instant-${Date.now()}`,
        quantity,
        cost_price: Number(values.cost_price),
        unit_price: unitPrice,
        discount_price: discountPrice,
        discount_amount: getDiscountPriceError(unitPrice, discountPrice)
          ? 0
          : calculateItemDiscount(unitPrice, discountPrice, quantity).lineDiscount,
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
    setCart(heldSale.cart_data.map((item) => {
      const discountPrice = getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity);
      return {
        ...item,
        discount_price: discountPrice,
        discount_amount: getDiscountPriceError(item.unit_price, discountPrice)
          ? 0
          : calculateItemDiscount(item.unit_price, discountPrice, item.quantity).lineDiscount,
      };
    }));
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

    if (hasInvalidDiscountPrice) {
      setError('Fix invalid item discount prices before completing the sale.');
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
  }, [activeHeldSaleId, amountReceived, autoPrintAfterSale, broadcastCustomerDisplay, cart, cartDiscount, changeDue, clearCart, focusBarcodeInput, grandTotal, hasInvalidDiscountPrice, maximumCartDiscount, paymentMethod, printCompletedSale, saleNotes, selectedCustomerId, storeSettings?.store_name]);

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
    <div className="pos-page flex w-full min-w-0 max-w-full flex-col gap-4 overflow-hidden">
      <PageHeader
        title="Point of Sale"
        description="Scan, select, and complete the sale."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openCustomerDisplay}>
              <Monitor size={16} />
              Customer Display
            </Button>
            <span className={'flex items-center gap-1.5 self-center px-1 text-[11px] text-dashboard-text-sub'}>
              <span className={isCustomerDisplayConnected ? 'h-1.5 w-1.5 rounded-full bg-emerald-400' : 'h-1.5 w-1.5 rounded-full bg-slate-500'} />
              {isCustomerDisplayConnected ? 'Display connected' : 'Display not connected'}
            </span>
            <Button variant={returnMode ? 'danger' : 'secondary'} onClick={returnMode ? cancelReturnMode : enterReturnMode}>
              <RotateCcw size={16} />
              {returnMode ? 'Cancel Return' : 'Return'}
            </Button>
            <Button variant="secondary" onClick={() => setShowInstantBillingModal(true)} disabled={returnMode}>
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
      {returnMode && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-amber-100"><div className="flex items-center gap-2"><RotateCcw size={18}/><div><strong className="tracking-[.14em]">RETURN MODE</strong><p className="text-xs text-amber-100/75">Scan the exact barcode printed on the returned product.</p></div></div><Button size="sm" variant="danger" onClick={cancelReturnMode}>Cancel Return</Button></div>}

      <div className="pos-mobile-tabs grid grid-cols-2 rounded-xl border border-white/10 bg-white/[.04] p-1">
        <button type="button" onClick={() => setMobilePosTab('products')} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${mobilePosTab === 'products' ? 'bg-emerald-500 text-white' : 'text-dashboard-text-label'}`}>Products</button>
        <button type="button" onClick={() => setMobilePosTab('cart')} className={`rounded-lg px-3 py-2.5 text-sm font-medium ${mobilePosTab === 'cart' ? 'bg-emerald-500 text-white' : 'text-dashboard-text-label'}`}>Cart ({cart.reduce((sum,item)=>sum+item.quantity,0)})</button>
      </div>

      <div className="pos-workspace grid w-full min-h-0 min-w-0 max-w-full flex-1 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)] xl:gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
        <div className={`pos-products-pane min-h-0 w-full min-w-0 max-w-full flex flex-col gap-4 overflow-hidden ${mobilePosTab === 'products' ? 'pos-pane-active' : ''}`}>
          <section className="glass-card overflow-visible p-5">
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className={returnMode ? "text-xs font-semibold uppercase tracking-[.16em] text-amber-300" : "text-xs font-semibold uppercase tracking-[.16em] text-sky-300"}>{returnMode ? "RETURN MODE" : "Fast add"}</p><h2 className="mt-1 font-semibold text-dashboard-text-primary">{returnMode ? "Scan Barcode to Return Item" : "Add an item to the invoice"}</h2></div>
                <span className="hidden rounded-full bg-white/[.06] px-3 py-1 text-xs text-dashboard-text-sub sm:block">Barcode · Item number · Manual search</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center justify-between text-sm font-medium text-dashboard-text-label"><span>{returnMode ? "Scan Barcode to Return Item" : "Scan Barcode"}</span><ScanLine size={16}/></label>
                <div className="relative">
                  <Input
                    ref={barcodeInputRef}
                    value={barcodeInput}
                    onChange={(event) => setBarcodeInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void (returnMode ? handleReturnBarcodeScan(barcodeInput) : handleBarcodeScan(barcodeInput));
                      }
                    }}
                    placeholder={returnMode ? "Scan barcode to return item" : "Scan or enter barcode"}
                    className="pl-10"
                  />
                  <ScanLine className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dashboard-text-sub" size={16} />
                </div>
              </div>
              {!returnMode && <POSItemNumberInput inputRef={itemNumberInputRef} onSelect={(product) => setItemNumberProduct(product)} onError={setError}/>}
            </div>
              <button type="button" disabled={returnMode} onClick={() => setShowProductBrowser((open) => !open)} className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.035] px-4 py-3 text-sm text-dashboard-text-label transition hover:bg-white/[.07] hover:text-dashboard-text-primary">
                <span className="flex items-center gap-2"><LayoutGrid size={16}/>Search products manually</span><ChevronDown size={16} className={`transition ${showProductBrowser ? 'rotate-180' : ''}`}/>
              </button>
            </div>
          </section>

          {showProductBrowser && !returnMode && <section className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto overscroll-contain pr-1">
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

          <section ref={cartRef} className="glass-card flex min-h-[300px] w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden p-0">
            <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">Current sale items</p>
                <p className="mt-1 text-sm text-dashboard-text-sub">Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</p>
              </div>
              <button type="button" onClick={clearCart} disabled={!cart.length} className="text-xs text-red-300 transition hover:text-red-200 disabled:opacity-40">Clear</button>
            </div>

            <div className="pos-cart-items min-h-0 w-full min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              {cart.length === 0 ? (
                <div className="cart-empty flex h-full min-h-[180px] items-center justify-center p-6 text-center text-sm text-dashboard-text-sub">
                  Add products to begin the sale.
                </div>
              ) : (
                <table className="pos-cart-table w-full min-w-0 max-w-full table-fixed text-left text-xs">
                  <colgroup>
                    <col className="w-[24%]" />
                    <col className="w-[12%]" />
                    <col className="w-[16%]" />
                    <col className="w-[13%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#0a211a] text-[10px] uppercase tracking-wider text-dashboard-text-sub">
                    <tr>
                      <th className="min-w-0 px-2 py-2.5 font-semibold">Item</th>
                      <th className="min-w-0 px-1.5 py-2.5 font-semibold">Variant</th>
                      <th className="min-w-0 px-1 py-2.5 text-center font-semibold">Qty</th>
                      <th className="min-w-0 px-1.5 py-2.5 text-right font-semibold">Price</th>
                      <th className="min-w-0 px-1.5 py-2.5 text-right font-semibold">Disc. Price</th>
                      <th className="min-w-0 px-1.5 py-2.5 text-right font-semibold">Total</th>
                      <th className="min-w-0 px-1 py-2.5 text-center text-[9px] font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {cart.map((item) => (
                      <tr key={item.variant_id} className="bg-white/[.015] align-middle transition hover:bg-white/[.04]">
                        <td className="min-w-0 overflow-hidden px-2 py-2.5">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate font-medium text-dashboard-text-primary" title={item.product_name}>{item.product_name}</span>
                            {item.is_instant_sale && <span className="shrink-0 rounded-full bg-dashboard-accent/20 px-1 py-0.5 text-[8px] font-medium text-dashboard-accent">Instant</span>}
                          </div>
                          {(item.item_number || item.barcode_number) && (
                            <p className="mt-0.5 truncate text-[10px] text-dashboard-text-sub" title={item.item_number || item.barcode_number || undefined}>
                              {item.item_number ? `Article: ${item.item_number}` : `Barcode: ${item.barcode_number}`}
                            </p>
                          )}
                        </td>
                        <td className="min-w-0 truncate px-1.5 py-2.5 text-dashboard-text-label" title={`${item.size || '-'} / ${item.color || '-'}`}>
                          {item.size || '-'} / {item.color || '-'}
                        </td>
                        <td className="min-w-0 px-1 py-2.5">
                          <div className="flex min-w-0 items-center justify-center gap-0.5">
                            <button type="button" aria-label={`Decrease ${item.product_name} quantity`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-dashboard-text-primary transition hover:bg-white/10" onClick={() => updateCartQuantity(item.variant_id, item.quantity - 1)}>
                              <Minus size={12} />
                            </button>
                            <span className="min-w-5 text-center font-medium text-dashboard-text-primary">{item.quantity}</span>
                            <button type="button" aria-label={`Increase ${item.product_name} quantity`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-dashboard-text-primary transition hover:bg-white/10" onClick={() => updateCartQuantity(item.variant_id, item.quantity + 1)}>
                              <Plus size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="min-w-0 truncate px-1.5 py-2.5 text-right tabular-nums text-dashboard-text-primary" title={formatCurrency(item.unit_price)}>
                          {formatCurrency(item.unit_price).replace('LKR', '').trim()}
                        </td>
                        <td className="min-w-0 px-1.5 py-2">
                          <Input
                            aria-label={`Discount price for ${item.product_name}`}
                            aria-invalid={Boolean(getDiscountPriceError(
                              item.unit_price,
                              getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity),
                            ))}
                            className={`min-h-7 w-full min-w-0 px-1.5 py-1 text-right text-xs tabular-nums ${getDiscountPriceError(
                              item.unit_price,
                              getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity),
                            ) ? 'border-red-400 text-red-200' : ''}`}
                            type="number"
                            min="0"
                            max={item.unit_price}
                            step="0.01"
                            value={getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity)}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => updateDiscountPrice(item.variant_id, Number(event.target.value))}
                          />
                          {getDiscountPriceError(
                            item.unit_price,
                            getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity),
                          ) ? (
                            <p className="mt-1 text-right text-[9px] leading-tight text-red-300">
                              {getDiscountPriceError(
                                item.unit_price,
                                getDiscountPrice(item.unit_price, item.discount_price, item.discount_amount, item.quantity),
                              )}
                            </p>
                          ) : item.discount_amount > 0 ? (
                            <p className="mt-1 text-right text-[9px] leading-tight text-dashboard-accent">
                              -{formatCurrency(item.discount_amount).replace('LKR', '').trim()}
                            </p>
                          ) : null}
                        </td>
                        <td className="min-w-0 truncate px-1.5 py-2.5 text-right font-semibold tabular-nums text-dashboard-text-primary" title={formatCurrency(item.unit_price * item.quantity - item.discount_amount)}>
                          {formatCurrency(item.unit_price * item.quantity - item.discount_amount).replace('LKR', '').trim()}
                        </td>
                        <td className="min-w-0 px-1 py-2.5 text-center">
                          <button type="button" title="Remove" aria-label={`Remove ${item.product_name} from cart`} onClick={() => updateCartQuantity(item.variant_id, 0)} className="inline-flex h-7 w-7 max-w-full items-center justify-center rounded-md text-red-400 transition hover:bg-red-500/10 hover:text-red-300">
                            <Trash2 size={14} />
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
                {lineDiscountTotal > 0 && (
                  <div className="flex items-center justify-between text-dashboard-text-sub">
                    <span>Item Discount</span>
                    <span>-{formatCurrency(lineDiscountTotal)}</span>
                  </div>
                )}
                {cartDiscount > 0 && (
                  <div className="flex items-center justify-between text-dashboard-text-sub">
                    <span>Sale Discount</span>
                    <span>-{formatCurrency(cartDiscount)}</span>
                  </div>
                )}
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

              <Button className="pos-complete-sale min-h-11 w-full" onClick={() => void handleCompleteSale()} disabled={cart.length === 0 || isCompletingSale || hasInvalidDiscountPrice}>
                <CreditCard size={16} />
                {isCompletingSale ? 'Completing Sale…' : 'Complete Sale'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {mobilePosTab === 'cart' && <div className="pos-mobile-checkout fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-[#061711]/95 p-3 shadow-2xl backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3"><div className="min-w-0 flex-1"><p className="text-xs text-dashboard-text-sub">Grand Total</p><p className="truncate text-lg font-bold text-dashboard-text-primary">{formatCurrency(grandTotal)}</p></div><Button className="min-h-12 flex-1" onClick={() => void handleCompleteSale()} disabled={!cart.length || isCompletingSale || hasInvalidDiscountPrice}><CreditCard size={17}/>{isCompletingSale ? 'Completing…' : 'Complete Sale'}</Button></div>
      </div>}

      {(returnCandidates.length > 0 || selectedReturn) && (
        <Modal title={selectedReturn ? 'Return Item' : 'Select Original Sale'} onClose={() => { setReturnCandidates([]); setSelectedReturn(null); focusBarcodeInput(); }} size="lg">
          {!selectedReturn ? (
            <div className="space-y-3">
              <p className="text-sm text-dashboard-text-sub">This barcode was sold more than once. Select the correct original invoice.</p>
              {returnCandidates.map((candidate) => (
                <button key={candidate.sale_item_id} type="button" onClick={() => chooseReturnCandidate(candidate)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.04] p-4 text-left transition hover:border-amber-300/40 hover:bg-amber-400/10">
                  <div><p className="font-semibold text-dashboard-text-primary">{candidate.invoice_number}</p><p className="text-xs text-dashboard-text-sub">{new Date(candidate.sold_at).toLocaleDateString('en-GB')} · {candidate.product_name} · {[candidate.size, candidate.colour].filter(Boolean).join(' / ')}</p></div>
                  <div className="text-right"><p className="font-semibold">{formatCurrency(Number(candidate.return_unit_value))}</p><p className="text-xs text-emerald-300">Qty {candidate.available_quantity} available</p></div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              {returnCandidates.length > 1 && <button type="button" className="text-xs font-medium text-sky-300" onClick={() => setSelectedReturn(null)}>Choose a different invoice</button>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ReturnFact label="Product" value={selectedReturn.product_name}/>
                <ReturnFact label="Article" value={selectedReturn.article || '—'}/>
                <ReturnFact label="Variant" value={[selectedReturn.size, selectedReturn.colour].filter(Boolean).join(' / ') || '—'}/>
                <ReturnFact label="Barcode" value={selectedReturn.barcode_number}/>
                <ReturnFact label="Original Invoice" value={selectedReturn.invoice_number}/>
                <ReturnFact label="Sold Date" value={new Date(selectedReturn.sold_at).toLocaleDateString('en-GB')}/>
                <ReturnFact label="Original Qty" value={String(selectedReturn.original_quantity)}/>
                <ReturnFact label="Already Returned" value={String(selectedReturn.already_returned)}/>
                <ReturnFact label="Available to Return" value={String(selectedReturn.available_quantity)}/>
                <ReturnFact label="Actual Sold Price" value={formatCurrency(Number(selectedReturn.return_unit_value))}/>
                <ReturnFact label="Current Stock" value={String(selectedReturn.current_stock)}/>
                <ReturnFact label="New Stock" value={String(selectedReturn.current_stock + (returnToStock ? returnQuantity : 0))}/>
              </div>
              <div className="grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
                <Input label="Return Qty" type="number" min={1} max={selectedReturn.available_quantity} value={returnQuantity} onChange={(event) => setReturnQuantity(Math.max(1, Math.min(selectedReturn.available_quantity, Number(event.target.value) || 1)))}/>
                <Select label="Refund Method" value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}>
                  <option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="original_payment_method">Original Payment Method</option><option value="no_refund">No Refund / Return Credit Handled Separately</option>
                </Select>
                {(refundMethod === 'card' || refundMethod === 'bank_transfer') && <Input label="Refund Reference" value={refundReference} onChange={(event) => setRefundReference(event.target.value)}/>}
                <Input label="Reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)}/>
                <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-4 py-3 text-sm text-dashboard-text-primary sm:col-span-2">
                  <input type="checkbox" checked={returnToStock} onChange={(event) => setReturnToStock(event.target.checked)} className="h-4 w-4 accent-emerald-500"/>
                  <span><strong>Return to Stock</strong><span className="block text-xs font-normal text-dashboard-text-sub">Untick for damaged or non-resellable items.</span></span>
                </label>
              </div>
              <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 p-4">
                <div className="flex items-center justify-between gap-3"><span>Return Value</span><strong className="text-xl text-amber-200">{formatCurrency(returnValue)}</strong></div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-dashboard-text-sub"><span>Restock</span><span>{returnToStock ? 'Yes' : 'No'}</span></div>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => { setReturnCandidates([]); setSelectedReturn(null); focusBarcodeInput(); }}>Cancel</Button>
                <Button className="flex-1" disabled={isCompletingReturn} onClick={() => void handleConfirmReturn()}><CheckCircle2 size={17}/>{isCompletingReturn ? 'Confirming…' : 'Confirm Return'}</Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {completedReturn && (
        <Modal title="Return Completed" onClose={() => setCompletedReturn(null)}>
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"><CheckCircle2 size={28}/></div>
            <div><p className="text-lg font-semibold text-dashboard-text-primary">{completedReturn.return_number}</p><p className="mt-1 text-sm text-dashboard-text-sub">The return is recorded and RETURN MODE has closed. The replacement can now be sold as a normal new sale.</p></div>
            <div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => setCompletedReturn(null)}>Done</Button><Button className="flex-1" onClick={printReturnReceipt}><Printer size={16}/>Print Return Receipt</Button></div>
          </div>
        </Modal>
      )}
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
function ReturnFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/[.04] p-3"><p className="text-xs uppercase text-dashboard-text-label">{label}</p><p className="mt-1 font-semibold text-dashboard-text-primary">{value}</p></div>;
}
