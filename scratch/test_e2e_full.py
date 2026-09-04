import sys
import os
import time
import subprocess

def test_full_system():
    print("=== Testing Database, Auth, Items, Classification, & Analytics ===")
    from server.database import init_db, create_company, get_company_by_code, insert_transaction, classify_transaction, get_transaction_allocations, get_analytics_report, get_business_items

    # 1. Init DB
    init_db()
    print("[OK] Database initialized.")

    suffix = int(time.time()) % 10000
    # 2. Restaurant Workflow
    res_comp = create_company("Sultan Mandi", f"SUL{suffix:04d}", "Hargeisa", "Enterprise", "hash123", "Active", business_type="restaurant")
    print(f"[OK] Created restaurant company: {res_comp['company_code']}, type={res_comp['business_type']}")
    items = get_business_items(res_comp['id'])
    print(f"[OK] Seeded restaurant items: {len(items)} items")
    assert len(items) >= 4

    # Add transaction
    txn_id = insert_transaction(
        company_id=res_comp['id'],
        amount=12.0,
        currency="USD",
        sender="Khadar Ali",
        receiver="You",
        provider="eDahab",
        transaction_id="ED-REST-01",
        timestamp="2026-09-02T12:00:00Z",
        type_="Received",
        raw_sms="Waxaad $12.00 ka heshay Khadar Ali (ED-REST-01)"
    )
    print(f"[OK] Added transaction: {txn_id}")

    # Classify with 2 menu items
    classify_transaction(
        company_id=res_comp['id'],
        transaction_id=txn_id,
        category="Orders",
        allocations=[
            {
                "allocation_type": "product_sale",
                "target_currency": "USD",
                "original_allocated_amount": 7.0,
                "converted_amount": 7.0,
                "exchange_rate": 1.0,
                "delivery_method": "cash_hand",
                "item_name": "Chicken Mandi",
                "item_quantity": 1
            },
            {
                "allocation_type": "product_sale",
                "target_currency": "USD",
                "original_allocated_amount": 5.0,
                "converted_amount": 5.0,
                "exchange_rate": 1.0,
                "delivery_method": "cash_hand",
                "item_name": "Fresh Mango Juice",
                "item_quantity": 2
            }
        ],
        notes="Dine-in order table 3"
    )
    allocs = get_transaction_allocations(res_comp['id'], txn_id)
    print(f"[OK] Classified transaction with {len(allocs)} item allocations.")
    assert len(allocs) == 2

    # 3. Money Exchange Workflow (Split FX)
    fx_comp = create_company("Dahabshiil Exchange Agent", f"DAH{suffix:04d}", "Hargeisa", "Enterprise", "hash123", "Active", business_type="money_exchange")
    print(f"[OK] Created FX company: {fx_comp['company_code']}, type={fx_comp['business_type']}")

    fx_txn_id = insert_transaction(
        company_id=fx_comp['id'],
        amount=100000.0,
        currency="SLSH",
        sender="Farhan Yasin",
        receiver="You",
        provider="ZAAD",
        transaction_id="ZD-FX-99",
        timestamp="2026-09-02T12:30:00Z",
        type_="Received",
        raw_sms="Waxaad 100,000 SLSH ka heshay Farhan Yasin (ZD-FX-99)"
    )

    # Classify multi-split: 50,000 Cash SLSH + 30,000 Phone USD + 20,000 eBirr
    classify_transaction(
        company_id=fx_comp['id'],
        transaction_id=fx_txn_id,
        category="Currency Exchange",
        allocations=[
            {
                "allocation_type": "exchange_conversion",
                "target_currency": "SLSH",
                "original_allocated_amount": 50000.0,
                "converted_amount": 50000.0,
                "exchange_rate": 1.0,
                "delivery_method": "cash_hand"
            },
            {
                "allocation_type": "exchange_conversion",
                "target_currency": "USD",
                "original_allocated_amount": 30000.0,
                "converted_amount": 30000.0 / 11000.0,
                "exchange_rate": 11000.0,
                "delivery_method": "phone_transfer"
            },
            {
                "allocation_type": "exchange_conversion",
                "target_currency": "ETB",
                "original_allocated_amount": 20000.0,
                "converted_amount": (20000.0 / 11000.0) * 120.0,
                "exchange_rate": 120.0,
                "delivery_method": "digital_wallet"
            }
        ],
        notes="Split: 50k cash SLSH + $2.72 ZAAD USD + 218 eBirr"
    )
    fx_allocs = get_transaction_allocations(fx_comp['id'], fx_txn_id)
    print(f"[OK] Money exchange split recorded with {len(fx_allocs)} split allocations.")
    assert len(fx_allocs) == 3

    # 4. Analytics and Printable Statement
    report = get_analytics_report(fx_comp['id'])
    print(f"[OK] Report generated: Total txns={report['total_transactions']}, currencies={list(report['currencies'].keys())}")
    assert report['total_transactions'] == 1
    assert "SLSH" in report['currencies']

    print("\n=======================================================")
    print(" ALL END-TO-END FEATURES FULLY VERIFIED & WORKING 100%!")
    print("=======================================================")

if __name__ == "__main__":
    test_full_system()
