import { supabase } from './supabase';
import type { Customer, Sale, SaleItem, ProductVariant, Product } from '../types';

export interface CustomerListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface CustomerProfile extends Customer {
  total_purchases: number;
  total_amount_spent: number;
  recent_purchases: Array<
    Sale & {
      sale_items: Array<
        SaleItem & {
          variant: (ProductVariant & { product: Product | null }) | null;
        }
      >;
    }
  >;
}

export async function getCustomers(params: CustomerListParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.search?.trim()) {
    const keyword = params.search.trim();
    query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%,email.ilike.%${keyword}%`);
  }

  return query;
}

export async function getCustomerById(id: string): Promise<{ data: CustomerProfile | null; error: Error | null }> {
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (customerError || !customer) {
    return { data: null, error: (customerError as Error) ?? new Error('Customer not found') };
  }

  const { data: sales, error: salesError } = await supabase
    .from('sales')
    .select(`
      *,
      sale_items(
        *,
        variant:product_variants(
          *,
          product:products(*)
        )
      )
    `)
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (salesError) {
    return { data: null, error: salesError as Error };
  }

  const completedSales = ((sales as Sale[]) ?? []).filter((sale) => sale.status !== 'held');
  const totalAmountSpent = completedSales.reduce((sum, sale) => sum + Number(sale.total_amount ?? 0), 0);

  return {
    data: {
      ...(customer as Customer),
      total_purchases: completedSales.length,
      total_amount_spent: totalAmountSpent,
      recent_purchases: (sales as CustomerProfile['recent_purchases']) ?? [],
    },
    error: null,
  };
}

export async function createCustomer(data: Omit<Customer, 'id' | 'created_at' | 'outstanding_balance'> & { outstanding_balance?: number }) {
  return supabase
    .from('customers')
    .insert({
      ...data,
      outstanding_balance: data.outstanding_balance ?? 0,
    })
    .select()
    .single();
}

export async function updateCustomer(id: string, data: Partial<Omit<Customer, 'id' | 'created_at'>>) {
  return supabase.from('customers').update(data).eq('id', id);
}

export async function deleteCustomer(id: string) {
  return supabase.from('customers').delete().eq('id', id);
}

export async function quickCreateWalkInCustomer(name: string) {
  return createCustomer({
    name,
    phone: null,
    email: null,
    address: null,
    notes: 'Created from POS',
  });
}
