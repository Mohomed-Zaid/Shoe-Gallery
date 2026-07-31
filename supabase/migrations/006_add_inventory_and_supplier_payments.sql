-- Create inventory_history table
CREATE TABLE IF NOT EXISTS inventory_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('add', 'remove', 'purchase', 'sale')),
    quantity_changed INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on inventory_history
ALTER TABLE inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory history" ON inventory_history
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage inventory history" ON inventory_history
    FOR ALL USING (public.is_admin());

-- Create supplier_payments table
CREATE TABLE IF NOT EXISTS supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on supplier_payments
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view supplier payments" ON supplier_payments
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage supplier payments" ON supplier_payments
    FOR ALL USING (public.is_admin());
