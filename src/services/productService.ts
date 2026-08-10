import { supabase } from './supabase';
import type { Product, ProductVariant, Category, Brand } from '../types';

export interface ProductWithRelations extends Product {
  category: Category | null;
  brand: Brand | null;
}

export interface POSProduct extends ProductWithRelations {
  product_variants: ProductVariant[];
}

export interface POSProductSuggestion extends ProductWithRelations {
  total_stock: number;
}

export async function getProductsWithRelations() {
  return supabase
    .from('products')
    .select(`
      *,
      category:categories(*),
      brand:brands(*)
    `)
    .order('created_at', { ascending: false });
}

export async function getProducts() {
  return supabase.from('products').select('*').order('created_at', { ascending: false });
}

export async function getProductById(id: string) {
  return supabase.from('products').select('*').eq('id', id).maybeSingle();
}

export async function createProduct(data: Omit<Product, 'id' | 'created_at'>) {
  return supabase.from('products').insert(data).select().single();
}

export async function updateProduct(id: string, data: Partial<Omit<Product, 'id' | 'created_at'>>) {
  return supabase.from('products').update(data).eq('id', id);
}

export async function deleteProduct(id: string) {
  return supabase.from('products').delete().eq('id', id);
}

export async function getProductVariants(productId: string) {
  return supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
}

export async function getAllProductVariants() {
  return supabase
    .from('product_variants')
    .select(`
      *,
      product:products(*, category:categories(*), brand:brands(*))
    `)
    .order('created_at', { ascending: false });
}

export async function getVariantByBarcode(barcodeNumber: string) {
  return supabase
    .from('product_variants')
    .select('id, barcode_number')
    .eq('barcode_number', barcodeNumber)
    .maybeSingle();
}

const posProductSelect = `
  *,
  category:categories(*),
  brand:brands(*),
  product_variants(*)
`;

export async function getPOSProductByItemNumber(itemNumber: string) {
  return supabase
    .from('products')
    .select(posProductSelect)
    .eq('item_number', itemNumber.trim())
    .eq('is_active', true)
    .maybeSingle();
}

export async function getPOSProductById(productId: string) {
  return supabase
    .from('products')
    .select(posProductSelect)
    .eq('id', productId)
    .eq('is_active', true)
    .maybeSingle();
}

export async function searchPOSProducts(query: string, limit = 8) {
  const term = query.trim().replace(/[,%()]/g, '');
  if (!term) return { data: [] as POSProductSuggestion[], error: null };

  const [{ data: productRows, error: productError }, { data: barcodeRows, error: barcodeError }] = await Promise.all([
    supabase
      .from('products')
      .select('*,category:categories(*),brand:brands(*),product_variants(stock_quantity,is_active)')
      .eq('is_active', true)
      .or(`item_number.ilike.%${term}%,code.ilike.%${term}%,name.ilike.%${term}%,item_article.ilike.%${term}%`)
      .limit(limit),
    supabase
      .from('product_variants')
      .select('product_id')
      .ilike('barcode_number', `%${term}%`)
      .eq('is_active', true)
      .limit(limit),
  ]);

  if (productError || barcodeError) return { data: [], error: productError ?? barcodeError };
  const barcodeProductIds = [...new Set((barcodeRows ?? []).map((row) => row.product_id))];
  let barcodeProducts: typeof productRows = [];
  if (barcodeProductIds.length) {
    const result = await supabase
      .from('products')
      .select('*,category:categories(*),brand:brands(*),product_variants(stock_quantity,is_active)')
      .in('id', barcodeProductIds)
      .eq('is_active', true);
    if (result.error) return { data: [], error: result.error };
    barcodeProducts = result.data ?? [];
  }

  const unique = new Map<string, any>();
  for (const product of [...(productRows ?? []), ...barcodeProducts]) unique.set(product.id, product);
  const normalized = term.toLowerCase();
  const data = [...unique.values()]
    .map((product) => ({
      ...product,
      total_stock: (product.product_variants ?? [])
        .filter((variant: ProductVariant) => variant.is_active !== false)
        .reduce((sum: number, variant: ProductVariant) => sum + Math.max(Number(variant.stock_quantity), 0), 0),
    }))
    .sort((a, b) => {
      const aNumber = a.item_number || a.code;
      const bNumber = b.item_number || b.code;
      const aExact = aNumber.toLowerCase() === normalized ? 0 : 1;
      const bExact = bNumber.toLowerCase() === normalized ? 0 : 1;
      return aExact - bExact || aNumber.localeCompare(bNumber, undefined, { numeric: true });
    })
    .slice(0, limit) as POSProductSuggestion[];

  return { data, error: null };
}

export async function searchVariants(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return { data: [], error: null };
  }

  const { data, error } = await getAllProductVariants();
  if (error) {
    return { data: [], error };
  }

  const lowerQuery = normalizedQuery.toLowerCase();
  const filtered = (data ?? []).filter((variant: ProductVariant & { product: Product | null }) => {
    const productName = variant.product?.name?.toLowerCase() ?? '';
    const productCode = (variant.product?.item_number || variant.product?.code || '').toLowerCase();
    const itemArticle = variant.product?.item_article?.toLowerCase() ?? '';
    const barcode = variant.barcode_number?.toLowerCase() ?? '';
    return productName.includes(lowerQuery)
      || productCode.includes(lowerQuery)
      || itemArticle.includes(lowerQuery)
      || barcode.includes(lowerQuery);
  });

  return { data: filtered, error: null };
}

export type CreateVariantInput = Omit<ProductVariant, 'id' | 'created_at' | 'barcode_number'> & {
  barcode_number?: string | null;
};

export async function createVariant(data: CreateVariantInput) {
  return supabase.from('product_variants').insert(data);
}

export async function updateVariant(id: string, data: Partial<Omit<ProductVariant, 'id' | 'created_at' | 'product_id' | 'barcode_number'>>) {
  return supabase.from('product_variants').update(data).eq('id', id);
}

export async function deleteVariant(id: string) {
  return supabase.from('product_variants').delete().eq('id', id);
}
