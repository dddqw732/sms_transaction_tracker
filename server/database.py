from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL_ENV_KEYS = ("SUPABASE_DB_URL", "DATABASE_URL")


def _get_db_url() -> Optional[str]:
    for key in DB_URL_ENV_KEYS:
        value = os.environ.get(key)
        if value:
            return value
    return None


def _supabase_url() -> str:
    explicit = os.environ.get("SUPABASE_URL")
    if explicit:
        return explicit

    project_ref = os.environ.get("SUPABASE_PROJECT_REF")
    if project_ref:
        return f"https://{project_ref}.supabase.co"

    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_PROJECT_REF")


def _supabase_key() -> str:
    for key in ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_ANON_KEY"):
        value = os.environ.get(key)
        if value:
            return value
    raise RuntimeError("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY/SUPABASE_ANON_KEY)")


def _connect():
    db_url = _get_db_url()
    if not db_url:
        raise RuntimeError("No Postgres URL configured")
    return psycopg2.connect(db_url, cursor_factory=RealDictCursor)


def _rest_client():
    from supabase import create_client

    return create_client(_supabase_url(), _supabase_key())


def using_postgres() -> bool:
    return bool(_get_db_url())


def init_db() -> None:
    # In Supabase REST mode, schema should be created with server/supabase_schema.sql.
    if not using_postgres():
        return

    schema_path = os.path.join(os.path.dirname(__file__), "supabase_schema.sql")
    if not os.path.exists(schema_path):
        return

    with _connect() as conn:
        with conn.cursor() as cur:
            with open(schema_path, "r", encoding="utf-8") as file:
                cur.execute(file.read())
        conn.commit()


def _first(data: Any) -> Optional[dict[str, Any]]:
    if not data:
        return None
    if isinstance(data, list):
        return data[0] if data else None
    return data


def _rest_select_one(table: str, eq_map: dict[str, Any], columns: str = "*") -> Optional[dict[str, Any]]:
    client = _rest_client()
    query = client.table(table).select(columns)
    for key, value in eq_map.items():
        query = query.eq(key, value)
    result = query.limit(1).execute()
    return _first(result.data)


def get_company_by_code(company_code: str) -> Optional[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, company_name, company_code, city, telegram_api_id, telegram_api_hash,
                           subscription_plan, password_hash, status, created_at
                    from companies
                    where company_code = %s
                    """,
                    (company_code,),
                )
                return cur.fetchone()

    return _rest_select_one("companies", {"company_code": company_code})


def get_company_by_id(company_id: int) -> Optional[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, company_name, company_code, city, telegram_api_id, telegram_api_hash,
                           subscription_plan, password_hash, status, created_at
                    from companies
                    where id = %s
                    """,
                    (company_id,),
                )
                return cur.fetchone()

    return _rest_select_one("companies", {"id": company_id})


def list_companies_with_telegram_credentials() -> list[dict[str, Any]]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id, company_name, company_code, city, telegram_api_id, telegram_api_hash,
                           subscription_plan, password_hash, status, created_at
                    from companies
                    where telegram_api_id is not null and telegram_api_hash is not null
                    order by created_at asc
                    """
                )
                return [dict(row) for row in cur.fetchall()]

    client = _rest_client()
    result = client.table("companies").select("*").execute()
    rows = result.data or []
    return [
        row for row in rows
        if row.get("telegram_api_id") and row.get("telegram_api_hash")
    ]


def create_company(
    company_name: str,
    company_code: str,
    city: str,
    subscription_plan: str,
    password_hash: str,
    status: str,
    telegram_api_id: Optional[str] = None,
    telegram_api_hash: Optional[str] = None,
) -> dict[str, Any]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into companies
                        (company_name, company_code, city, telegram_api_id, telegram_api_hash,
                         subscription_plan, password_hash, status)
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    returning id, company_name, company_code, city, subscription_plan, status, created_at
                    """,
                    (
                        company_name,
                        company_code,
                        city,
                        telegram_api_id,
                        telegram_api_hash,
                        subscription_plan,
                        password_hash,
                        status,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
            return row

    client = _rest_client()
    payload = {
        "company_name": company_name,
        "company_code": company_code,
        "city": city,
        "telegram_api_id": telegram_api_id,
        "telegram_api_hash": telegram_api_hash,
        "subscription_plan": subscription_plan,
        "password_hash": password_hash,
        "status": status,
    }
    result = client.table("companies").insert(payload).execute()
    row = _first(result.data)
    if not row:
        raise RuntimeError("Failed to create company")
    return row


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

    client = _rest_client()
    result = client.table("companies").select("company_code").ilike("company_code", f"{prefix}%").execute()
    max_num = 0
    for row in (result.data or []):
        code = row.get("company_code", "")
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", code)
        if match:
            max_num = max(max_num, int(match.group(1)))
    return max_num + 1


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
) -> Optional[int]:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into transactions
                        (company_id, amount, currency, sender, sender_number, receiver, receiver_number,
                         provider, transaction_id, timestamp, balance, type, raw_sms)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz, %s, %s, %s)
                    on conflict (company_id, transaction_id) where transaction_id is not null do nothing
                    returning id
                    """,
                    (
                        company_id,
                        amount,
                        currency,
                        sender,
                        sender_number,
                        receiver,
                        receiver_number,
                        provider,
                        transaction_id,
                        timestamp,
                        balance,
                        type_,
                        raw_sms,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
            return int(row["id"]) if row else None

    client = _rest_client()
    if transaction_id:
        dup = (
            client.table("transactions")
            .select("id")
            .eq("company_id", company_id)
            .eq("transaction_id", transaction_id)
            .limit(1)
            .execute()
        )
        if dup.data:
            return None

    payload = {
        "company_id": company_id,
        "amount": amount,
        "currency": currency,
        "sender": sender,
        "sender_number": sender_number,
        "receiver": receiver,
        "receiver_number": receiver_number,
        "provider": provider,
        "transaction_id": transaction_id,
        "timestamp": timestamp,
        "balance": balance,
        "type": type_,
        "raw_sms": raw_sms,
    }
    result = client.table("transactions").insert(payload).execute()
    row = _first(result.data)
    return int(row["id"]) if row and row.get("id") is not None else None


def get_transactions(
    company_id: int,
    search: Optional[str] = None,
    type_: Optional[str] = None,
    provider: Optional[str] = None,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
) -> list[dict[str, Any]]:
    allowed_sort = {"timestamp", "amount", "provider", "sender", "receiver"}
    sort_by = sort_by if sort_by in allowed_sort else "timestamp"

    if using_postgres():
        order = "DESC" if sort_order.lower() == "desc" else "ASC"
        query = (
            "select id, amount, currency, sender, sender_number, receiver, receiver_number, provider, "
            "transaction_id, timestamp, balance, type, raw_sms "
            "from transactions where company_id = %s"
        )
        params: list[Any] = [company_id]

        if search:
            query += " and (sender ilike %s or receiver ilike %s or coalesce(transaction_id,'') ilike %s or provider ilike %s)"
            search_like = f"%{search}%"
            params.extend([search_like, search_like, search_like, search_like])

        if type_:
            query += " and type = %s"
            params.append(type_)

        if provider:
            query += " and provider = %s"
            params.append(provider)

        query += f" order by {sort_by} {order}"

        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(query, tuple(params))
                rows = cur.fetchall()
                return [dict(row) for row in rows]

    client = _rest_client()
    result = client.table("transactions").select("*").eq("company_id", company_id).execute()
    rows = result.data or []

    if search:
        s = search.lower()
        rows = [
            row for row in rows
            if s in str(row.get("sender", "")).lower()
            or s in str(row.get("receiver", "")).lower()
            or s in str(row.get("transaction_id", "")).lower()
            or s in str(row.get("provider", "")).lower()
        ]

    if type_:
        rows = [row for row in rows if row.get("type") == type_]

    if provider:
        rows = [row for row in rows if row.get("provider") == provider]

    reverse = sort_order.lower() == "desc"
    rows.sort(key=lambda row: row.get(sort_by) or "", reverse=reverse)
    return rows


def delete_all_transactions(company_id: int) -> int:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from transactions where company_id = %s", (company_id,))
                deleted = cur.rowcount
            conn.commit()
            return deleted

    client = _rest_client()
    count_before = client.table("transactions").select("id").eq("company_id", company_id).execute()
    deleted = len(count_before.data or [])
    client.table("transactions").delete().eq("company_id", company_id).execute()
    return deleted


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

    client = _rest_client()
    result = client.table("invoices").insert(
        {
            "company_id": company_id,
            "invoice_number": invoice_number,
            "customer_phone": customer_phone,
            "amount": amount,
            "currency": currency,
            "description": description,
            "status": "pending",
        }
    ).execute()
    row = _first(result.data)
    if not row:
        raise RuntimeError("Failed to create invoice")
    return int(row["id"])


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

    client = _rest_client()
    result = client.table("invoices").select("*").eq("company_id", company_id).execute()
    rows = result.data or []
    rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    return rows


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

    client = _rest_client()
    payload: dict[str, Any] = {"status": status}
    if status == "paid":
        payload["paid_at"] = datetime.now(timezone.utc).isoformat()
        payload["paid_transaction_id"] = transaction_id
    client.table("invoices").update(payload).eq("id", invoice_id).eq("company_id", company_id).execute()


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
                return cur.fetchone()

    client = _rest_client()
    result = (
        client.table("invoices")
        .select("*")
        .eq("company_id", company_id)
        .eq("customer_phone", customer_phone)
        .eq("amount", amount)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    return _first(result.data)


def delete_invoice(company_id: int, invoice_id: int) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from invoices where id = %s and company_id = %s", (invoice_id, company_id))
            conn.commit()
            return

    _rest_client().table("invoices").delete().eq("id", invoice_id).eq("company_id", company_id).execute()


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

    client = _rest_client()
    exists = (
        client.table("notifications")
        .select("id")
        .eq("company_id", company_id)
        .eq("transaction_id", transaction_id)
        .limit(1)
        .execute()
    )
    if exists.data:
        return

    client.table("notifications").insert({"company_id": company_id, "transaction_id": transaction_id}).execute()


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

    result = _rest_client().table("notifications").select("*").eq("company_id", company_id).eq("read", False).execute()
    rows = result.data or []
    rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    return rows


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

    _rest_client().table("notifications").update({"read": True}).eq("id", notification_id).eq("company_id", company_id).execute()


def delete_all_notifications(company_id: int) -> None:
    if using_postgres():
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute("delete from notifications where company_id = %s", (company_id,))
            conn.commit()
            return

    _rest_client().table("notifications").delete().eq("company_id", company_id).execute()
