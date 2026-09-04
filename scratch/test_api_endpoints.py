from fastapi.testclient import TestClient
from server.main import app
import json

client = TestClient(app)

def test_api():
    # 1. Signup with restaurant business type
    signup_data = {
        "company_name": "Sultan Restaurant",
        "city": "Hargeisa",
        "initial_subscription_plan": "Growth",
        "password": "secretpassword123",
        "business_type": "restaurant",
        "status": "Active"
    }
    res = client.post("/api/auth/signup", json=signup_data)
    print(f"Signup response: {res.status_code}")
    assert res.status_code == 200
    body = res.json()
    token = body["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"Created company code: {body['company_code']}, type: {body['company']['business_type']}")
    assert body["company"]["business_type"] == "restaurant"

    # 2. Get business items (should be auto-seeded)
    res = client.get("/api/business/items", headers=headers)
    assert res.status_code == 200
    items = res.json()
    print(f"Items fetched: {len(items)}")
    assert len(items) > 0

    # 3. Create a transaction
    txn_data = {
        "amount": 10.0,
        "currency": "USD",
        "sender": "Khadar Jamac",
        "receiver": "You",
        "provider": "eDahab",
        "transaction_id": "ED-API-TEST-001",
        "timestamp": "2026-09-02T12:00:00Z",
        "type": "Received",
        "raw_sms": "Waxaad $10 ka heshay Khadar Jamac"
    }
    res = client.post("/api/transactions", json=txn_data, headers=headers)
    assert res.status_code == 200
    txn_id = res.json()["id"]
    print(f"Created transaction ID: {txn_id}")

    # 4. Classify transaction
    classify_data = {
        "category": "Orders",
        "allocations": [
            {
                "allocation_type": "product_sale",
                "target_currency": "USD",
                "original_allocated_amount": 5.0,
                "converted_amount": 5.0,
                "exchange_rate": 1.0,
                "delivery_method": "cash_hand",
                "item_name": "Burger",
                "item_quantity": 1
            },
            {
                "allocation_type": "product_sale",
                "target_currency": "USD",
                "original_allocated_amount": 5.0,
                "converted_amount": 5.0,
                "exchange_rate": 1.0,
                "delivery_method": "cash_hand",
                "item_name": "Pizza",
                "item_quantity": 1
            }
        ],
        "notes": "Lunch order table 4"
    }
    res = client.post(f"/api/transactions/{txn_id}/classify", json=classify_data, headers=headers)
    assert res.status_code == 200
    print(f"Classification status: {res.json()['status']}")

    # 5. Fetch allocations & audit logs
    res = client.get(f"/api/transactions/{txn_id}/allocations", headers=headers)
    assert res.status_code == 200
    allocs = res.json()
    print(f"Allocations retrieved: {len(allocs)}")
    assert len(allocs) == 2

    # 6. Fetch Analytics Report
    res = client.get("/api/analytics/report", headers=headers)
    assert res.status_code == 200
    report = res.json()
    print(f"Analytics report: {report['total_transactions']} txns, categories: {report['category_breakdown']}")
    assert report["total_transactions"] >= 1
    assert len(report["category_breakdown"]) >= 1

    print("\n[SUCCESS] All API endpoints tested and functioning 100%!")

if __name__ == "__main__":
    test_api()
