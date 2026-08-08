alter table public.store_settings
  add column if not exists barcode_force_custom_page_size boolean not null default false;
