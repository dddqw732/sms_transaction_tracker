from server import database
import json

def test_db():
    database.init_db()
    
    # 1. Create a Restaurant Company
    c1 = database.create_company(
        company_name="Al-Baraka Restaurant",
        company_code="REST001",
        city="Hargeisa",
        subscription_plan="Growth",
        password_hash="fakehash",
        status="active",
        business_type="restaurant"
    )
    print(f"Created company: {c1['company_name']}, type: {c1['business_type']}")
    assert c1["business_type"] == "restaurant"

    # Check seeded items
    items = database.get_business_items(c1["id"])
    print(f"Seeded items count for restaurant: {len(items)}")
    assert len(items) > 0

    # 2. Insert transaction
    txn_id = database.insert_transaction(
        company_id=c1["id"],
        amount=10.0,
        currency="USD",
        sender="Mohamed Ali",
        receiver="You",
        provider="eDahab",
        transaction_id="ED-TEST-001",
        timestamp="2026-09-02T10:00:00Z",
        type_="Received",
        raw_sms="Received $10 from Mohamed Ali"
    )
    print(f"Inserted transaction ID: {txn_id}")
    assert txn_id is not None

    # 3. Classify transaction as restaurant order with 2 items
    burger = next(item for item in items if item["name"] == "Burger")
    pizza = next(item for item in items if item["name"] == "Pizza")
    
    allocations = [
        {
            "allocation_type": "product_sale",
            "target_currency": "USD",
            "original_allocated_amount": 5.0,
            "converted_amount": 5.0,
            "exchange_rate": 1.0,
            "delivery_method": "cash_hand",
            "item_id": burger["id"],
            "item_name": burger["name"],
            "item_quantity": 1
        },
        {
            "allocation_type": "product_sale",
            "target_currency": "USD",
            "original_allocated_amount": 5.0,
            "converted_amount": 5.0,
            "exchange_rate": 1.0,
            "delivery_method": "cash_hand",
            "item_id": pizza["id"],
            "item_name": pizza["name"],
            "item_quantity": 1
        }
    ]

    classified = database.classify_transaction(
        company_id=c1["id"],
        transaction_id=txn_id,
        category="Orders",
        allocations=allocations,
        changed_by="Manager"
    )
    print(f"Transaction classified: {classified}")
    assert classified is True

    # 4. Check allocations
    saved_allocs = database.get_transaction_allocations(c1["id"], txn_id)
    print(f"Saved allocations: {len(saved_allocs)}")
    assert len(saved_allocs) == 2

    # 5. Check audit logs
    logs = database.get_audit_logs(c1["id"], txn_id)
    print(f"Audit logs: {len(logs)}")
    assert len(logs) == 1

    # 6. Test Currency Exchange business flow
    c2 = database.create_company(
        company_name="Dahab Currency Exchange",
        company_code="EXCH001",
        city="Hargeisa",
        subscription_plan="Enterprise",
        password_hash="fakehash",
        status="active",
        business_type="money_exchange"
    )
    
    fx_txn_id = database.insert_transaction(
        company_id=c2["id"],
        amount=100000.0,
        currency="SLSH",
        sender="Ahmed Hassan",
        receiver="You",
        provider="ZAAD",
        transaction_id="ZAAD-TEST-002",
        timestamp="2026-09-02T11:00:00Z",
        type_="Received",
        raw_sms="Waxaad SLSH 100,000 ka heshay Ahmed Hassan"
    )

    # Split allocation: 50,000 SLSH Cash + 30,000 SLSH -> USD ($2.72) Phone + 20,000 SLSH -> ETB eBirr
    fx_allocations = [
        {
            "allocation_type": "currency_exchange",
            "target_currency": "SLSH",
            "original_allocated_amount": 50000.0,
            "converted_amount": 50000.0,
            "exchange_rate": 1.0,
            "delivery_method": "cash_hand",
            "notes": "Delivered as Cash"
        },
        {
            "allocation_type": "currency_exchange",
            "target_currency": "USD",
            "original_allocated_amount": 30000.0,
            "converted_amount": 2.72,
            "exchange_rate": 11000.0,
            "delivery_method": "phone_transfer",
            "notes": "Sent to mobile wallet"
        },
        {
            "allocation_type": "currency_exchange",
            "target_currency": "ETB",
            "original_allocated_amount": 20000.0,
            "converted_amount": 218.0,
            "exchange_rate": 91.7,
            "delivery_method": "digital_wallet",
            "notes": "Transferred via eBirr"
        }
    ]

    database.classify_transaction(
        company_id=c2["id"],
        transaction_id=fx_txn_id,
        category="Currency Exchange",
        allocations=fx_allocations,
        changed_by="Teller 1"
    )

    fx_saved = database.get_transaction_allocations(c2["id"], fx_txn_id)
    print(f"FX saved allocations: {len(fx_saved)}")
    assert len(fx_saved) == 3

    # 7. Check Analytics Report
    report = database.get_analytics_report(c1["id"])
    print(f"Analytics report summary for c1: total={report['total_transactions']}, currencies={report['currencies']}")
    assert report["total_transactions"] >= 1

    print("\n[SUCCESS] All database extensions and tests passed successfully!")

if __name__ == "__main__":
    test_db()
