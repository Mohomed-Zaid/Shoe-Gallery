import { supabase } from './supabase';
import type { Brand, Category, InventoryHistory, Product, ProductVariant } from '../types';

export interface InventoryProductSummary extends Product {
  category: Category | null;
  brand: Brand | null;
  base_cost_price: number;
  base_selling_price: number;
  total_stock: number;
  stock_value: number;
}

export interface InventoryMatrixProduct extends Product {
  category: Category | null;
  brand: Brand | null;
  product_variants: ProductVariant[];
}

export interface ProductInventoryMatrixData {
  product: InventoryMatrixProduct;
  sizes: string[];
  colours: string[];
  variants: ProductVariant[];
  baseCostPrice: number;
  baseSellingPrice: number;
}

interface MatrixDimensionRow {
  dimension_type: 'size' | 'colour';
  value: string;
  created_at: string;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function dimensionsWithVariantFallback(
  dimensions: MatrixDimensionRow[],
  variants: ProductVariant[],
  type: 'size' | 'colour'
) {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const clean = value.trim();
    const key = normalized(clean);
    if (clean && !seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  };

  dimensions.filter((row) => row.dimension_type === type).forEach((row) => add(row.value));
  variants.forEach((variant) => add(type === 'size' ? variant.size : variant.color));
  return result;
}

export async function getInventoryProducts(): Promise<{ data: InventoryProductSummary[]; error: unknown }> {
  const result = await supabase
    .from('products')
    .select('*, category:categories(*), brand:brands(*), product_variants(*)')
    .order('created_at', { ascending: false });

  if (result.error) return { data: [], error: result.error };

  const data = (result.data ?? []).map((rawProduct) => {
    const product = rawProduct as InventoryMatrixProduct;
    const variants = (product.product_variants ?? []).filter((variant) => variant.is_active !== false);
    const baseCost = Number(product.base_cost_price ?? variants[0]?.cost_price ?? 0);
    const baseSelling = Number(product.base_selling_price ?? variants[0]?.selling_price ?? 0);

    return {
      ...product,
      base_cost_price: baseCost,
      base_selling_price: baseSelling,
      total_stock: variants.reduce((sum, variant) => sum + Math.max(Number(variant.stock_quantity), 0), 0),
      stock_value: variants.reduce(
        (sum, variant) => sum + Math.max(Number(variant.stock_quantity), 0) * Math.max(Number(variant.cost_price), 0),
        0
      ),
    };
  });

  return { data, error: null };
}

export async function getProductInventoryMatrix(productId: string): Promise<{ data: ProductInventoryMatrixData | null; error: unknown }> {
  const [productResult, dimensionsResult] = await Promise.all([
    supabase
      .from('products')
      .select('*, category:categories(*), brand:brands(*), product_variants(*)')
      .eq('id', productId)
      .maybeSingle(),
    supabase
      .from('inventory_matrix_dimensions')
      .select('dimension_type,value,created_at')
      .eq('product_id', productId)
      .order('created_at', { ascending: true }),
  ]);

  if (productResult.error || dimensionsResult.error || !productResult.data) {
    return {
      data: null,
      error: productResult.error ?? dimensionsResult.error ?? new Error('Product not found'),
    };
  }

  const product = productResult.data as InventoryMatrixProduct;
  const variants = (product.product_variants ?? []).filter((variant) => variant.is_active !== false);
  const dimensions = (dimensionsResult.data ?? []) as MatrixDimensionRow[];

  return {
    data: {
      product,
      sizes: dimensionsWithVariantFallback(dimensions, variants, 'size'),
      colours: dimensionsWithVariantFallback(dimensions, variants, 'colour'),
      variants,
      baseCostPrice: Number(product.base_cost_price ?? variants[0]?.cost_price ?? 0),
      baseSellingPrice: Number(product.base_selling_price ?? variants[0]?.selling_price ?? 0),
    },
    error: null,
  };
}

export async function addInventoryMatrixDimension(
  productId: string,
  dimensionType: 'size' | 'colour',
  value: string
) {
  return supabase.rpc('add_inventory_matrix_dimension', {
    p_product_id: productId,
    p_dimension_type: dimensionType,
    p_value: value.trim(),
  });
}

export async function removeInventoryMatrixDimension(
  productId: string,
  dimensionType: 'size' | 'colour',
  value: string
) {
  return supabase.rpc('remove_inventory_matrix_dimension', {
    p_product_id: productId,
    p_dimension_type: dimensionType,
    p_value: value,
  });
}

export async function setInventoryMatrixStock(
  productId: string,
  size: string,
  colour: string,
  quantity: number
) {
  return supabase.rpc('set_inventory_matrix_stock', {
    p_product_id: productId,
    p_size: size,
    p_colour: colour,
    p_quantity: Math.max(Math.trunc(quantity), 0),
  });
}

export async function getInventoryHistory() {
  return supabase
    .from('inventory_history')
    .select('*, variant:product_variants(*, product:products(*)), user:profiles(*)')
    .order('created_at', { ascending: false });
}

export async function createInventoryHistory(data: Omit<InventoryHistory, 'id' | 'created_at'>) {
  return supabase.from('inventory_history').insert(data).select().single();
}

export async function adjustStock(
  variantId: string,
  changeType: 'add' | 'remove' | 'purchase' | 'sale',
  quantity: number,
  reason?: string
) {
  const { data: variant, error: fetchError } = await supabase
    .from('product_variants')
    .select('*')
    .eq('id', variantId)
    .maybeSingle();

  if (fetchError || !variant) throw fetchError || new Error('Variant not found');

  const previousQuantity = variant.stock_quantity;
  const newQuantity = changeType === 'add' || changeType === 'purchase'
    ? previousQuantity + quantity
    : previousQuantity - quantity;

  if (newQuantity < 0) throw new Error('Not enough stock');

  const { error: updateError } = await supabase
    .from('product_variants')
    .update({ stock_quantity: newQuantity })
    .eq('id', variantId);

  if (updateError) throw updateError;

  const { data: user } = await supabase.auth.getUser();
  await createInventoryHistory({
    variant_id: variantId,
    change_type: changeType,
    quantity_changed: quantity,
    previous_quantity: previousQuantity,
    new_quantity: newQuantity,
    reason: reason || null,
    user_id: user?.user?.id || null,
  });
}
