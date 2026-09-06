from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Optional

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL_ENV_KEYS = ("SUPABASE_DB_URL", "DATABASE_URL")

# SQLite local DB path (next to this file)
SQLITE_PATH = Path(__file__).parent / "transactions.db"


# ─── Backend detection ────────────────────────────────────────────────────────

def _get_db_url() -> Optional[str]:
    for key in DB_URL_ENV_KEYS:
        value = os.environ.get(key, "").strip()
        if value:
            return value
    return None


def using_postgres() -> bool:
    return bool(_get_db_url())


def using_sqlite() -> bool:
    return not using_postgres()


# ─── Postgres helpers ─────────────────────────────────────────────────────────

def _connect():
    db_url = _get_db_url()
    if not db_url:
        raise RuntimeError("No Postgres URL configured")
    return psycopg2.connect(db_url, cursor_factory=RealDictCursor)


# ─── SQLite helpers ───────────────────────────────────────────────────────────

def _sqlite() -> sqlite3.Connection:
    conn = sqlite3.connect(str(SQLITE_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _row_to_dict(row) -> dict:
    if row is None:
        return None
    return dict(row)


def _rows_to_dicts(rows) -> list[dict]:
    return [dict(r) for r in rows]


# ─── Init ─────────────────────────────────────────────────────────────────────

def init_db() -> None:
    if using_postgres():
        schema_path = Path(__file__).parent / "supabase_schema.sql"
        if not schema_path.exists():
            print("[OK] Database initialized (no schema file found).")
            return
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(schema_path.read_text(encoding="utf-8"))
                # PostgreSQL migrations for missing columns in existing tables
                cur.execute("""
                    ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'restaurant';
                    ALTER TABLE companies ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'SLSH';
                    ALTER TABLE companies ADD COLUMN IF NOT EXISTS exchange_rates_json TEXT NOT NULL DEFAULT '{"USD_TO_SLSH":11000,"USD_TO_ETB":120}';
                    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category TEXT;
                    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS classification_data TEXT;
                    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_classified INTEGER NOT NULL DEFAULT 0;
                    ALTER TABLE business_items ADD COLUMN IF NOT EXISTS sku TEXT DEFAULT '';
                    ALTER TABLE business_items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
                    CREATE TABLE IF NOT EXISTS employees (
                        id SERIAL PRIMARY KEY,
                        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                        name TEXT NOT NULL,
                        phone TEXT NOT NULL DEFAULT '',
                        role TEXT NOT NULL DEFAULT 'Cashier',
                        pin_code TEXT NOT NULL DEFAULT '1234',
                        permissions_json TEXT NOT NULL DEFAULT '{"can_classify":true,"can_view_reports":true,"can_manage_items":false,"can_delete":false}',
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    CREATE TABLE IF NOT EXISTS employee_attendance (
                        id SERIAL PRIMARY KEY,
                        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
                        action TEXT NOT NULL,
                        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        notes TEXT DEFAULT ''
                    );
                    CREATE INDEX IF NOT EXISTS idx_transactions_comp_time ON transactions(company_id, timestamp);
                    CREATE INDEX IF NOT EXISTS idx_transactions_comp_id ON transactions(company_id, id);
                    CREATE INDEX IF NOT EXISTS idx_allocations_comp_tx ON transaction_allocations(company_id, transaction_id);
                    CREATE INDEX IF NOT EXISTS idx_audit_comp_time ON audit_logs(company_id, created_at);
                    CREATE INDEX IF NOT EXISTS idx_items_comp ON business_items(company_id);
                    CREATE INDEX IF NOT EXISTS idx_invoices_comp_status ON invoices(company_id, status);
                    CREATE INDEX IF NOT EXISTS idx_employees_comp ON employees(company_id);
                    CREATE INDEX IF NOT EXISTS idx_attendance_comp ON employee_attendance(company_id, timestamp);
                """)
            conn.commit()
        print("[OK] Database initialized (PostgreSQL with migrations).")
        return

    # SQLite: create tables locally
    with _sqlite() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT NOT NULL,
                company_code TEXT NOT NULL UNIQUE,
                city TEXT NOT NULL,
                business_type TEXT NOT NULL DEFAULT 'restaurant',
                base_currency TEXT NOT NULL DEFAULT 'SLSH',
                exchange_rates_json TEXT NOT NULL DEFAULT '{"USD_TO_SLSH":11000,"USD_TO_ETB":120}',
                subscription_plan TEXT NOT NULL DEFAULT 'Starter',
                password_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id),
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'SLSH',
                sender TEXT NOT NULL DEFAULT '',
                sender_number TEXT,
                receiver TEXT NOT NULL DEFAULT '',
                receiver_number TEXT,
                provider TEXT NOT NULL DEFAULT '',
                transaction_id TEXT,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                balance REAL,
                type TEXT NOT NULL DEFAULT 'Received',
                category TEXT,
                classification_data TEXT,
                is_classified INTEGER NOT NULL DEFAULT 0,
                raw_sms TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(company_id, transaction_id)
            );

            CREATE TABLE IF NOT EXISTS business_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                category TEXT NOT NULL,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'USD',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS transaction_allocations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                allocation_type TEXT NOT NULL DEFAULT 'general',
                target_currency TEXT NOT NULL,
                original_allocated_amount REAL NOT NULL,
                converted_amount REAL NOT NULL,
                exchange_rate REAL NOT NULL DEFAULT 1.0,
                delivery_method TEXT NOT NULL DEFAULT 'cash_hand',
                item_id INTEGER REFERENCES business_items(id),
                item_name TEXT,
                item_quantity INTEGER DEFAULT 1,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                transaction_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                changed_by TEXT NOT NULL,
                old_values TEXT,
                new_values TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id),
                invoice_number TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'SLSH',
                description TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                paid_at TEXT,
                paid_transaction_id INTEGER
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL DEFAULT 1 REFERENCES companies(id),
                transaction_id INTEGER NOT NULL REFERENCES transactions(id),
                read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(company_id, transaction_id)
            );

            CREATE TABLE IF NOT EXISTS employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'Cashier',
                pin_code TEXT NOT NULL DEFAULT '1234',
                permissions_json TEXT NOT NULL DEFAULT '{"can_classify":true,"can_view_reports":true,"can_manage_items":false,"can_delete":false}',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS employee_attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                employee_id INTEGER NOT NULL REFERENCES employees(id),
                action TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                notes TEXT DEFAULT ''
            );
        """)

        # Migration check for existing SQLite tables
        cursor = conn.cursor()
        
        # Check companies
        cursor.execute("PRAGMA table_info(companies)")
        comp_cols = [col[1] for col in cursor.fetchall()]
        if "business_type" not in comp_cols:
            conn.execute("ALTER TABLE companies ADD COLUMN business_type TEXT NOT NULL DEFAULT 'restaurant'")
        if "base_currency" not in comp_cols:
            conn.execute("ALTER TABLE companies ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'SLSH'")
        if "exchange_rates_json" not in comp_cols:
            conn.execute("ALTER TABLE companies ADD COLUMN exchange_rates_json TEXT NOT NULL DEFAULT '{\"USD_TO_SLSH\":11000,\"USD_TO_ETB\":120}'")

        # Check transactions
        cursor.execute("PRAGMA table_info(transactions)")
        tx_cols = [col[1] for col in cursor.fetchall()]
        if "company_id" not in tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1")
        if "category" not in tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN category TEXT")
        if "classification_data" not in tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN classification_data TEXT")
        if "is_classified" not in tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN is_classified INTEGER NOT NULL DEFAULT 0")

        # Check invoices
        cursor.execute("PRAGMA table_info(invoices)")
        inv_cols = [col[1] for col in cursor.fetchall()]
        if "company_id" not in inv_cols:
            conn.execute("ALTER TABLE invoices ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1")

        # Check notifications
        cursor.execute("PRAGMA table_info(notifications)")
        notif_cols = [col[1] for col in cursor.fetchall()]
        if "company_id" not in notif_cols:
            conn.execute("ALTER TABLE notifications ADD COLUMN company_id INTEGER NOT NULL DEFAULT 1")

        # Check business_items
        cursor.execute("PRAGMA table_info(business_items)")
        item_cols = [col[1] for col in cursor.fetchall()]
        if "sku" not in item_cols:
            conn.execute("ALTER TABLE business_items ADD COLUMN sku TEXT DEFAULT ''")
        if "description" not in item_cols:
            conn.execute("ALTER TABLE business_items ADD COLUMN description TEXT DEFAULT ''")

        # SQLite Indexes for fast querying
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_transactions_comp_time ON transactions(company_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_transactions_comp_id ON transactions(company_id, id);
            CREATE INDEX IF NOT EXISTS idx_allocations_comp_tx ON transaction_allocations(company_id, transaction_id);
            CREATE INDEX IF NOT EXISTS idx_audit_comp_time ON audit_logs(company_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_items_comp ON business_items(company_id);
            CREATE INDEX IF NOT EXISTS idx_invoices_comp_status ON invoices(company_id, status);
            CREATE INDEX IF NOT EXISTS idx_employees_comp ON employees(company_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_comp ON employee_attendance(company_id, timestamp);
        """)

    print("[OK] Database initialized (SQLite local mode with business extensions & indexes).")


# ─── Companies ────────────────────────────────────────────────────────────────

def get_company_by_code(company_code: str) -> Optional[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, company_name, company_code, city, business_type, base_currency,
                           exchange_rates_json, subscription_plan, password_hash, status, created_at
                    from companies
                    where company_code = %s
                    """,
                    (company_code,),
                )
                row = cur.fetchone()
                return dict(row) if row else None

    with _sqlite() as conn:
        row = conn.execute(
            "SELECT * FROM companies WHERE company_code = ?", (company_code,)
        ).fetchone()
        return _row_to_dict(row)


def get_company_by_id(company_id: int) -> Optional[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, company_name, company_code, city, business_type, base_currency,
                           exchange_rates_json, subscription_plan, password_hash, status, created_at
                    from companies
                    where id = %s
                    """,
                    (company_id,),
                )
                row = cur.fetchone()
                return dict(row) if row else None

    with _sqlite() as conn:
        row = conn.execute(
            "SELECT * FROM companies WHERE id = ?", (company_id,)
        ).fetchone()
        return _row_to_dict(row)


def list_companies() -> list[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, company_name, company_code, city, business_type, base_currency,
                           exchange_rates_json, subscription_plan, status, created_at
                    from companies
                    where status = 'active'
                    order by created_at asc
                    """
                )
                return [dict(row) for row in cur.fetchall()]

    with _sqlite() as conn:
        rows = conn.execute(
            "SELECT * FROM companies WHERE status = 'active' ORDER BY created_at ASC"
        ).fetchall()
        return _rows_to_dicts(rows)


def _get_starter_items(business_type: str) -> list[tuple[str, str, float, str]]:
    if business_type == "money_exchange":
        return [
            ("FX Services", "USD Cash Exchange", 0.0, "USD"),
            ("FX Services", "SLSH Cash Out", 0.0, "SLSH"),
            ("FX Services", "Exchange Commission Fee", 1.0, "USD"),
            ("Remittance", "Hawala / Money Transfer", 2.0, "USD"),
            ("Remittance", "Merchant Settlement", 0.0, "USD"),
        ]
    elif business_type == "pharmacy":
        return [
            ("Medicines", "Panadol / Paracetamol", 1.0, "USD"),
            ("Medicines", "Amoxicillin", 3.5, "USD"),
            ("Medicines", "Cough Syrup", 2.5, "USD"),
            ("Supplies", "Bandages & First Aid", 2.0, "USD"),
            ("Supplies", "Face Masks (Pack)", 1.5, "USD"),
            ("Health", "Multivitamins", 5.0, "USD"),
        ]
    elif business_type == "retail":
        return [
            ("General", "T-Shirt / Clothes", 8.0, "USD"),
            ("General", "Shoes / Footwear", 15.0, "USD"),
            ("Electronics", "Phone Charger", 5.0, "USD"),
            ("Electronics", "Earphones", 4.0, "USD"),
            ("Groceries", "Cooking Oil", 3.0, "USD"),
            ("Groceries", "Rice (5kg)", 6.0, "USD"),
        ]
    # Default: restaurant
    return [
        ("Food", "Burger", 5.0, "USD"),
        ("Food", "Pizza", 7.0, "USD"),
        ("Food", "Chicken Meal", 6.0, "USD"),
        ("Food", "Pasta", 4.5, "USD"),
        ("Drinks", "Coke / Soda", 1.0, "USD"),
        ("Drinks", "Mineral Water", 0.5, "USD"),
        ("Drinks", "Fresh Juice", 2.0, "USD"),
        ("Drinks", "Coffee / Somali Tea", 0.5, "USD"),
    ]


def create_company(
    company_name: str,
    company_code: str,
    city: str,
    subscription_plan: str,
    password_hash: str,
    status: str,
    business_type: str = "restaurant",
    base_currency: str = "SLSH",
    exchange_rates_json: Optional[str] = None,
    telegram_api_id: Optional[str] = None,
    telegram_api_hash: Optional[str] = None,
) -> dict[str, Any]:
    rates = exchange_rates_json or json.dumps({"USD_TO_SLSH": 11000, "USD_TO_ETB": 120})

    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into companies
                        (company_name, company_code, city, business_type, base_currency, exchange_rates_json, subscription_plan, password_hash, status)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    returning id, company_name, company_code, city, business_type, base_currency, exchange_rates_json, subscription_plan, status, created_at
                    """,
                    (company_name, company_code, city, business_type, base_currency, rates, subscription_plan, password_hash, status),
                )
                row = cur.fetchone()
                company_id = int(row["id"])

                # Seed initial starter items
                for cat, name, price, cur_code in _get_starter_items(business_type):
                    cur.execute(
                        "insert into business_items (company_id, category, name, price, currency) values (%s, %s, %s, %s, %s)",
                        (company_id, cat, name, price, cur_code),
                    )
            conn.commit()
            return dict(row)

    with _sqlite() as conn:
        cur = conn.execute(
            """
            INSERT INTO companies (company_name, company_code, city, business_type, base_currency, exchange_rates_json, subscription_plan, password_hash, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (company_name, company_code, city, business_type, base_currency, rates, subscription_plan, password_hash, status),
        )
        company_id = cur.lastrowid

        # Seed initial starter items based on business type
        for cat, name, price, cur_code in _get_starter_items(business_type):
            conn.execute(
                "INSERT INTO business_items (company_id, category, name, price, currency) VALUES (?, ?, ?, ?, ?)",
                (company_id, cat, name, price, cur_code),
            )

        conn.commit()
        row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
        return _row_to_dict(row)


def update_company_settings(
    company_id: int,
    business_type: Optional[str] = None,
    base_currency: Optional[str] = None,
    exchange_rates_json: Optional[str] = None,
) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                updates = []
                params = []
                if business_type:
                    updates.append("business_type = %s")
                    params.append(business_type)
                if base_currency:
                    updates.append("base_currency = %s")
                    params.append(base_currency)
                if exchange_rates_json:
                    updates.append("exchange_rates_json = %s")
                    params.append(exchange_rates_json)
                if updates:
                    params.append(company_id)
                    cur.execute(f"update companies set {', '.join(updates)} where id = %s", tuple(params))
            conn.commit()
            return

    with _sqlite() as conn:
        updates = []
        params = []
        if business_type:
            updates.append("business_type = ?")
            params.append(business_type)
        if base_currency:
            updates.append("base_currency = ?")
            params.append(base_currency)
        if exchange_rates_json:
            updates.append("exchange_rates_json = ?")
            params.append(exchange_rates_json)
        if updates:
            params.append(company_id)
            conn.execute(f"UPDATE companies SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()


def get_next_company_code_number(prefix: str) -> int:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select max(cast(substring(company_code from %s) as integer)) as max_num
                    from companies
                    where company_code ~ %s
                    """,
                    (f"^{prefix}(\\d+)$", f"^{prefix}[0-9]+$"),
                )
                row = cur.fetchone()
                max_num = row["max_num"] if row and row.get("max_num") is not None else 0
                return int(max_num) + 1

    with _sqlite() as conn:
        rows = conn.execute(
            "SELECT company_code FROM companies WHERE company_code LIKE ?", (f"{prefix}%",)
        ).fetchall()
    max_num = 0
    for row in rows:
        code = row["company_code"] or ""
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", code)
        if match:
            max_num = max(max_num, int(match.group(1)))
    return max_num + 1


# ─── Business Items (Menu / Products / Catalog) ───────────────────────────────

def get_business_items(company_id: int, active_only: bool = True) -> list[dict[str, Any]]:
    cond = "AND is_active = 1" if active_only else ""
    comp = get_company_by_id(company_id)
    b_type = comp.get("business_type", "restaurant") if comp else "restaurant"

    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"select * from business_items where company_id = %s {cond} order by category, name",
                    (company_id,),
                )
                items = [dict(row) for row in cur.fetchall()]
                # If money_exchange company has old restaurant starter items, cleanly upgrade them to FX services
                if b_type == "money_exchange" and items and any(it.get("name") in ["Burger", "Pizza", "Chicken Meal", "Coffee / Somali Tea"] for it in items):
                    cur.execute("delete from business_items where company_id = %s", (company_id,))
                    for cat, name, price, cur_code in _get_starter_items("money_exchange"):
                        cur.execute(
                            "insert into business_items (company_id, category, name, price, currency) values (%s, %s, %s, %s, %s)",
                            (company_id, cat, name, price, cur_code),
                        )
                    conn.commit()
                    cur.execute(f"select * from business_items where company_id = %s {cond} order by category, name", (company_id,))
                    items = [dict(row) for row in cur.fetchall()]
                return items

    with _sqlite() as conn:
        rows = conn.execute(
            f"SELECT * FROM business_items WHERE company_id = ? {cond} ORDER BY category, name",
            (company_id,),
        ).fetchall()
        items = _rows_to_dicts(rows)
        if b_type == "money_exchange" and items and any(it.get("name") in ["Burger", "Pizza", "Chicken Meal", "Coffee / Somali Tea"] for it in items):
            conn.execute("DELETE FROM business_items WHERE company_id = ?", (company_id,))
            for cat, name, price, cur_code in _get_starter_items("money_exchange"):
                conn.execute(
                    "INSERT INTO business_items (company_id, category, name, price, currency) VALUES (?, ?, ?, ?, ?)",
                    (company_id, cat, name, price, cur_code),
                )
            conn.commit()
            rows = conn.execute(
                f"SELECT * FROM business_items WHERE company_id = ? {cond} ORDER BY category, name",
                (company_id,),
            ).fetchall()
            items = _rows_to_dicts(rows)
        return items


def create_business_item(company_id: int, category: str, name: str, price: float, currency: str = "USD", sku: str = "", description: str = "") -> int:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into business_items (company_id, category, name, price, currency, sku, description)
                    values (%s, %s, %s, %s, %s, %s, %s)
                    returning id
                    """,
                    (company_id, category.strip(), name.strip(), price, currency.strip().upper(), sku.strip(), description.strip()),
                )
                row = cur.fetchone()
            conn.commit()
            return int(row["id"])

    with _sqlite() as conn:
        cur = conn.execute(
            "INSERT INTO business_items (company_id, category, name, price, currency, sku, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (company_id, category.strip(), name.strip(), price, currency.strip().upper(), sku.strip(), description.strip()),
        )
        conn.commit()
        return cur.lastrowid


def create_business_items_bulk(company_id: int, items: list[dict[str, Any]]) -> int:
    """Inserts a batch of business catalog items efficiently."""
    if not items:
        return 0

    inserted_count = 0
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                for it in items:
                    name = str(it.get("name") or "").strip()
                    if not name:
                        continue
                    cat = str(it.get("category") or "General").strip()
                    price = float(it.get("price") or 0.0)
                    cur_code = str(it.get("currency") or "USD").strip().upper()
                    sku = str(it.get("sku") or "").strip()
                    desc = str(it.get("description") or "").strip()
                    cur.execute(
                        """
                        insert into business_items (company_id, category, name, price, currency, sku, description)
                        values (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (company_id, cat, name, price, cur_code, sku, desc),
                    )
                    inserted_count += 1
            conn.commit()
        return inserted_count

    with _sqlite() as conn:
        for it in items:
            name = str(it.get("name") or "").strip()
            if not name:
                continue
            cat = str(it.get("category") or "General").strip()
            price = float(it.get("price") or 0.0)
            cur_code = str(it.get("currency") or "USD").strip().upper()
            sku = str(it.get("sku") or "").strip()
            desc = str(it.get("description") or "").strip()
            conn.execute(
                "INSERT INTO business_items (company_id, category, name, price, currency, sku, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (company_id, cat, name, price, cur_code, sku, desc),
            )
            inserted_count += 1
        conn.commit()
    return inserted_count



def delete_business_item(company_id: int, item_id: int) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from business_items where id = %s and company_id = %s", (item_id, company_id))
            conn.commit()
            return

    with _sqlite() as conn:
        conn.execute("DELETE FROM business_items WHERE id = ? AND company_id = ?", (item_id, company_id))
        conn.commit()


def update_business_item(company_id: int, item_id: int, category: str, name: str, price: float, currency: str = "USD") -> bool:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update business_items
                    set category = %s, name = %s, price = %s, currency = %s
                    where id = %s and company_id = %s
                    """,
                    (category.strip(), name.strip(), price, currency.strip().upper(), item_id, company_id),
                )
                affected = cur.rowcount
            conn.commit()
            return affected > 0

    with _sqlite() as conn:
        cur = conn.execute(
            """
            UPDATE business_items
            SET category = ?, name = ?, price = ?, currency = ?
            WHERE id = ? AND company_id = ?
            """,
            (category.strip(), name.strip(), price, currency.strip().upper(), item_id, company_id),
        )
        conn.commit()
        return cur.rowcount > 0


# ─── Transactions ─────────────────────────────────────────────────────────────

def insert_transaction(
    company_id: int,
    amount: float,
    currency: str,
    sender: str,
    receiver: str,
    provider: str,
    transaction_id: Optional[str],
    timestamp: str,
    type_: str,
    raw_sms: str,
    sender_number: Optional[str] = None,
    receiver_number: Optional[str] = None,
    balance: Optional[float] = None,
    category: Optional[str] = None,
) -> Optional[int]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into transactions
                        (company_id, amount, currency, sender, sender_number, receiver, receiver_number,
                         provider, transaction_id, timestamp, balance, type, category, raw_sms)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz, %s, %s, %s, %s)
                    on conflict (company_id, transaction_id) where transaction_id is not null do nothing
                    returning id
                    """,
                    (
                        company_id, amount, currency, sender, sender_number, receiver,
                        receiver_number, provider, transaction_id, timestamp, balance, type_, category, raw_sms,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
            return int(row["id"]) if row else None

    with _sqlite() as conn:
        # Duplicate protection
        if transaction_id:
            dup = conn.execute(
                "SELECT id FROM transactions WHERE company_id = ? AND transaction_id = ?",
                (company_id, transaction_id),
            ).fetchone()
            if dup:
                return None

        cur = conn.execute(
            """
            INSERT INTO transactions
                (company_id, amount, currency, sender, sender_number, receiver, receiver_number,
                 provider, transaction_id, timestamp, balance, type, category, raw_sms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company_id, amount, currency, sender, sender_number, receiver,
                receiver_number, provider, transaction_id, timestamp, balance, type_, category, raw_sms,
            ),
        )
        conn.commit()
        return cur.lastrowid


def get_transactions(
    company_id: int,
    search: Optional[str] = None,
    type_: Optional[str] = None,
    provider: Optional[str] = None,
    category: Optional[str] = None,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    allowed_sort = {"timestamp", "amount", "provider", "sender", "receiver", "category"}
    sort_by = sort_by if sort_by in allowed_sort else "timestamp"

    if using_postgres():
        order = "DESC" if sort_order.lower() == "desc" else "ASC"
        query = (
            "select id, amount, currency, sender, sender_number, receiver, receiver_number, provider, "
            "transaction_id, timestamp, balance, type, category, classification_data, is_classified, raw_sms "
            "from transactions where company_id = %s"
        )
        params: list[Any] = [company_id]

        if search:
            query += " and (sender ilike %s or receiver ilike %s or coalesce(transaction_id,'') ilike %s or provider ilike %s or coalesce(category,'') ilike %s)"
            search_like = f"%{search}%"
            params.extend([search_like, search_like, search_like, search_like, search_like])

        if type_:
            query += " and type = %s"
            params.append(type_)

        if provider:
            query += " and provider = %s"
            params.append(provider)

        if category:
            query += " and category = %s"
            params.append(category)

        query += f" order by {sort_by} {order}"

        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(query, tuple(params))
                return [dict(row) for row in cur.fetchall()]

    # SQLite
    order = "DESC" if sort_order.lower() == "desc" else "ASC"
    query = (
        "SELECT id, amount, currency, sender, sender_number, receiver, receiver_number, "
        "provider, transaction_id, timestamp, balance, type, category, classification_data, is_classified, raw_sms "
        "FROM transactions WHERE company_id = ?"
    )
    params = [company_id]

    if search:
        s = f"%{search}%"
        query += " AND (sender LIKE ? OR receiver LIKE ? OR COALESCE(transaction_id,'') LIKE ? OR provider LIKE ? OR COALESCE(category,'') LIKE ?)"
        params.extend([s, s, s, s, s])

    if type_:
        query += " AND type = ?"
        params.append(type_)

    if provider:
        query += " AND provider = ?"
        params.append(provider)

    if category:
        query += " AND category = ?"
        params.append(category)

    query += f" ORDER BY {sort_by} {order}"

    with _sqlite() as conn:
        rows = conn.execute(query, params).fetchall()
        return _rows_to_dicts(rows)


def get_transaction_by_id(company_id: int, transaction_id: int) -> Optional[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("select * from transactions where id = %s and company_id = %s", (transaction_id, company_id))
                row = cur.fetchone()
                return dict(row) if row else None

    with _sqlite() as conn:
        row = conn.execute("SELECT * FROM transactions WHERE id = ? AND company_id = ?", (transaction_id, company_id)).fetchone()
        return _row_to_dict(row)


def delete_all_transactions(company_id: int) -> int:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from transactions where company_id = %s", (company_id,))
                deleted = cur.rowcount
            conn.commit()
            return deleted

    with _sqlite() as conn:
        cur = conn.execute("DELETE FROM transactions WHERE company_id = ?", (company_id,))
        conn.commit()
        return cur.rowcount


# ─── Classification & Allocation Engine ───────────────────────────────────────

def classify_transaction(
    company_id: int,
    transaction_id: int,
    category: str,
    allocations: list[dict[str, Any]],
    changed_by: str = "Owner",
    notes: Optional[str] = None,
) -> bool:
    """
    Save structured business classification and allocations (split exchange, items, or direct).
    Maintains full audit logging.
    """
    classification_json = json.dumps({
        "category": category,
        "allocations_count": len(allocations),
        "notes": notes,
        "classified_at": datetime.now(timezone.utc).isoformat(),
        "classified_by": changed_by,
    })

    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                # 1. Fetch old record for audit
                cur.execute("select category, classification_data from transactions where id = %s and company_id = %s", (transaction_id, company_id))
                old_row = cur.fetchone()
                old_values = json.dumps(dict(old_row)) if old_row else "{}"

                # 2. Update transaction
                cur.execute(
                    """
                    update transactions
                    set category = %s, classification_data = %s, is_classified = 1
                    where id = %s and company_id = %s
                    """,
                    (category, classification_json, transaction_id, company_id),
                )

                # 3. Clear existing allocations & re-insert
                cur.execute("delete from transaction_allocations where transaction_id = %s and company_id = %s", (transaction_id, company_id))
                for alloc in allocations:
                    cur.execute(
                        """
                        insert into transaction_allocations
                            (transaction_id, company_id, allocation_type, target_currency, original_allocated_amount,
                             converted_amount, exchange_rate, delivery_method, item_id, item_name, item_quantity, notes)
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            transaction_id, company_id,
                            alloc.get("allocation_type", "general"),
                            alloc.get("target_currency", "USD"),
                            float(alloc.get("original_allocated_amount", 0.0)),
                            float(alloc.get("converted_amount", 0.0)),
                            float(alloc.get("exchange_rate", 1.0)),
                            alloc.get("delivery_method", "cash_hand"),
                            alloc.get("item_id"),
                            alloc.get("item_name"),
                            int(alloc.get("item_quantity", 1)),
                            alloc.get("notes"),
                        ),
                    )

                # 4. Write audit log
                cur.execute(
                    """
                    insert into audit_logs (company_id, transaction_id, action, changed_by, old_values, new_values)
                    values (%s, %s, %s, %s, %s, %s)
                    """,
                    (company_id, transaction_id, "classify", changed_by, old_values, classification_json),
                )
            conn.commit()
            return True

    with _sqlite() as conn:
        old_row = conn.execute(
            "SELECT category, classification_data FROM transactions WHERE id = ? AND company_id = ?",
            (transaction_id, company_id),
        ).fetchone()
        old_values = json.dumps(dict(old_row)) if old_row else "{}"

        conn.execute(
            """
            UPDATE transactions
            SET category = ?, classification_data = ?, is_classified = 1
            WHERE id = ? AND company_id = ?
            """,
            (category, classification_json, transaction_id, company_id),
        )

        conn.execute("DELETE FROM transaction_allocations WHERE transaction_id = ? AND company_id = ?", (transaction_id, company_id))
        for alloc in allocations:
            conn.execute(
                """
                INSERT INTO transaction_allocations
                    (transaction_id, company_id, allocation_type, target_currency, original_allocated_amount,
                     converted_amount, exchange_rate, delivery_method, item_id, item_name, item_quantity, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    transaction_id, company_id,
                    alloc.get("allocation_type", "general"),
                    alloc.get("target_currency", "USD"),
                    float(alloc.get("original_allocated_amount", 0.0)),
                    float(alloc.get("converted_amount", 0.0)),
                    float(alloc.get("exchange_rate", 1.0)),
                    alloc.get("delivery_method", "cash_hand"),
                    alloc.get("item_id"),
                    alloc.get("item_name"),
                    int(alloc.get("item_quantity", 1)),
                    alloc.get("notes"),
                ),
            )

        conn.execute(
            "INSERT INTO audit_logs (company_id, transaction_id, action, changed_by, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?)",
            (company_id, transaction_id, "classify", changed_by, old_values, classification_json),
        )
        conn.commit()
        return True


def get_transaction_allocations(company_id: int, transaction_id: int) -> list[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "select * from transaction_allocations where transaction_id = %s and company_id = %s order by id asc",
                    (transaction_id, company_id),
                )
                return [dict(row) for row in cur.fetchall()]

    with _sqlite() as conn:
        rows = conn.execute(
            "SELECT * FROM transaction_allocations WHERE transaction_id = ? AND company_id = ? ORDER BY id ASC",
            (transaction_id, company_id),
        ).fetchall()
        return _rows_to_dicts(rows)


def get_audit_logs(company_id: int, transaction_id: Optional[int] = None) -> list[dict[str, Any]]:
    cond = "and transaction_id = %s" if transaction_id else ""
    params = [company_id]
    if transaction_id:
        params.append(transaction_id)

    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"select * from audit_logs where company_id = %s {cond} order by created_at desc limit 100",
                    tuple(params),
                )
                return [dict(row) for row in cur.fetchall()]

    with _sqlite() as conn:
        cond_sqlite = "AND transaction_id = ?" if transaction_id else ""
        rows = conn.execute(
            f"SELECT * FROM audit_logs WHERE company_id = ? {cond_sqlite} ORDER BY created_at DESC LIMIT 100",
            params,
        ).fetchall()
        return _rows_to_dicts(rows)


# ─── Advanced Analytics & Financial Reporting ─────────────────────────────────

def get_analytics_report(
    company_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict[str, Any]:
    """
    Computes professional financial ledger metrics, category breakdowns,
    provider distributions, currency balances, and cashflow timelines.
    """
    transactions = get_transactions(company_id=company_id)

    # Filter by date if provided
    if start_date or end_date:
        filtered = []
        for txn in transactions:
            try:
                txn_dt = datetime.fromisoformat(str(txn["timestamp"]).replace("Z", "+00:00")).date()
                if start_date:
                    s_dt = datetime.fromisoformat(start_date).date()
                    if txn_dt < s_dt:
                        continue
                if end_date:
                    e_dt = datetime.fromisoformat(end_date).date()
                    if txn_dt > e_dt:
                        continue
                filtered.append(txn)
            except Exception:
                filtered.append(txn)
        transactions = filtered

    # Currency metrics
    currencies: dict[str, dict[str, float]] = {}
    categories: dict[str, float] = {}
    providers: dict[str, dict] = {}
    daily_timeline: dict[str, dict[str, float]] = {}

    total_received_count = 0
    total_sent_count = 0

    for txn in transactions:
        cur = txn.get("currency") or "SLSH"
        amt = float(txn.get("amount") or 0.0)
        ttype = txn.get("type") or "Received"
        prov = txn.get("provider") or "Other"
        cat = txn.get("category") or "Unclassified"

        # Initialize currency group
        if cur not in currencies:
            currencies[cur] = {"received": 0.0, "sent": 0.0, "net": 0.0}

        # Format timeline date
        try:
            day_str = datetime.fromisoformat(str(txn["timestamp"]).replace("Z", "+00:00")).strftime("%Y-%m-%d")
        except Exception:
            day_str = "Unknown"

        if day_str not in daily_timeline:
            daily_timeline[day_str] = {"received": 0.0, "sent": 0.0}

        # Initialize provider group
        if prov not in providers:
            providers[prov] = {"received": 0.0, "sent": 0.0, "net": 0.0}

        if ttype == "Received":
            total_received_count += 1
            currencies[cur]["received"] += amt
            currencies[cur]["net"] += amt
            daily_timeline[day_str]["received"] += amt
            categories[cat] = categories.get(cat, 0.0) + amt
            providers[prov]["received"] += amt
            providers[prov]["net"] += amt
        else:
            total_sent_count += 1
            currencies[cur]["sent"] += amt
            currencies[cur]["net"] -= amt
            daily_timeline[day_str]["sent"] += amt
            providers[prov]["sent"] += amt
            providers[prov]["net"] -= amt

    # Sort timeline chronologically
    sorted_timeline = [
        {"date": d, "received": daily_timeline[d]["received"], "sent": daily_timeline[d]["sent"]}
        for d in sorted(daily_timeline.keys())
    ]

    # Category breakdown sorted descending
    cat_breakdown = [
        {"category": k, "amount": v}
        for k, v in sorted(categories.items(), key=lambda x: x[1], reverse=True)
    ]

    # Provider breakdown sorted descending by total volume
    prov_breakdown = [
        {"provider": k, "received": v["received"], "sent": v["sent"], "net": v["net"]}
        for k, v in sorted(providers.items(), key=lambda x: x[1]["received"] + x[1]["sent"], reverse=True)
    ]

    return {
        "period_start": start_date,
        "period_end": end_date,
        "total_transactions": len(transactions),
        "total_received_count": total_received_count,
        "total_sent_count": total_sent_count,
        "currencies": currencies,
        "category_breakdown": cat_breakdown,
        "provider_breakdown": prov_breakdown,
        "daily_timeline": sorted_timeline,
        "transactions_preview": transactions,
    }


# ─── Invoices ─────────────────────────────────────────────────────────────────

def create_invoice(
    company_id: int,
    invoice_number: str,
    customer_phone: str,
    amount: float,
    currency: str,
    description: Optional[str] = None,
) -> int:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into invoices
                        (company_id, invoice_number, customer_phone, amount, currency, description, status)
                    values (%s, %s, %s, %s, %s, %s, 'pending')
                    returning id
                    """,
                    (company_id, invoice_number, customer_phone, amount, currency, description),
                )
                row = cur.fetchone()
            conn.commit()
            return int(row["id"])

    with _sqlite() as conn:
        cur = conn.execute(
            """
            INSERT INTO invoices (company_id, invoice_number, customer_phone, amount, currency, description, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
            """,
            (company_id, invoice_number, customer_phone, amount, currency, description),
        )
        conn.commit()
        return cur.lastrowid


def get_invoices(company_id: int) -> list[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, invoice_number, customer_phone, amount, currency, created_at,
                           paid_at, status, description, paid_transaction_id
                    from invoices
                    where company_id = %s
                    order by created_at desc
                    """,
                    (company_id,),
                )
                return [dict(row) for row in cur.fetchall()]

    with _sqlite() as conn:
        rows = conn.execute(
            """
            SELECT id, invoice_number, customer_phone, amount, currency, created_at,
                   paid_at, status, description, paid_transaction_id
            FROM invoices WHERE company_id = ? ORDER BY created_at DESC
            """,
            (company_id,),
        ).fetchall()
        return _rows_to_dicts(rows)


def update_invoice_status(company_id: int, invoice_id: int, status: str, transaction_id: Optional[int] = None) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                if status == "paid":
                    cur.execute(
                        """
                        update invoices
                        set status = %s, paid_at = now(), paid_transaction_id = %s
                        where id = %s and company_id = %s
                        """,
                        (status, transaction_id, invoice_id, company_id),
                    )
                else:
                    cur.execute(
                        "update invoices set status = %s where id = %s and company_id = %s",
                        (status, invoice_id, company_id),
                    )
            conn.commit()
            return

    with _sqlite() as conn:
        if status == "paid":
            conn.execute(
                "UPDATE invoices SET status = ?, paid_at = datetime('now'), paid_transaction_id = ? WHERE id = ? AND company_id = ?",
                (status, transaction_id, invoice_id, company_id),
            )
        else:
            conn.execute(
                "UPDATE invoices SET status = ? WHERE id = ? AND company_id = ?",
                (status, invoice_id, company_id),
            )
        conn.commit()


def find_matching_invoice(company_id: int, customer_phone: str, amount: float) -> Optional[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, invoice_number, customer_phone, amount, currency, created_at,
                           paid_at, status, description, paid_transaction_id
                    from invoices
                    where company_id = %s and customer_phone = %s and amount = %s and status = 'pending'
                    order by created_at asc
                    limit 1
                    """,
                    (company_id, customer_phone, amount),
                )
                row = cur.fetchone()
                return dict(row) if row else None

    with _sqlite() as conn:
        row = conn.execute(
            """
            SELECT id, invoice_number, customer_phone, amount, currency, created_at,
                   paid_at, status, description, paid_transaction_id
            FROM invoices
            WHERE company_id = ? AND customer_phone = ? AND amount = ? AND status = 'pending'
            ORDER BY created_at ASC LIMIT 1
            """,
            (company_id, customer_phone, amount),
        ).fetchone()
        return _row_to_dict(row)


def delete_invoice(company_id: int, invoice_id: int) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from invoices where id = %s and company_id = %s", (invoice_id, company_id))
            conn.commit()
            return

    with _sqlite() as conn:
        conn.execute("DELETE FROM invoices WHERE id = ? AND company_id = ?", (invoice_id, company_id))
        conn.commit()


# ─── Notifications ────────────────────────────────────────────────────────────

def create_notification(company_id: int, transaction_id: int) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into notifications (company_id, transaction_id)
                    values (%s, %s)
                    on conflict (company_id, transaction_id) do nothing
                    """,
                    (company_id, transaction_id),
                )
            conn.commit()
            return

    with _sqlite() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO notifications (company_id, transaction_id) VALUES (?, ?)",
            (company_id, transaction_id),
        )
        conn.commit()


def get_unread_notifications(company_id: int) -> list[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, transaction_id, created_at, read
                    from notifications
                    where company_id = %s and read = false
                    order by created_at desc
                    """,
                    (company_id,),
                )
                return [dict(row) for row in cur.fetchall()]

    with _sqlite() as conn:
        rows = conn.execute(
            "SELECT id, transaction_id, created_at, read FROM notifications WHERE company_id = ? AND read = 0 ORDER BY created_at DESC",
            (company_id,),
        ).fetchall()
        return _rows_to_dicts(rows)


def mark_notification_as_read(company_id: int, notification_id: int) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "update notifications set read = true where id = %s and company_id = %s",
                    (notification_id, company_id),
                )
            conn.commit()
            return

    with _sqlite() as conn:
        conn.execute(
            "UPDATE notifications SET read = 1 WHERE id = ? AND company_id = ?",
            (notification_id, company_id),
        )
        conn.commit()


def delete_all_notifications(company_id: int) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from notifications where company_id = %s", (company_id,))
            conn.commit()
            return

    with _sqlite() as conn:
        conn.execute("DELETE FROM notifications WHERE company_id = ?", (company_id,))
        conn.commit()


# ─── Employees & Attendance ───────────────────────────────────────────────────

def get_employees(company_id: int) -> list[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, company_id, name, phone, role, pin_code, permissions_json, is_active, created_at
                    from employees
                    where company_id = %s
                    order by is_active desc, role, name
                    """,
                    (company_id,),
                )
                return [dict(row) for row in cur.fetchall()]

    with _sqlite() as conn:
        rows = conn.execute(
            """
            SELECT id, company_id, name, phone, role, pin_code, permissions_json, is_active, created_at
            FROM employees
            WHERE company_id = ?
            ORDER BY is_active DESC, role, name
            """,
            (company_id,),
        ).fetchall()
        return _rows_to_dicts(rows)


def create_employee(
    company_id: int,
    name: str,
    phone: str = "",
    role: str = "Cashier",
    pin_code: str = "1234",
    permissions_json: str = "{}",
) -> int:
    default_perms = '{"can_classify":true,"can_view_reports":true,"can_manage_items":false,"can_delete":false}'
    perms = permissions_json if permissions_json and permissions_json.strip() != "{}" else default_perms

    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into employees (company_id, name, phone, role, pin_code, permissions_json, is_active)
                    values (%s, %s, %s, %s, %s, %s, 1)
                    returning id
                    """,
                    (company_id, name.strip(), phone.strip(), role.strip(), pin_code.strip(), perms),
                )
                row = cur.fetchone()
            conn.commit()
            return int(row["id"])

    with _sqlite() as conn:
        cur = conn.execute(
            """
            INSERT INTO employees (company_id, name, phone, role, pin_code, permissions_json, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            """,
            (company_id, name.strip(), phone.strip(), role.strip(), pin_code.strip(), perms),
        )
        conn.commit()
        return cur.lastrowid


def update_employee(
    company_id: int,
    employee_id: int,
    name: str,
    phone: str,
    role: str,
    pin_code: str,
    permissions_json: str,
    is_active: int = 1,
) -> bool:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update employees
                    set name = %s, phone = %s, role = %s, pin_code = %s, permissions_json = %s, is_active = %s
                    where id = %s and company_id = %s
                    """,
                    (name.strip(), phone.strip(), role.strip(), pin_code.strip(), permissions_json, is_active, employee_id, company_id),
                )
                affected = cur.rowcount
            conn.commit()
            return affected > 0

    with _sqlite() as conn:
        cur = conn.execute(
            """
            UPDATE employees
            SET name = ?, phone = ?, role = ?, pin_code = ?, permissions_json = ?, is_active = ?
            WHERE id = ? AND company_id = ?
            """,
            (name.strip(), phone.strip(), role.strip(), pin_code.strip(), permissions_json, is_active, employee_id, company_id),
        )
        conn.commit()
        return cur.rowcount > 0


def delete_employee(company_id: int, employee_id: int) -> bool:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from employees where id = %s and company_id = %s", (employee_id, company_id))
                affected = cur.rowcount
            conn.commit()
            return affected > 0

    with _sqlite() as conn:
        cur = conn.execute("DELETE FROM employees WHERE id = ? AND company_id = ?", (employee_id, company_id))
        conn.commit()
        return cur.rowcount > 0


def record_employee_attendance(company_id: int, employee_id: int, action: str, notes: str = "") -> int:
    action_clean = action.strip().lower()  # check_in or check_out
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into employee_attendance (company_id, employee_id, action, notes)
                    values (%s, %s, %s, %s)
                    returning id
                    """,
                    (company_id, employee_id, action_clean, notes.strip()),
                )
                row = cur.fetchone()
            conn.commit()
            return int(row["id"])

    with _sqlite() as conn:
        cur = conn.execute(
            """
            INSERT INTO employee_attendance (company_id, employee_id, action, notes)
            VALUES (?, ?, ?, ?)
            """,
            (company_id, employee_id, action_clean, notes.strip()),
        )
        conn.commit()
        return cur.lastrowid


def get_employee_attendance(company_id: int, limit: int = 50) -> list[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select a.id, a.company_id, a.employee_id, a.action, a.timestamp, a.notes,
                           e.name as employee_name, e.role as employee_role
                    from employee_attendance a
                    join employees e on e.id = a.employee_id
                    where a.company_id = %s
                    order by a.timestamp desc
                    limit %s
                    """,
                    (company_id, limit),
                )
                return [dict(row) for row in cur.fetchall()]

    with _sqlite() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.company_id, a.employee_id, a.action, a.timestamp, a.notes,
                   e.name as employee_name, e.role as employee_role
            FROM employee_attendance a
            JOIN employees e ON e.id = a.employee_id
            WHERE a.company_id = ?
            ORDER BY a.timestamp DESC
            LIMIT ?
            """,
            (company_id, limit),
        ).fetchall()
        return _rows_to_dicts(rows)


def get_employee_sales_stats(company_id: int) -> list[dict[str, Any]]:
    """Calculates sales total and transaction counts per employee."""
    employees = get_employees(company_id)
    txns = get_transactions(company_id)

    stats = {}
    for emp in employees:
        stats[emp["name"].lower()] = {
            "employee_id": emp["id"],
            "name": emp["name"],
            "role": emp["role"],
            "transactions_count": 0,
            "total_sales_usd": 0.0,
            "total_sales_slsh": 0.0,
        }

    for t in txns:
        if t.get("type") != "Received":
            continue
        c_data_str = t.get("classification_data") or "{}"
        try:
            c_data = json.loads(c_data_str) if isinstance(c_data_str, str) else c_data_str
        except Exception:
            c_data = {}
        
        emp_name = (c_data.get("classified_by") or "").strip().lower()
        amt = float(t.get("amount") or 0.0)
        cur = (t.get("currency") or "USD").upper()

        if emp_name and emp_name in stats:
            stats[emp_name]["transactions_count"] += 1
            if cur == "SLSH":
                stats[emp_name]["total_sales_slsh"] += amt
            else:
                stats[emp_name]["total_sales_usd"] += amt

    return list(stats.values())

