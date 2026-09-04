-- PostgreSQL / Supabase Schema for Cash-In Multi-Tenant Transaction Tracker

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    company_code TEXT NOT NULL UNIQUE,
    city TEXT NOT NULL,
    business_type TEXT NOT NULL DEFAULT 'restaurant',
    base_currency TEXT NOT NULL DEFAULT 'SLSH',
    exchange_rates_json TEXT NOT NULL DEFAULT '{"USD_TO_SLSH":11000,"USD_TO_ETB":120}',
    subscription_plan TEXT NOT NULL DEFAULT 'Starter',
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'SLSH',
    sender TEXT NOT NULL DEFAULT '',
    sender_number TEXT,
    receiver TEXT NOT NULL DEFAULT '',
    receiver_number TEXT,
    provider TEXT NOT NULL DEFAULT '',
    transaction_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    balance NUMERIC,
    type TEXT NOT NULL DEFAULT 'Received',
    category TEXT,
    classification_data TEXT,
    is_classified INTEGER NOT NULL DEFAULT 0,
    raw_sms TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS business_items (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transaction_allocations (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    allocation_type TEXT NOT NULL DEFAULT 'general',
    target_currency TEXT NOT NULL,
    original_allocated_amount NUMERIC NOT NULL,
    converted_amount NUMERIC NOT NULL,
    exchange_rate NUMERIC NOT NULL DEFAULT 1.0,
    delivery_method TEXT NOT NULL DEFAULT 'cash_hand',
    item_id INTEGER REFERENCES business_items(id) ON DELETE SET NULL,
    item_name TEXT,
    item_quantity INTEGER DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    transaction_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'SLSH',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    paid_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, transaction_id)
);
