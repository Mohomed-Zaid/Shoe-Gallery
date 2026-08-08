alter table public.store_settings
  add column if not exists receipt_orientation text not null default 'landscape'
  check (receipt_orientation in ('portrait','landscape'));

update public.store_settings
set receipt_orientation = 'landscape';
