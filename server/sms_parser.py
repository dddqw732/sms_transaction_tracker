import re
from datetime import datetime, timezone, timedelta


# ─── REGEX PATTERNS ──────────────────────────────────────────────────────────

# 1. Reference / Transaction ID
REF_PATTERN = re.compile(
    r"(?:Reference|Tixraaca|Tixraac|Trans\s*ID|TransID|Txn\s*ID|TrxId|Ref|Tix|TxID|Code|Id)\s*[:#]?\s*([A-Za-z0-9]+)",
    re.IGNORECASE
)

# 2. Date / Timestamp (e.g., 12/08/26 10:54:59, 2026-09-02 06:00:00, Tar: 02/09/26 10:15:00)
DATE_PATTERN = re.compile(
    r"(?:Date|Tar|Taariikh|at|on)?\s*:?\s*(\d{2,4}[/-]\d{2}[/-]\d{2,4}\s+\d{2}:\d{2}(?::\d{2})?)",
    re.IGNORECASE
)

# 3. Account Balance
BALANCE_PATTERN = re.compile(
    r"(?:Hadhaagaaga\s+cusub|Hadhaagaaga|Hadhaagaagu|Hadhaaga|Balance|A/C\s*Balance|New\s*Balance|New\s*A/C\s*Balance)\s*(?:waa|is|:)?\s*(?:SLSH|\$|USD|ETB|Br)?\s*([\d,]+(?:\.\d+)?)",
    re.IGNORECASE
)

# 4. Received Patterns (English, Somali, eDahab, ZAAD, EVC)
RCV_PATTERN = re.compile(
    r"(?:Waxaad\s+|Waad\s+)?(?:SLSH|\$|USD|ETB|Br)?\s*([\d,]+(?:\.\d+)?)\s*(?:ka\s+heshay|ka\s+socda|ka\s+qaadatay|Received\s+from|received\s+from|received|credited\s+from)\s+([^\.,\n]+?)(?:,Date|,at|,Tar|,Taariikh|,|\.|\s+Hadhaaga|\s+Ref|\s+Tix|$)",
    re.IGNORECASE
)

# 5. Sent Patterns (English, Somali, eDahab, ZAAD, EVC)
SENT_PATTERN = re.compile(
    r"(?:Waxaad\s+|Waad\s+)?(?:SLSH|\$|USD|ETB|Br)?\s*([\d,]+(?:\.\d+)?)\s*(?:sent\s+to|Sent\s+to|ayaad\s+u\s+dirtay|u\s+dirtay|u\s+wareejisay|bixisay|paid\s+to|transferred\s+to)\s+([^\.,\n]+?)(?:,Date|,at|,Tar|,Taariikh|,|\.|\s+Hadhaaga|\s+Ref|\s+Tix|$)",
    re.IGNORECASE
)


def _parse_amount(raw: str) -> float:
    """Parse '1,000.3' or '1000' into float."""
    try:
        return float(str(raw).replace(",", "").strip())
    except (ValueError, AttributeError):
        return 0.0


def _parse_timestamp(raw: str) -> str:
    """Convert various date strings to ISO 8601 UTC string."""
    raw = raw.strip()
    formats = [
        "%d/%m/%y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%y %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%y %H:%M",
        "%d/%m/%Y %H:%M",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(raw, fmt)
            dt_utc = dt - timedelta(hours=3)  # East Africa Time UTC+3 offset
            return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _extract_party(party_str: str, default_num: str = "") -> tuple[str, str | None]:
    """Clean party name and optional phone number in parentheses or inline."""
    if not party_str:
        return "Unknown", (default_num if default_num != "Forwarded SMS" else None)

    party_str = party_str.strip()

    paren_match = re.search(r"^([^\(]+?)\s*\(([^)]+)\)", party_str)
    if paren_match:
        part1 = paren_match.group(1).strip()
        part2 = paren_match.group(2).strip()
        if part1.isdigit() and not part2.isdigit():
            return part2, part1
        elif not part1.isdigit() and part2.isdigit():
            return part1, part2
        else:
            return part1, part2

    if party_str.isdigit():
        return party_str, party_str
    else:
        num = default_num if (default_num and default_num != "Forwarded SMS") else None
        return party_str, num


def parse_sms(sms_body: str, sender_number: str = "") -> dict | None:
    """
    Parse any financial SMS body (eDahab, ZAAD, EVC Plus, Sahal, M-Pesa).
    Never extracts Reference numbers or TxIDs as transaction amounts.
    """
    if not sms_body or not sms_body.strip():
        return None

    body = re.sub(r"\s+", " ", sms_body).strip()
    combine = f"{body} {sender_number}".lower()

    # ── 1. Provider & Currency Detection ─────────────────────────────────────
    provider = "ZAAD"
    if "edahab" in combine or "dahab" in combine:
        provider = "eDahab"
    elif "evc" in combine or "hormuud" in combine:
        provider = "EVC Plus"
    elif "sahal" in combine or "golis" in combine:
        provider = "Sahal"
    elif "mpesa" in combine or "m-pesa" in combine or "safaricom" in combine:
        provider = "M-Pesa"
    elif "zaad" in combine or "telesom" in combine:
        provider = "ZAAD"
    elif "slsh" in combine or "ka heshay" in combine or "ayaad u dirtay" in combine:
        provider = "ZAAD"

    currency = "USD"
    if "slsh" in combine or "shilin" in combine:
        currency = "SLSH"
    elif "etb" in combine or "birr" in combine or "ebir" in combine:
        currency = "ETB"
    elif "$" in body or "usd" in combine:
        currency = "USD"

    # ── 2. Transaction ID / Reference ─────────────────────────────────────────
    tix_match = REF_PATTERN.search(body)
    transaction_id = tix_match.group(1) if tix_match else None

    # ── 3. Timestamp ─────────────────────────────────────────────────────────
    tar_match = DATE_PATTERN.search(body)
    timestamp = _parse_timestamp(tar_match.group(1)) if tar_match else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── 4. Balance ───────────────────────────────────────────────────────────
    bal_match = BALANCE_PATTERN.search(body)
    balance = _parse_amount(bal_match.group(1)) if bal_match else None

    # ── 5. Match Received Patterns ───────────────────────────────────────────
    rcv_match = RCV_PATTERN.search(body)
    if rcv_match:
        amount = _parse_amount(rcv_match.group(1))
        name, num = _extract_party(rcv_match.group(2), sender_number)
        if amount > 0:
            return {
                "amount": amount,
                "currency": currency,
                "sender": name,
                "sender_number": num,
                "receiver": "You",
                "receiver_number": None,
                "provider": provider,
                "transaction_id": transaction_id,
                "timestamp": timestamp,
                "balance": balance,
                "type": "Received",
                "raw_sms": sms_body,
            }

    # ── 6. Match Sent Patterns ───────────────────────────────────────────────
    sent_match = SENT_PATTERN.search(body)
    if sent_match:
        amount = _parse_amount(sent_match.group(1))
        name, num = _extract_party(sent_match.group(2))
        if amount > 0:
            return {
                "amount": amount,
                "currency": currency,
                "sender": "You",
                "sender_number": None,
                "receiver": name,
                "receiver_number": num,
                "provider": provider,
                "transaction_id": transaction_id,
                "timestamp": timestamp,
                "balance": balance,
                "type": "Sent",
                "raw_sms": sms_body,
            }

    # ── 7. Fallback Regex Parsing ────────────────────────────────────────────
    clean_body = body
    if transaction_id:
        clean_body = clean_body.replace(transaction_id, "")
    clean_body = REF_PATTERN.sub("", clean_body)

    amount_match = re.search(r"(?:SLSH|\$|USD|ETB|Br)?\s*([\d,]+(?:\.\d+)?)\s*(?:USD|SLSH|ETB|Br)?", clean_body)
    if amount_match:
        amt_val = _parse_amount(amount_match.group(1))
        if amt_val > 0:
            is_sent = any(w in combine for w in ["sent", "dirtay", "bixisay", "paid", "debited", "wareejisay", "to"])
            txn_type = "Sent" if is_sent else "Received"
            return {
                "amount": amt_val,
                "currency": currency,
                "sender": ("Sender" if sender_number == "Forwarded SMS" else sender_number) if not is_sent else "You",
                "sender_number": (sender_number if sender_number != "Forwarded SMS" else None) if not is_sent else None,
                "receiver": "You" if not is_sent else ("Recipient" if sender_number == "Forwarded SMS" else sender_number),
                "receiver_number": (sender_number if sender_number != "Forwarded SMS" else None) if is_sent else None,
                "provider": provider,
                "transaction_id": transaction_id,
                "timestamp": timestamp,
                "balance": balance,
                "type": txn_type,
                "raw_sms": sms_body,
            }

    print(f"[Parser] Could not extract transaction from SMS: {body[:120]}")
    return None
