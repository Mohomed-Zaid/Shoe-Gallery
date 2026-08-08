alter table public.store_settings
  alter column barcode_label_width_mm set default 30,
  alter column barcode_label_height_mm set default 20;

update public.store_settings
set barcode_label_width_mm = 30,
    barcode_label_height_mm = 20,
    barcode_width = case when barcode_width = 1.35 then 1 else barcode_width end,
    barcode_height = case when barcode_height = 38 then 30 else barcode_height end
where barcode_label_width_mm = 50
  and barcode_label_height_mm = 30;
