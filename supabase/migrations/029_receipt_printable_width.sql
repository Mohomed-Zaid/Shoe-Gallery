alter table public.store_settings
  add column if not exists receipt_printable_width_mm numeric(5,2) not null default 72,
  add column if not exists receipt_horizontal_offset_mm numeric(5,2) not null default 0;

alter table public.store_settings
  alter column receipt_left_padding_mm set default 2,
  alter column receipt_right_padding_mm set default 3,
  alter column receipt_font_size_px set default 10;
