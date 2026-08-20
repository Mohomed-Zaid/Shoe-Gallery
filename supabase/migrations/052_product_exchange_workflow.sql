-- Complete product exchanges inside the existing sales_returns architecture.
ALTER TABLE public.sales_returns
  ADD COLUMN IF NOT EXISTS replacement_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difference_type TEXT,
  ADD COLUMN IF NOT EXISTS exchange_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS exchange_amount_received NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exchange_change_due NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.sales_returns
  DROP CONSTRAINT IF EXISTS sales_returns_difference_type_check,
  DROP CONSTRAINT IF EXISTS sales_returns_exchange_payment_method_check;
ALTER TABLE public.sales_returns
  ADD CONSTRAINT sales_returns_difference_type_check
    CHECK (difference_type IS NULL OR difference_type IN ('customer_pays', 'customer_refund', 'even')),
  ADD CONSTRAINT sales_returns_exchange_payment_method_check
    CHECK (exchange_payment_method IS NULL OR exchange_payment_method IN ('cash', 'card', 'bank_transfer', 'credit'));

ALTER TABLE public.sales_return_items
  ADD COLUMN IF NOT EXISTS replacement_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS replacement_selling_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS replacement_discount_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS replacement_discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replacement_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replacement_cost_price NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS replacement_product_name TEXT,
  ADD COLUMN IF NOT EXISTS replacement_barcode_number TEXT,
  ADD COLUMN IF NOT EXISTS replacement_size TEXT,
  ADD COLUMN IF NOT EXISTS replacement_colour TEXT;

ALTER TABLE public.sales_return_items
  DROP CONSTRAINT IF EXISTS sales_return_items_replacement_quantity_check;
ALTER TABLE public.sales_return_items
  ADD CONSTRAINT sales_return_items_replacement_quantity_check
    CHECK (replacement_quantity IS NULL OR replacement_quantity > 0);

CREATE OR REPLACE FUNCTION public.complete_product_exchange(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  v_sale sales%ROWTYPE;
  v_sale_item sale_items%ROWTYPE;
  v_replacement product_variants%ROWTYPE;
  v_return_id UUID;
  v_return_qty INTEGER := (p_payload->>'return_quantity')::INTEGER;
  v_replacement_qty INTEGER := (p_payload->>'replacement_quantity')::INTEGER;
  v_previously_returned INTEGER;
  v_total_sale_basis NUMERIC;
  v_credit_unit NUMERIC;
  v_return_credit NUMERIC;
  v_discount_price NUMERIC := (p_payload->>'discount_price')::NUMERIC;
  v_replacement_value NUMERIC;
  v_replacement_discount NUMERIC;
  v_difference NUMERIC;
  v_difference_amount NUMERIC;
  v_difference_type TEXT;
  v_method TEXT := NULLIF(p_payload->>'settlement_method', '');
  v_amount_received NUMERIC := COALESCE((p_payload->>'amount_received')::NUMERIC, 0);
  v_change_due NUMERIC := 0;
  v_old_stock INTEGER;
  v_total_qty INTEGER;
  v_returned_qty INTEGER;
  v_replacement_product_name TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = v_user;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_sale FROM sales WHERE id = (p_payload->>'sale_id')::UUID FOR UPDATE;
  IF NOT FOUND OR v_sale.status NOT IN ('completed', 'partially_returned') THEN
    RAISE EXCEPTION 'Sale is not exchangeable';
  END IF;

  SELECT * INTO v_sale_item FROM sale_items
  WHERE id = (p_payload->>'sale_item_id')::UUID AND sale_id = v_sale.id FOR UPDATE;
  IF NOT FOUND OR v_sale_item.variant_id IS NULL THEN RAISE EXCEPTION 'Invalid exchange item'; END IF;

  SELECT COALESCE(SUM(sri.quantity_returned), 0) INTO v_previously_returned
  FROM sales_return_items sri
  JOIN sales_returns sr ON sr.id = sri.return_id
  WHERE sri.sale_item_id = v_sale_item.id AND sr.status = 'completed';
  IF v_return_qty <= 0 OR v_return_qty > v_sale_item.quantity - v_previously_returned THEN
    RAISE EXCEPTION 'Exchange quantity exceeds remaining quantity';
  END IF;

  SELECT * INTO v_replacement FROM product_variants
  WHERE id = (p_payload->>'replacement_variant_id')::UUID AND is_active IS DISTINCT FROM FALSE
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Replacement variant is not available'; END IF;
  IF v_replacement_qty <= 0 OR v_replacement_qty > v_replacement.stock_quantity THEN
    RAISE EXCEPTION 'Insufficient replacement stock';
  END IF;
  IF v_replacement.selling_price IS NULL OR v_discount_price < 0 OR v_discount_price > v_replacement.selling_price THEN
    RAISE EXCEPTION 'Replacement discount price must be between zero and the selling price';
  END IF;

  SELECT COALESCE(SUM(COALESCE(line_total, selling_price * quantity)), 0)
  INTO v_total_sale_basis FROM sale_items WHERE sale_id = v_sale.id;
  v_credit_unit := ROUND(GREATEST((
    COALESCE(v_sale_item.line_total, v_sale_item.selling_price * v_sale_item.quantity)
    - CASE WHEN v_total_sale_basis > 0
      THEN v_sale.invoice_discount_amount * COALESCE(v_sale_item.line_total, v_sale_item.selling_price * v_sale_item.quantity) / v_total_sale_basis
      ELSE 0 END
  ) / v_sale_item.quantity, 0), 2);
  v_return_credit := ROUND(v_credit_unit * v_return_qty, 2);
  v_replacement_value := ROUND(v_discount_price * v_replacement_qty, 2);
  v_replacement_discount := ROUND((v_replacement.selling_price - v_discount_price) * v_replacement_qty, 2);
  v_difference := ROUND(v_replacement_value - v_return_credit, 2);
  v_difference_amount := ABS(v_difference);
  v_difference_type := CASE WHEN v_difference > 0 THEN 'customer_pays' WHEN v_difference < 0 THEN 'customer_refund' ELSE 'even' END;

  IF v_difference_type = 'customer_pays' THEN
    IF v_method NOT IN ('cash', 'card', 'bank_transfer', 'credit') THEN RAISE EXCEPTION 'Select a payment method'; END IF;
    IF v_method = 'credit' AND v_sale.customer_id IS NULL THEN RAISE EXCEPTION 'Credit exchange requires a registered customer'; END IF;
    IF v_method = 'cash' AND v_amount_received < v_difference_amount THEN RAISE EXCEPTION 'Amount received is less than the amount due'; END IF;
    v_change_due := CASE WHEN v_method = 'cash' THEN v_amount_received - v_difference_amount ELSE 0 END;
  ELSIF v_difference_type = 'customer_refund' THEN
    IF v_method = 'original_payment_method' THEN
      v_method := CASE WHEN v_sale.payment_method IN ('cash', 'card', 'bank_transfer') THEN v_sale.payment_method ELSE 'cash' END;
    END IF;
    IF v_method NOT IN ('cash', 'card', 'bank_transfer') THEN RAISE EXCEPTION 'Select a refund method'; END IF;
    IF v_method IN ('card', 'bank_transfer') AND COALESCE(p_payload->>'reference', '') = '' THEN RAISE EXCEPTION 'Refund reference is required'; END IF;
  ELSE
    v_method := NULL;
    v_amount_received := 0;
  END IF;

  IF v_method = 'cash' AND NOT EXISTS (
    SELECT 1 FROM cash_register_sessions WHERE user_id = v_user AND status = 'open'
  ) THEN RAISE EXCEPTION 'Open the cash register before processing a cash exchange'; END IF;

  SELECT p.name INTO v_replacement_product_name
  FROM products p WHERE p.id = v_replacement.product_id;

  INSERT INTO sales_returns (
    sale_id, customer_id, return_type, reason, notes, refund_method, refund_amount,
    additional_payment, replacement_value, difference_amount, difference_type,
    exchange_payment_method, exchange_amount_received, exchange_change_due,
    refund_reference, status, created_by, approved_by
  ) VALUES (
    v_sale.id, v_sale.customer_id, 'product_exchange', TRIM(p_payload->>'reason'), NULLIF(p_payload->>'notes', ''),
    CASE WHEN v_difference_type = 'customer_refund' THEN v_method ELSE NULL END,
    CASE WHEN v_difference_type = 'customer_refund' THEN v_difference_amount ELSE 0 END,
    CASE WHEN v_difference_type = 'customer_pays' THEN v_difference_amount ELSE 0 END,
    v_replacement_value, v_difference_amount, v_difference_type,
    CASE WHEN v_difference_type = 'customer_pays' THEN v_method ELSE NULL END,
    v_amount_received, v_change_due, NULLIF(p_payload->>'reference', ''),
    'completed', v_user, CASE WHEN v_role = 'admin' THEN v_user ELSE NULL END
  ) RETURNING id INTO v_return_id;

  INSERT INTO sales_return_items (
    return_id, sale_item_id, original_variant_id, replacement_variant_id, product_name,
    barcode_number, size, colour, quantity_returned, original_quantity,
    previously_returned_quantity, cost_price_at_sale, selling_price_at_sale,
    original_item_discount, return_unit_value, return_total, return_condition, restock_item,
    replacement_quantity, replacement_selling_price, replacement_discount_price,
    replacement_discount_amount, replacement_value, replacement_cost_price,
    replacement_product_name, replacement_barcode_number, replacement_size, replacement_colour
  )
  SELECT v_return_id, v_sale_item.id, v_sale_item.variant_id, v_replacement.id,
    COALESCE(p.name, v_sale_item.product_name, v_sale_item.product_name_snapshot, 'Unknown product'),
    pv.barcode_number, COALESCE(pv.size, v_sale_item.size_snapshot), COALESCE(pv.color, v_sale_item.color_snapshot),
    v_return_qty, v_sale_item.quantity, v_previously_returned,
    COALESCE(v_sale_item.cost_price_at_sale, v_sale_item.cost_price), v_sale_item.selling_price,
    v_sale_item.discount_amount, v_credit_unit, v_return_credit, p_payload->>'condition',
    COALESCE((p_payload->>'restock')::BOOLEAN, FALSE), v_replacement_qty,
    v_replacement.selling_price, v_discount_price, v_replacement_discount,
    v_replacement_value, v_replacement.cost_price, v_replacement_product_name,
    v_replacement.barcode_number, v_replacement.size, v_replacement.color
  FROM (SELECT 1) z
  LEFT JOIN product_variants pv ON pv.id = v_sale_item.variant_id
  LEFT JOIN products p ON p.id = pv.product_id;

  IF COALESCE((p_payload->>'restock')::BOOLEAN, FALSE) THEN
    SELECT stock_quantity INTO v_old_stock FROM product_variants WHERE id = v_sale_item.variant_id;
    UPDATE product_variants SET stock_quantity = stock_quantity + v_return_qty WHERE id = v_sale_item.variant_id;
    INSERT INTO inventory_history (variant_id, change_type, quantity_changed, previous_quantity, new_quantity, reason, user_id)
    VALUES (v_sale_item.variant_id, 'sales_return', v_return_qty, v_old_stock, v_old_stock + v_return_qty, 'Exchange return ' || v_return_id, v_user);
  END IF;

  UPDATE product_variants SET stock_quantity = stock_quantity - v_replacement_qty WHERE id = v_replacement.id;
  INSERT INTO inventory_history (variant_id, change_type, quantity_changed, previous_quantity, new_quantity, reason, user_id)
  VALUES (v_replacement.id, 'exchange_out', -v_replacement_qty, v_replacement.stock_quantity, v_replacement.stock_quantity - v_replacement_qty, 'Exchange replacement ' || v_return_id, v_user);

  IF v_difference_type = 'customer_refund' THEN
    INSERT INTO sale_refunds (return_id, sale_id, customer_id, refund_method, amount, reference_number, refunded_by, notes)
    VALUES (v_return_id, v_sale.id, v_sale.customer_id, v_method, v_difference_amount, NULLIF(p_payload->>'reference', ''), v_user, p_payload->>'notes');
  ELSIF v_difference_type = 'customer_pays' AND v_method = 'credit' THEN
    UPDATE customers SET outstanding_balance = outstanding_balance + v_difference_amount WHERE id = v_sale.customer_id;
  ELSIF v_difference_type = 'customer_pays' THEN
    INSERT INTO sale_payments (sale_id, payment_method, amount, reference_number, payment_date, received_by, notes)
    VALUES (v_sale.id, v_method, v_difference_amount, NULLIF(p_payload->>'reference', ''), NOW(), v_user, 'Exchange top-up ' || v_return_id);
  END IF;

  INSERT INTO returns (id, sale_id, customer_id, return_type, refund_amount, store_credit_amount, created_by, created_at)
  VALUES (v_return_id, v_sale.id, v_sale.customer_id, 'product_exchange', v_return_credit, 0, v_user, NOW());
  INSERT INTO return_items (return_id, variant_id, quantity, reason)
  VALUES (v_return_id, v_sale_item.variant_id, v_return_qty, p_payload->>'reason');

  SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty FROM sale_items WHERE sale_id = v_sale.id;
  SELECT COALESCE(SUM(sri.quantity_returned), 0) INTO v_returned_qty
  FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id
  JOIN sale_items si ON si.id = sri.sale_item_id
  WHERE si.sale_id = v_sale.id AND sr.status = 'completed';
  UPDATE sales SET status = CASE WHEN v_returned_qty >= v_total_qty THEN 'fully_returned' ELSE 'partially_returned' END WHERE id = v_sale.id;

  INSERT INTO return_audit_log (return_id, sale_id, action, actor_id, reason, new_values)
  VALUES (v_return_id, v_sale.id, 'product_exchange_completed', v_user, p_payload->>'reason', p_payload);
  RETURN v_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_product_exchange(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_product_exchange(JSONB) TO authenticated;
