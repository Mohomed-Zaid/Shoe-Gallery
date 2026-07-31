-- Migration: Add Instant Billing support to sale_items

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS is_instant_sale BOOLEAN DEFAULT FALSE;
