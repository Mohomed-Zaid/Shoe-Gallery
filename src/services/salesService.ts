import { supabase } from './supabase';
import { adjustStock } from './inventoryService';
import type {
  Customer,
  Product,
  ProductVariant,
  Return,
  Sale,
  SaleItem,
  StoreSettings,
  Profile,
} from '../types';
import { calculateItemDiscount, getDiscountPrice, getDiscountPriceError } from '../utils/itemDiscount';
import { requireCurrentCashRegister } from './cashRegisterService';

export interface CartItem {
  variant_id: string;
  quantity: number;
  unit_price: number;
  discount_price?: number;
  cost_price?: number;
  discount_amount: number;
  product_name: string;
  item_number?: string;
  barcode_number?: string | null;
  size: string;
  color: string;
  is_instant_sale?: boolean;
}

export interface SaleWithRelations extends Sale {
  customer: Customer | null;
  cashier: Profile | null;
  sale_payments: Array<{id:string;payment_method:string;amount:number}>;
  sale_items: Array<
    SaleItem & {
      variant: (ProductVariant & { product: Product | null }) | null;
    }
  >;
}

export interface CreateSalePayload {
  customer_id: string | null;
  payment_method: 'cash' | 'card' | 'bank_transfer' | 'credit';
  items: CartItem[];
  discount_amount?: number;
  tax_amount?: number;
  paid_amount?: number;
  notes?: string;
}

export interface HeldSalePayload {
  customer_id: string | null;
  customer_name?: string | null;
  payment_method: string;
  subtotal: number;
  discount_amount: number;
  grand_total: number;
  notes?: string;
  cart_data: CartItem[];
}

function buildInvoiceNumber(prefix: string) {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `${prefix}-${datePart}-${timePart}`;
}

async function getInvoicePrefix() {
  const { data } = await supabase.from('store_settings').select('invoice_prefix').maybeSingle();
  return (data as Pick<StoreSettings, 'invoice_prefix'> | null)?.invoice_prefix || 'INV';
}

export interface SalesListFilters {
  createdFrom?: string;
  createdBefore?: string;
}

export async function getSales(filters: SalesListFilters = {}) {
  let query = supabase
    .from('sales')
    .select(`
      *,
      customer:customers(*),
      cashier:profiles(*),
      sale_payments(id,payment_method,amount),
      sale_items(
        *,
        variant:product_variants(
          *,
          product:products(*)
        )
      )
    `)
    .neq('status', 'held');

  if (filters.createdFrom) query = query.gte('created_at', filters.createdFrom);
  if (filters.createdBefore) query = query.lt('created_at', filters.createdBefore);

  return query.order('created_at', { ascending: false });
}

export async function getSaleById(id: string) {
  return supabase
    .from('sales')
    .select(`
      *,
      customer:customers(*),
      cashier:profiles(*),
      sale_payments(id,payment_method,amount),
      sale_items(
        *,
        variant:product_variants(
          *,
          product:products(*)
        )
      )
    `)
    .eq('id', id)
    .maybeSingle();
}

export async function createSale(payload: CreateSalePayload) {
  await requireCurrentCashRegister();
  if (payload.items.length === 0) {
    throw new Error('Please add at least one item to complete the sale.');
  }

  const pricedItems = payload.items.map((item) => {
    if (item.is_instant_sale) {
      const numericCost = Number(item.cost_price);
      if (item.cost_price == null || !Number.isFinite(numericCost) || numericCost < 0) {
        throw new Error('Instant Billing item has an invalid cost. Re-enter its Cost Code.');
      }
    }
    const discountPrice = getDiscountPrice(
      Number(item.unit_price),
      item.discount_price,
      Number(item.discount_amount),
      Number(item.quantity),
    );
    const validationError = getDiscountPriceError(Number(item.unit_price), discountPrice);
    if (validationError) throw new Error(validationError);
    const pricing = calculateItemDiscount(Number(item.unit_price), discountPrice, Number(item.quantity));
    return { ...item, discount_price: discountPrice, discount_amount: pricing.lineDiscount };
  });

  const inventoryItems = payload.items.filter((item) => !item.is_instant_sale);
  const requiredByVariant = inventoryItems.reduce<Record<string, number>>((result, item) => {
    result[item.variant_id] = (result[item.variant_id] ?? 0) + item.quantity;
    return result;
  }, {});
  const variantIds = Object.keys(requiredByVariant);
  const stockLookup = variantIds.length
    ? supabase
      .from('product_variants')
      .select('id,stock_quantity,is_active,cost_price')
      .in('id', variantIds)
    : Promise.resolve({ data: [], error: null });
  const [stockResult, prefix, authResult] = await Promise.all([
    stockLookup,
    getInvoicePrefix(),
    supabase.auth.getUser(),
  ]);
  if (stockResult.error) throw stockResult.error;

  const currentVariants = stockResult.data ?? [];
  for (const [variantId, required] of Object.entries(requiredByVariant)) {
    const variant = currentVariants.find((row) => row.id === variantId);
    if (!variant || variant.is_active === false) throw new Error('A selected product variant is no longer available.');
    if (Number(variant.stock_quantity) < required) throw new Error(`Stock changed: only ${Number(variant.stock_quantity)} item(s) are now available.`);
  }

  const subtotal = pricedItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const itemDiscount = pricedItems.reduce((sum, item) => sum + item.discount_amount, 0);
  const discountAmount = (payload.discount_amount ?? 0) + itemDiscount;
  const taxAmount = payload.tax_amount ?? 0;
  // Processing fees are an internal reporting expense. Payment method must
  // never change the sale amount owed or recorded for the customer.
  const grandTotal = subtotal - discountAmount + taxAmount;
  if (discountAmount < 0 || grandTotal < 0) {
    throw new Error('Discount cannot exceed the sale amount.');
  }
  const paidAmount =
    payload.payment_method === 'credit'
      ? payload.paid_amount ?? 0
      : grandTotal;
  const amountTendered = payload.payment_method === 'cash'
    ? Math.max(Number(payload.paid_amount ?? grandTotal), grandTotal)
    : paidAmount;
  const changeDue = payload.payment_method === 'cash'
    ? Math.max(amountTendered - grandTotal, 0)
    : 0;
  const balanceDue = Math.max(grandTotal - paidAmount, 0);

  const authData = authResult.data;
  const invoiceNumber = buildInvoiceNumber(prefix);

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      customer_id: payload.customer_id,
      user_id: authData.user?.id ?? null,
      invoice_number: invoiceNumber,
      subtotal,
      discount_amount: discountAmount,
      invoice_discount_amount: payload.discount_amount ?? 0,
      tax_amount: taxAmount,
      // Non-zero values identify legacy transactions that stored a surcharge.
      // New transactions always derive card fees from sale_payments in reports.
      card_payment_fee: 0,
      total_amount: grandTotal,
      paid_amount: paidAmount,
      amount_tendered: amountTendered,
      change_due: changeDue,
      balance_due: balanceDue,
      payment_method: payload.payment_method,
      status: 'completed',
      notes: payload.notes ?? null,
    })
    .select()
    .single();

  if (saleError || !sale) {
    throw saleError ?? new Error('Failed to create sale.');
  }

  const saleItems = pricedItems.map((item) => {
    const currentVariant = item.is_instant_sale ? null : currentVariants.find((variant) => variant.id === item.variant_id);
    const saleTimeCost = item.is_instant_sale
      ? (item.cost_price == null ? null : Number(item.cost_price))
      : (currentVariant?.cost_price == null ? null : Number(currentVariant.cost_price));
    return ({
    sale_id: sale.id,
    variant_id: item.is_instant_sale ? null : item.variant_id,
    quantity: item.quantity,
    selling_price: item.unit_price,
    // Snapshot cost for every item. Never use the mutable variant cost in reports.
    cost_price: saleTimeCost,
    cost_price_at_sale: saleTimeCost,
    line_subtotal: item.unit_price * item.quantity,
    discount_amount: item.discount_amount,
    line_total: calculateItemDiscount(item.unit_price, item.discount_price, item.quantity).lineTotal,
    product_name_snapshot: item.is_instant_sale ? `${item.product_name} (Instant Sale)` : item.product_name,
    item_number_snapshot: item.item_number ?? null,
    barcode_number_snapshot: item.barcode_number ?? null,
    size_snapshot: item.size,
    color_snapshot: item.color,
    product_name: item.is_instant_sale ? item.product_name : null,
    is_instant_sale: item.is_instant_sale ?? false,
    });
  });

  const saveSaleItems = async () => {
    const { error } = await supabase.from('sale_items').insert(saleItems);
    if (error) throw error;
  };

  const savePayment = async () => {
    if (paidAmount <= 0) return;
    const { error } = await supabase.from('sale_payments').insert({
      sale_id: sale.id,
      payment_method: payload.payment_method,
      amount: paidAmount,
      payment_date: new Date().toISOString(),
      received_by: authData.user?.id ?? null,
    });
    if (error) throw error;
  };

  const updateInventory = async () => {
    if (!variantIds.length) return;

    const inventoryChanges = Object.entries(requiredByVariant).map(([variantId, quantity]) => {
      const variant = currentVariants.find((row) => row.id === variantId)!;
      const previousQuantity = Number(variant.stock_quantity);
      return {
        variantId,
        quantity,
        previousQuantity,
        newQuantity: previousQuantity - quantity,
      };
    });

    await Promise.all(inventoryChanges.map(async (change) => {
      const { data, error } = await supabase
        .from('product_variants')
        .update({ stock_quantity: change.newQuantity })
        .eq('id', change.variantId)
        .eq('stock_quantity', change.previousQuantity)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Stock changed while completing the sale. Please check the cart and try again.');
    }));

    const { error } = await supabase.from('inventory_history').insert(inventoryChanges.map((change) => ({
      variant_id: change.variantId,
      change_type: 'sale',
      quantity_changed: change.quantity,
      previous_quantity: change.previousQuantity,
      new_quantity: change.newQuantity,
      reason: `Sale ${invoiceNumber}`,
      user_id: authData.user?.id ?? null,
    })));
    if (error) throw error;
  };

  const updateCustomerBalance = async () => {
    if (!payload.customer_id) return;
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('outstanding_balance')
      .eq('id', payload.customer_id)
      .maybeSingle();
    if (customerError) throw customerError;

    const currentBalance = Number((customer as Pick<Customer, 'outstanding_balance'> | null)?.outstanding_balance ?? 0);
    const { error } = await supabase
      .from('customers')
      .update({ outstanding_balance: currentBalance + balanceDue })
      .eq('id', payload.customer_id);
    if (error) throw error;
  };

  await Promise.all([
    saveSaleItems(),
    savePayment(),
    updateInventory(),
    updateCustomerBalance(),
  ]);

  return sale;
}

export async function cancelSale(id: string) {
  const { data: sale, error } = await getSaleById(id);
  if (error || !sale) {
    throw error ?? new Error('Sale not found.');
  }

  const typedSale = sale as SaleWithRelations;
  if (typedSale.status === 'cancelled') {
    return typedSale;
  }

  for (const item of typedSale.sale_items) {
    if (item.variant_id && !item.is_instant_sale) {
      await adjustStock(item.variant_id, 'add', item.quantity, `Sale cancellation ${typedSale.invoice_number ?? typedSale.id}`);
    }
  }

  if (typedSale.customer_id && typedSale.balance_due > 0) {
    const { data: customer } = await supabase
      .from('customers')
      .select('outstanding_balance')
      .eq('id', typedSale.customer_id)
      .maybeSingle();

    const currentBalance = Number((customer as Pick<Customer, 'outstanding_balance'> | null)?.outstanding_balance ?? 0);
    await supabase
      .from('customers')
      .update({
        outstanding_balance: Math.max(currentBalance - typedSale.balance_due, 0),
      })
      .eq('id', typedSale.customer_id);
  }

  const { error: updateError } = await supabase
    .from('sales')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (updateError) {
    throw updateError;
  }

  return typedSale;
}

export async function getHeldSales() {
  return supabase
    .from('held_sales')
    .select('*, customer:customers(*)')
    .order('updated_at', { ascending: false });
}

export async function createHeldSale(payload: HeldSalePayload) {
  const { data: authData } = await supabase.auth.getUser();
  return supabase
    .from('held_sales')
    .insert({
      user_id: authData.user?.id ?? null,
      customer_id: payload.customer_id,
      customer_name: payload.customer_name ?? null,
      payment_method: payload.payment_method,
      subtotal: payload.subtotal,
      discount_amount: payload.discount_amount,
      grand_total: payload.grand_total,
      notes: payload.notes ?? null,
      cart_data: payload.cart_data,
    })
    .select()
    .single();
}

export async function deleteHeldSale(id: string) {
  return supabase.from('held_sales').delete().eq('id', id);
}

export interface CreateReturnPayload {
  sale_id: string;
  customer_id: string | null;
  return_type: 'refund' | 'exchange_size' | 'exchange_color' | 'exchange_product' | 'store_credit';
  refund_amount: number;
  store_credit_amount?: number;
  items: Array<{
    variant_id: string;
    quantity: number;
    reason: string;
  }>;
  exchange_items?: Array<{
    variant_id: string;
    quantity: number;
  }>;
}

export async function createReturn(payload: CreateReturnPayload) {
  const { data: authData } = await supabase.auth.getUser();
  const { data: createdReturn, error: returnError } = await supabase
    .from('returns')
    .insert({
      sale_id: payload.sale_id,
      customer_id: payload.customer_id,
      return_type: payload.return_type,
      refund_amount: payload.refund_amount,
      store_credit_amount: payload.store_credit_amount ?? 0,
      created_by: authData.user?.id ?? null,
    })
    .select()
    .single();

  if (returnError || !createdReturn) {
    throw returnError ?? new Error('Failed to create return.');
  }

  const returnItems = payload.items.map((item) => ({
    return_id: createdReturn.id,
    variant_id: item.variant_id,
    quantity: item.quantity,
    reason: item.reason,
  }));

  const { error: itemsError } = await supabase.from('return_items').insert(returnItems);
  if (itemsError) {
    throw itemsError;
  }

  for (const item of payload.items) {
    await adjustStock(item.variant_id, 'add', item.quantity, `Return ${createdReturn.id}`);
  }

  for (const item of payload.exchange_items ?? []) {
    await adjustStock(item.variant_id, 'sale', item.quantity, `Exchange ${createdReturn.id}`);
  }

  // The original invoice is immutable; report net values through return records.

  if (payload.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('outstanding_balance')
      .eq('id', payload.customer_id)
      .maybeSingle();

    const currentBalance = Number((customer as Pick<Customer, 'outstanding_balance'> | null)?.outstanding_balance ?? 0);
    const newBalance =
      payload.return_type === 'store_credit'
        ? currentBalance + (payload.store_credit_amount ?? 0)
        : Math.max(currentBalance - payload.refund_amount, 0);

    await supabase
      .from('customers')
      .update({ outstanding_balance: newBalance })
      .eq('id', payload.customer_id);
  }

  return createdReturn as Return;
}
