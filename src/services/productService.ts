import { supabase } from './supabase';
import type { Product, ProductVariant, Category, Brand } from '../types';

export interface ProductWithRelations extends Product {
  category: Category | null;
  brand: Brand | null;
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
    const barcode = variant.barcode_number?.toLowerCase() ?? '';
    return productName.includes(lowerQuery) || barcode.includes(lowerQuery);
  });

  return { data: filtered, error: null };
}

export async function createVariant(data: Omit<ProductVariant, 'id' | 'created_at'>) {
  return supabase.from('product_variants').insert(data);
}

export async function updateVariant(id: string, data: Partial<Omit<ProductVariant, 'id' | 'created_at' | 'product_id'>>) {
  return supabase.from('product_variants').update(data).eq('id', id);
}

export async function deleteVariant(id: string) {
  return supabase.from('product_variants').delete().eq('id', id);
}
