-- ====================================================================
-- WEBRAJYA POS BASE - COMPLETE CANONICAL DATABASE RESET & SETUP SCRIPT
-- ====================================================================
-- Description: Completely resets the database back to a clean, generic
-- WebRajya POS SaaS base. Removes all old client data (Idli Junction,
-- THE XINGS KITCHEN, Bombaywala, Sagar Ratna), legacy ERP/inventory
-- tables, commission tables, and old sample orders/menu items.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. DROP ALL OBSOLETE / CLIENT-SPECIFIC / HEAVY ERP TABLES
-- --------------------------------------------------------------------
DROP TABLE IF EXISTS public.ingredients CASCADE;
DROP TABLE IF EXISTS public.recipes CASCADE;
DROP TABLE IF EXISTS public.recipe_items CASCADE;
DROP TABLE IF EXISTS public.wastage CASCADE;
DROP TABLE IF EXISTS public.purchases CASCADE;
DROP TABLE IF EXISTS public.purchase_items CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;
DROP TABLE IF EXISTS public.inventory_transactions CASCADE;
DROP TABLE IF EXISTS public.ingredient_categories CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.commissions CASCADE;
DROP TABLE IF EXISTS public.settlements CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.commission_audit_logs CASCADE;
DROP TABLE IF EXISTS public.reviews CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TABLE IF EXISTS public.printer_emulator_logs CASCADE;
DROP TABLE IF EXISTS public.cash_adjustments CASCADE;
DROP TABLE IF EXISTS public.shifts CASCADE;

-- --------------------------------------------------------------------
-- 2. DROP OR PURGE OLD POS DATA
-- --------------------------------------------------------------------
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.kots CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.tables CASCADE;
DROP TABLE IF EXISTS public.menu_items CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.restaurants CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------------------
-- 3. CREATE CLEAN WEBRAJYA POS BASE STRUCTURE
-- --------------------------------------------------------------------

-- RESTAURANTS TABLE
CREATE TABLE public.restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PROFILES / USERS TABLE (RBAC: SUPER_ADMIN, ADMIN, STAFF)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'STAFF')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MENU CATEGORIES TABLE
CREATE TABLE public.categories (
    id TEXT PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '🍽️',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- MENU ITEMS TABLE
CREATE TABLE public.menu_items (
    id TEXT PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES public.categories(id) ON DELETE SET NULL,
    category TEXT,
    name TEXT NOT NULL,
    item_name TEXT,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    image_url TEXT,
    image TEXT,
    is_available BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    is_veg BOOLEAN DEFAULT true,
    is_bestseller BOOLEAN DEFAULT false,
    is_chef_special BOOLEAN DEFAULT false,
    spiciness INTEGER DEFAULT 0,
    rating NUMERIC(3, 2) DEFAULT 4.5,
    rating_count INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLES / FLOORPLAN TABLE
CREATE TABLE public.tables (
    id TEXT PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    capacity INTEGER DEFAULT 4,
    status TEXT DEFAULT 'Available',
    seating_area TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ORDERS TABLE
CREATE TABLE public.orders (
    id TEXT PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_id TEXT REFERENCES public.tables(id) ON DELETE SET NULL,
    table_number TEXT,
    order_type TEXT NOT NULL DEFAULT 'dine-in',
    order_number TEXT,
    customer_name TEXT,
    phone_number TEXT,
    customer_phone TEXT,
    email TEXT,
    customer_email TEXT,
    address TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    gst NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    packaging_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    applied_coupon TEXT,
    grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    order_status TEXT NOT NULL DEFAULT 'New Order',
    payment_status TEXT NOT NULL DEFAULT 'Pending',
    payment_method TEXT NOT NULL DEFAULT 'Cash on Delivery',
    notes TEXT,
    fulfillment_notes TEXT,
    kot_number TEXT,
    kot_print_status TEXT DEFAULT 'Pending',
    kot_print_timestamp TIMESTAMPTZ,
    bill_print_status TEXT DEFAULT 'Pending',
    bill_print_timestamp TIMESTAMPTZ,
    source TEXT DEFAULT 'POS',
    billed_by TEXT,
    add_on_count INTEGER DEFAULT 0,
    shift_id TEXT,
    confirmed_at TIMESTAMPTZ,
    preparing_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    served_at TIMESTAMPTZ,
    packed_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    status_updated_by TEXT,
    version INTEGER DEFAULT 1,
    timeline JSONB DEFAULT '[]'::jsonb,
    split_settlements JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ORDER ITEMS TABLE
CREATE TABLE public.order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id TEXT REFERENCES public.menu_items(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    printed_kot_quantity INTEGER DEFAULT 0,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    customization TEXT,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- KOTS TABLE (Kitchen Order Tickets)
CREATE TABLE public.kots (
    id TEXT PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    kot_number TEXT NOT NULL,
    table_number TEXT,
    customer_name TEXT,
    order_type TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    quantity INTEGER DEFAULT 1,
    special_instructions TEXT,
    preparation_time INTEGER DEFAULT 15,
    printed BOOLEAN DEFAULT false,
    status TEXT NOT NULL DEFAULT 'New Order',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    printed_at TIMESTAMPTZ
);

-- PAYMENTS TABLE
CREATE TABLE public.payments (
    id TEXT PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    payment_status TEXT NOT NULL DEFAULT 'Paid',
    status TEXT DEFAULT 'Paid',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RESTAURANT SETTINGS TABLE
CREATE TABLE public.settings (
    id TEXT PRIMARY KEY DEFAULT 'singleton-config',
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'WebRajya POS',
    contact_number TEXT,
    address TEXT,
    gstin TEXT,
    fssai_number TEXT,
    tax_percentage NUMERIC(5, 2) DEFAULT 5.00,
    gst_percentage NUMERIC(5, 2) DEFAULT 5.00,
    delivery_charges NUMERIC(10, 2) DEFAULT 0.00,
    business_hours TEXT DEFAULT '10:00 AM - 10:00 PM DAILY',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDIT LOGS TABLE
CREATE TABLE public.audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_name TEXT NOT NULL DEFAULT 'System',
    "user" TEXT DEFAULT 'System',
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT DEFAULT '127.0.0.1'
);

-- SHIFTS TABLE (Register / Cash Drawer Management)
CREATE TABLE public.shifts (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    role TEXT NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    opening_cash NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    closing_cash NUMERIC(10, 2),
    expected_cash NUMERIC(10, 2),
    cash_variance NUMERIC(10, 2),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN'
);

-- CASH ADJUSTMENTS TABLE
CREATE TABLE public.cash_adjustments (
    id TEXT PRIMARY KEY,
    shift_id TEXT REFERENCES public.shifts(id) ON DELETE CASCADE,
    staff_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('PAY_IN', 'PAY_OUT')),
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------
-- 4. RESET SEQUENCES & COUNTERS
-- --------------------------------------------------------------------
DROP SEQUENCE IF EXISTS public.order_number_seq;
CREATE SEQUENCE public.order_number_seq START WITH 1;

DROP SEQUENCE IF EXISTS public.kot_number_seq;
CREATE SEQUENCE public.kot_number_seq START WITH 1;

-- --------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- --------------------------------------------------------------------
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_adjustments ENABLE ROW LEVEL SECURITY;

-- Base Row-Level Isolation Policies
CREATE POLICY "Allow public select restaurants" ON public.restaurants FOR SELECT USING (true);
CREATE POLICY "Allow public all restaurants" ON public.restaurants FOR ALL USING (true);

CREATE POLICY "Allow public select profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow public all profiles" ON public.profiles FOR ALL USING (true);

CREATE POLICY "Allow public all categories" ON public.categories FOR ALL USING (true);
CREATE POLICY "Allow public all menu_items" ON public.menu_items FOR ALL USING (true);
CREATE POLICY "Allow public all tables" ON public.tables FOR ALL USING (true);
CREATE POLICY "Allow public all orders" ON public.orders FOR ALL USING (true);
CREATE POLICY "Allow public all order_items" ON public.order_items FOR ALL USING (true);
CREATE POLICY "Allow public all kots" ON public.kots FOR ALL USING (true);
CREATE POLICY "Allow public all payments" ON public.payments FOR ALL USING (true);
CREATE POLICY "Allow public all settings" ON public.settings FOR ALL USING (true);
CREATE POLICY "Allow public all audit_logs" ON public.audit_logs FOR ALL USING (true);
CREATE POLICY "Allow public all shifts" ON public.shifts FOR ALL USING (true);
CREATE POLICY "Allow public all cash_adjustments" ON public.cash_adjustments FOR ALL USING (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- WEBRAJYA POS BASE RESET COMPLETE
-- ====================================================================

