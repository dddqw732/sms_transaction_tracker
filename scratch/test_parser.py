from server.sms_parser import parse_sms

def run_tests():
    test_cases = [
        # 1. eDahab English / Somali
        {
            "sms": "Waxaad $10.00 ka heshay 252612345678 (Maxamed Cali). Hadhaagaagu waa $45.00. Trans ID: ED12345678.",
            "sender": "eDahab",
            "expected_amount": 10.0,
            "expected_currency": "USD",
            "expected_provider": "eDahab",
            "expected_type": "Received"
        },
        {
            "sms": "eDahab: Waxaad heshay $25.50 ka socda 252634112233. Tixraaca: 98765432. Hadhaagaaga cusub: $150.00.",
            "sender": "eDahab",
            "expected_amount": 25.50,
            "expected_currency": "USD",
            "expected_provider": "eDahab",
            "expected_type": "Received"
        },
        {
            "sms": "eDahab: Waxaad $15.00 u dirtay 252615554433. Tixraac: 55443322. Hadhaagaagu waa $30.00.",
            "sender": "eDahab",
            "expected_amount": 15.0,
            "expected_currency": "USD",
            "expected_provider": "eDahab",
            "expected_type": "Sent"
        },
        # 2. ZAAD SLSH
        {
            "sms": "Waxaad SLSH 100,000 ka heshay Axmed Cali (252634000111). Tar: 02/09/26 10:15:00. Tix: 15501073192. Hadhaagaaga: SLSH 250,000.",
            "sender": "ZAAD",
            "expected_amount": 100000.0,
            "expected_currency": "SLSH",
            "expected_provider": "ZAAD",
            "expected_type": "Received"
        },
        # 3. ZAAD USD
        {
            "sms": "Waxaad $50.00 ka heshay Xasan Nuur. Ref: 99887766. Date: 02/09/26 11:20:00. Hadhaaga: $120.00.",
            "sender": "ZAAD",
            "expected_amount": 50.0,
            "expected_currency": "USD",
            "expected_provider": "ZAAD",
            "expected_type": "Received"
        },
        # 4. EVC Plus
        {
            "sms": "[-EVC Plus-] $20 ayaa lagaa heley 252615998877. Tar: 02/09/2026 12:00:00. Tix: EVC998811.",
            "sender": "EVCPlus",
            "expected_amount": 20.0,
            "expected_currency": "USD",
            "expected_provider": "EVC Plus",
            "expected_type": "Received"
        }
    ]

    passed = 0
    for i, tc in enumerate(test_cases, 1):
        parsed = parse_sms(tc["sms"], tc["sender"])
        print(f"Test {i}: {parsed}")
        assert parsed is not None, f"Failed to parse test case {i}"
        assert parsed["amount"] == tc["expected_amount"], f"Amount mismatch in test {i}: expected {tc['expected_amount']}, got {parsed['amount']}"
        assert parsed["currency"] == tc["expected_currency"], f"Currency mismatch in test {i}: expected {tc['expected_currency']}, got {parsed['currency']}"
        assert parsed["provider"] == tc["expected_provider"], f"Provider mismatch in test {i}: expected {tc['expected_provider']}, got {parsed['provider']}"
        assert parsed["type"] == tc["expected_type"], f"Type mismatch in test {i}: expected {tc['expected_type']}, got {parsed['type']}"
        passed += 1

    print(f"\n[SUCCESS] All {passed}/{len(test_cases)} SMS parser tests passed!")

if __name__ == "__main__":
    run_tests()
