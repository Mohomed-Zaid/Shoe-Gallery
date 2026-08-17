export type InventoryStockStatus = 'negative_stock' | 'out_of_stock' | 'low_stock' | 'in_stock';
export type InventoryReportSort = 'product_asc' | 'product_desc' | 'stock_desc' | 'stock_asc' | 'cost_value_desc' | 'cost_value_asc' | 'selling_value_desc' | 'selling_value_asc' | 'status_asc';
export type InventoryReportPageSize = 25 | 50 | 100;

export interface InventoryReportFilters {
  search: string;
  categoryId: string;
  brandId: string;
  stockStatus: string;
}

export interface InventoryReportRow {
  product_id: string;
  product_code: string;
  product_name: string;
  item_article: string | null;
  category_id: string | null;
  category_name: string;
  brand_id: string | null;
  brand_name: string;
  description: string | null;
  variant_count: number;
  total_stock: number;
  min_cost: number | null;
  max_cost: number | null;
  min_selling: number | null;
  max_selling: number | null;
  cost_value: number;
  selling_value: number;
  potential_profit: number;
  low_stock_count: number;
  out_of_stock_count: number;
  negative_stock_count: number;
  missing_cost_count: number;
  missing_selling_count: number;
  missing_barcode_count: number;
  stock_status: InventoryStockStatus;
}

export interface InventoryReportSummary {
  total_products: number;
  total_variants: number;
  total_stock: number;
  cost_value: number;
  selling_value: number;
  potential_profit: number;
  low_stock_variants: number;
  out_of_stock_variants: number;
  missing_cost: number;
  missing_selling: number;
  missing_barcode: number;
  negative_stock: number;
  low_stock_threshold: number;
}

export interface InventoryReportResult { rows: InventoryReportRow[]; total: number; summary: InventoryReportSummary; }
export interface InventoryReportOptions { categories: Array<{ id: string; name: string }>; brands: Array<{ id: string; name: string }>; }

export interface InventoryReportVariant {
  id: string; product_id: string; product_name: string; item_article: string | null;
  size: string; color: string; barcode_number: string | null; stock_quantity: number;
  cost_price: number | null; selling_price: number | null; cost_value: number | null;
  selling_value: number | null; stock_status: InventoryStockStatus;
}

export interface InventoryReportDetail { product: InventoryReportRow; variants: InventoryReportVariant[]; }
export interface InventoryReportExportData extends InventoryReportResult { variants: InventoryReportVariant[]; generatedAt: string; }
