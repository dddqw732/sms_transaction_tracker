/* ═════════════════════════════════════════════════════════════════════════════ */
/* NEW FEATURES: Business Workflows, Zero-Friction Classification, Reports, FX */
/* ═════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let allInvoices = [];
let allCatalogItems = [];
let activeClassifyTxn = null;
let currentReportRange = 'today';
let activeAllocations = []; // Used for split currency exchange
let selectedMenuItems = {}; // { itemId: qty }

function secureFetch(url, options = {}) {
    if (typeof window.apiFetch === 'function') {
        return window.apiFetch(url, options);
    }
    return fetch(url, options);
}

// ─── Initialize Business Enhancements ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initBusinessTypeSelector();
    initClassifyModalEvents();
    initReportTimePills();
    initCatalogEvents();
    initManualTxnModal();
    initInvoiceEvents();
    initSeedDemoDataButton();
    initProviderCollapsible();
    initFxCalculatorWidget();
    initQuickFilterPresets();
});

// ─── 1. Business Type Selection in Signup ────────────────────────────────────
function initBusinessTypeSelector() {
    const radioInputs = document.querySelectorAll('input[name="signup-business-type"]');
    radioInputs.forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.business-type-card').forEach(c => c.classList.remove('active'));
            const parentCard = radio.closest('.business-type-card');
            if (parentCard) parentCard.classList.add('active');
        });
    });

    const cards = document.querySelectorAll('.business-type-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const radio = card.querySelector('input[type="radio"]');
            if (radio && !radio.checked) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            }
        });
    });

    const signupToLoginBtn = document.getElementById('signup-to-login-btn');
    if (signupToLoginBtn) {
        signupToLoginBtn.addEventListener('click', () => {
            if (typeof showAuthTab === 'function') showAuthTab('login');
        });
    }
}

// ─── 2. Update Business Profile Header & Badges ───────────────────────────────
function updateBusinessUI(company) {
    if (!company) return;
    const bType = company.business_type || 'restaurant';
    
    // Header Badge
    const badge = document.getElementById('header-business-badge');
    if (badge) {
        const typeLabels = {
            restaurant: 'Restaurant',
            money_exchange: 'Money Exchange',
            retail: 'Retail Store',
            pharmacy: 'Pharmacy',
            general_services: 'General Services'
        };
        badge.textContent = typeLabels[bType] || bType;
    }

    // Sidebar tag
    const tag = document.getElementById('sidebar-business-tag');
    if (tag) {
        tag.textContent = `${company.city || 'Somalia'} • ${bType.replace('_', ' ').toUpperCase()}`;
    }

    // Catalog button label & Tab 5 Customization
    const catBtn = document.getElementById('nav-catalog-btn');
    const catTitle = document.getElementById('catalog-section-title');
    const catSub = document.getElementById('catalog-section-subtitle');
    const fxManager = document.getElementById('exchange-rate-manager');
    const resetCatalogBtn = document.getElementById('reset-catalog-btn');

    if (bType === 'money_exchange') {
        if (catBtn) {
            const span = catBtn.querySelector('span');
            if (span) span.textContent = 'Exchange Rates & Services';
            else catBtn.textContent = 'Exchange Rates & Services';
        }
        if (catTitle) catTitle.textContent = 'Exchange Rates & FX Services';
        if (catSub) catSub.textContent = 'Configure live conversion rates and exchange commission fees.';
        if (resetCatalogBtn) resetCatalogBtn.style.display = 'inline-block';
        if (fxManager) {
            fxManager.classList.remove('hidden');
            try {
                const rates = JSON.parse(company.exchange_rates_json || '{}');
                if (rates.USD_TO_SLSH) document.getElementById('fx-rate-slsh').value = rates.USD_TO_SLSH;
                if (rates.USD_TO_ETB) document.getElementById('fx-rate-etb').value = rates.USD_TO_ETB;
            } catch(e) {}
        }
    } else {
        if (catBtn) {
            const span = catBtn.querySelector('span');
            const label = bType === 'restaurant' ? 'Menu & Products' : (bType === 'pharmacy' ? 'Medicines Catalog' : 'Product Catalog');
            if (span) span.textContent = label;
            else catBtn.textContent = label;
        }
        if (catTitle) catTitle.textContent = bType === 'restaurant' ? 'Menu & Food Catalog' : 'Product Catalog';
        if (catSub) catSub.textContent = 'Items created here appear on your 1-tap classification screen.';
        if (resetCatalogBtn) resetCatalogBtn.style.display = 'none';
        if (fxManager) fxManager.classList.add('hidden');
    }

    // Settings Dropdowns
    const bTypeSelect = document.getElementById('settings-business-type');
    if (bTypeSelect) bTypeSelect.value = bType;

    const baseCurSelect = document.getElementById('settings-base-currency');
    if (baseCurSelect && company.base_currency) baseCurSelect.value = company.base_currency;

    if (typeof window.syncFxWidget === 'function') {
        window.syncFxWidget();
    }

    loadCatalogItems();
    loadInvoices();
    loadAnalyticsReport(currentReportRange);
    renderCurrencyBalances();
    renderDashboardProviderCards();
}

window.updateBusinessUI = updateBusinessUI;

// ─── 3. Multi-Currency Balances Bar & Dashboard Provider Cards ────────────────
function renderCurrencyBalances(currencies) {
    const bar = document.getElementById('currency-balances-bar');
    if (!bar) return;
    bar.innerHTML = '';

    // Calculate dynamically from window.allTransactions to guarantee real-time accuracy!
    const txns = window.allTransactions || [];
    const curMap = {
        'USD': { received: 0, sent: 0, net: 0, count: 0 },
        'SLSH': { received: 0, sent: 0, net: 0, count: 0 }
    };

    txns.forEach(t => {
        let cur = (t.currency || 'USD').toUpperCase();
        if (cur === 'SOS') return; // Exclude Somali Shilling
        const amt = Number(t.amount || 0);
        if (!curMap[cur]) {
            curMap[cur] = { received: 0, sent: 0, net: 0, count: 0 };
        }
        curMap[cur].count += 1;
        if (t.type === 'Received') {
            curMap[cur].received += amt;
            curMap[cur].net += amt;
        } else {
            curMap[cur].sent += amt;
            curMap[cur].net -= amt;
        }
    });

    for (const [cur, data] of Object.entries(curMap)) {
        if (cur === 'SOS') continue;
        const isUSD = cur === 'USD';
        const sym = isUSD ? '$' : '';
        const curSuffix = !isUSD ? ` ${cur}` : '';
        const netVal = Number(data.net || 0);
        const sign = netVal > 0 ? '+' : (netVal < 0 ? '-' : '');
        const formattedNet = sign + sym + Math.abs(netVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + curSuffix;
        const inFormatted = sym + Number(data.received || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + curSuffix;
        const outFormatted = sym + Number(data.sent || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + curSuffix;

        const card = document.createElement('div');
        card.className = 'currency-pill-card';
        card.innerHTML = `
            <div class="cpc-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span class="cpc-title">${cur} Available Balance</span>
                <span class="cpc-badge ${netVal >= 0 ? 'badge-inflow' : 'badge-outflow'}" style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${netVal >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};color:${netVal >= 0 ? '#059669' : '#dc2626'};">${netVal >= 0 ? 'Surplus' : 'Deficit'}</span>
            </div>
            <div class="cpc-value ${netVal > 0 ? 'text-success' : (netVal < 0 ? 'text-danger' : '')}" style="font-size:20px;font-weight:800;">${formattedNet}</div>
            <div class="cpc-subflows" style="display:flex;gap:12px;margin-top:6px;font-size:11px;font-weight:600;">
                <span class="text-success" style="display:flex;align-items:center;gap:3px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg> ${inFormatted} In</span>
                <span class="text-danger" style="display:flex;align-items:center;gap:3px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg> ${outFormatted} Out</span>
            </div>
        `;
        bar.appendChild(card);
    }
}
window.renderCurrencyBalances = renderCurrencyBalances;

function renderDashboardProviderCards() {
    const container = document.getElementById('dashboard-provider-cards');
    if (!container) return;
    container.innerHTML = '';

    const txns = window.allTransactions || [];
    const providers = {
        'eDahab': { received: 0, sent: 0, color: '#f59e0b', currency: 'SLSH' },
        'ZAAD': { received: 0, sent: 0, color: '#10b981', currency: 'USD' },
        'EVC Plus': { received: 0, sent: 0, color: '#6366f1', currency: 'USD' },
        'Sahal': { received: 0, sent: 0, color: '#ec4899', currency: 'SLSH' }
    };

    let grandReceived = 0;
    let grandSent = 0;

    txns.forEach(t => {
        const prov = t.provider || 'Other';
        const amt = Number(t.amount || 0);
        if (!providers[prov]) {
            providers[prov] = { received: 0, sent: 0, color: '#8b5cf6', currency: t.currency || 'USD' };
        }
        if (t.type === 'Received') {
            providers[prov].received += amt;
            grandReceived += amt;
        } else {
            providers[prov].sent += amt;
            grandSent += amt;
        }
    });

    const grandNet = grandReceived - grandSent;

    // Render individual provider cards
    for (const [pName, pData] of Object.entries(providers)) {
        const net = pData.received - pData.sent;
        const cur = pData.currency;
        const sym = cur === 'USD' ? '$' : '';
        const curSuffix = cur !== 'USD' ? ` ${cur}` : '';

        const card = document.createElement('div');
        card.className = 'provider-balance-card';
        card.innerHTML = `
            <div class="pbc-header">
                <span class="pbc-title">
                    <span class="pbc-dot" style="background:${pData.color};"></span>
                    ${pName}
                </span>
                <span style="font-size:11px;font-weight:700;color:#64748b;">${cur}</span>
            </div>
            <div class="pbc-net ${net >= 0 ? 'text-success' : 'text-danger'}">
                ${net >= 0 ? '+' : ''}${sym}${net.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}${curSuffix}
            </div>
            <div class="pbc-flows">
                <span class="text-success">+${pData.received.toLocaleString(undefined, {maximumFractionDigits:1})} In</span>
                <span class="text-danger">-${pData.sent.toLocaleString(undefined, {maximumFractionDigits:1})} Out</span>
            </div>
        `;
        container.appendChild(card);
    }

    // Render Consolidated Total Card
    const totalCard = document.createElement('div');
    totalCard.className = 'provider-balance-card total-card';
    totalCard.innerHTML = `
        <div class="pbc-header">
            <span class="pbc-title" style="color:#0f172a;font-weight:800;">
                Total Consolidated
            </span>
            <span style="font-size:10px;font-weight:800;color:#6366f1;background:rgba(99,102,241,0.1);padding:2px 6px;border-radius:4px;">ALL WALLETS</span>
        </div>
        <div class="pbc-net ${grandNet >= 0 ? 'text-success' : 'text-danger'}" style="font-size:20px;">
            ${grandNet >= 0 ? '+' : ''}${grandNet.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
        </div>
        <div class="pbc-flows">
            <span class="text-success">+${grandReceived.toLocaleString(undefined, {maximumFractionDigits:0})} Total In</span>
            <span class="text-danger">-${grandSent.toLocaleString(undefined, {maximumFractionDigits:0})} Total Out</span>
        </div>
    `;
    container.appendChild(totalCard);
}

window.renderDashboardProviderCards = renderDashboardProviderCards;

// ─── Collapsible Provider Wallets Section ────────────────────────────────────
function initProviderCollapsible() {
    const toggleHeader = document.getElementById('provider-toggle-header');
    const collapsible = document.getElementById('provider-cards-collapsible');
    const chevron = document.getElementById('provider-toggle-chevron');
    const hint = document.getElementById('provider-toggle-hint');
    if (!toggleHeader || !collapsible) return;

    if (toggleHeader.dataset.bound === 'true') return;
    toggleHeader.dataset.bound = 'true';

    function applyState(collapsed) {
        if (collapsed) {
            collapsible.classList.add('collapsed');
            collapsible.style.display = 'none';
            if (chevron) chevron.style.transform = 'rotate(-90deg)';
            if (hint) hint.textContent = 'Click to expand';
        } else {
            collapsible.classList.remove('collapsed');
            collapsible.style.display = 'block';
            if (chevron) chevron.style.transform = 'rotate(0deg)';
            if (hint) hint.textContent = 'Click to collapse';
        }
    }

    const isCollapsed = localStorage.getItem('provider_cards_collapsed') === 'true';
    applyState(isCollapsed);

    toggleHeader.addEventListener('click', () => {
        const currentlyCollapsed = collapsible.style.display !== 'none';
        applyState(currentlyCollapsed);
        localStorage.setItem('provider_cards_collapsed', currentlyCollapsed ? 'true' : 'false');
    });
}
window.initProviderCollapsible = initProviderCollapsible;

// ─── Live FX Currency Calculator Widget ──────────────────────────────────────
function initFxCalculatorWidget() {
    const usdInput = document.getElementById('fx-calc-usd');
    const slshInput = document.getElementById('fx-calc-slsh');
    const rateBadge = document.getElementById('fx-widget-rate-badge');
    if (!usdInput || !slshInput) return;

    function getRate() {
        let rate = 11000;
        try {
            if (window.currentCompany && window.currentCompany.exchange_rates_json) {
                const parsed = JSON.parse(window.currentCompany.exchange_rates_json);
                if (parsed.USD_TO_SLSH) rate = parseFloat(parsed.USD_TO_SLSH) || 11000;
            }
        } catch(e) {}
        return rate;
    }

    function syncWidget() {
        const rate = getRate();
        if (rateBadge) rateBadge.textContent = `1 USD = ${rate.toLocaleString()} SLSH`;
        const usdVal = parseFloat(usdInput.value) || 0;
        const slshVal = usdVal * rate;
        slshInput.value = `${slshVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} SLSH`;
    }

    usdInput.addEventListener('input', syncWidget);
    window.syncFxWidget = syncWidget;
    syncWidget();
}

// ─── Quick Filter Presets Bar ────────────────────────────────────────────────
function initQuickFilterPresets() {
    const presetsContainer = document.getElementById('quick-filter-presets');
    if (!presetsContainer) return;

    presetsContainer.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            presetsContainer.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const preset = chip.dataset.preset;

            const pFilter = document.getElementById('provider-filter');
            const cFilter = document.getElementById('category-filter');
            const sInput = document.getElementById('search-input');
            const typeBtns = document.querySelectorAll('.type-filter-group .filter-btn');

            if (preset === 'all') {
                if (typeof window.setSearchQuery === 'function') window.setSearchQuery('');
                if (typeof window.setFilterType === 'function') window.setFilterType('');
                if (pFilter) pFilter.value = '';
                if (cFilter) cFilter.value = '';
                if (sInput) sInput.value = '';
                typeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === ''));
            } else if (preset === 'today') {
                const todayStr = new Date().toISOString().slice(0, 10);
                if (sInput) {
                    sInput.value = todayStr;
                    sInput.dispatchEvent(new Event('input'));
                }
            } else if (preset === 'inflow') {
                if (typeof window.setFilterType === 'function') window.setFilterType('Received');
                typeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === 'Received'));
            } else if (preset === 'outflow') {
                if (typeof window.setFilterType === 'function') window.setFilterType('Sent');
                typeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === 'Sent'));
            } else if (preset === 'unclassified') {
                if (cFilter) {
                    cFilter.value = 'Unclassified';
                    cFilter.dispatchEvent(new Event('change'));
                }
            } else if (preset === 'large') {
                if (typeof window.setHighValueFilter === 'function') window.setHighValueFilter(100);
            }

            if (typeof window.applyFilters === 'function') {
                window.applyFilters();
            }
        });
    });
}

window.renderDashboardProviderCards = renderDashboardProviderCards;

// ─── 4. Zero-Friction Adaptive Classification Modal ──────────────────────────
function openClassifyModal(txn) {
    activeClassifyTxn = txn;
    const modal = document.getElementById('classify-modal');
    if (!modal) return;

    // Header Details
    const provBadge = document.getElementById('modal-provider-badge');
    const amtTitle = document.getElementById('modal-amount-title');
    const senderSub = document.getElementById('modal-sender-subtitle');

    if (provBadge) provBadge.textContent = `${txn.provider || 'SMS'} • ${txn.type || 'Received'}`;
    if (amtTitle) amtTitle.textContent = `${txn.currency === 'USD' ? '$' : ''}${Number(txn.amount).toLocaleString()} ${txn.currency !== 'USD' ? txn.currency : ''}`;
    if (senderSub) senderSub.textContent = txn.type === 'Received' ? `From: ${txn.sender || 'Customer'}` : `To: ${txn.receiver || 'Recipient'}`;

    renderAdaptiveClassificationBody(txn);
    modal.classList.remove('hidden');
}

window.openClassifyModal = openClassifyModal;

function closeClassifyModal() {
    const modal = document.getElementById('classify-modal');
    if (modal) modal.classList.add('hidden');
    activeClassifyTxn = null;
    activeAllocations = [];
    selectedMenuItems = {};
}

function initClassifyModalEvents() {
    const closeBtn = document.getElementById('classify-close-btn');
    const overlay = document.getElementById('classify-overlay');
    if (closeBtn) closeBtn.addEventListener('click', closeClassifyModal);
    if (overlay) overlay.addEventListener('click', closeClassifyModal);

    // Notification classify button
    const notifBtn = document.getElementById('notification-classify-btn');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            const popup = document.getElementById('notification-popup');
            if (popup && popup.dataset.txn) {
                try {
                    const txn = JSON.parse(popup.dataset.txn);
                    popup.classList.add('hidden');
                    openClassifyModal(txn);
                } catch (e) {
                    console.error('Error opening notification txn', e);
                }
            }
        });
    }
}

function renderAdaptiveClassificationBody(txn) {
    const body = document.getElementById('classify-modal-body');
    if (!body) return;
    body.innerHTML = '';

    const bType = (window.currentCompany && window.currentCompany.business_type) || 'restaurant';

    if (bType === 'money_exchange') {
        renderMoneyExchangeWorkflow(body, txn);
    } else if (bType === 'restaurant') {
        renderRestaurantWorkflow(body, txn);
    } else if (bType === 'pharmacy') {
        renderPharmacyWorkflow(body, txn);
    } else {
        renderRetailWorkflow(body, txn);
    }
}

// ─── 4A. Restaurant Workflow (Menu Cards & 1-Tap Presets) ─────────────────────
function renderRestaurantWorkflow(container, txn) {
    selectedMenuItems = {};
    const wrap = document.createElement('div');

    wrap.innerHTML = `
        <div class="menu-items-section-title">
            <span>Quick 1-Tap Category</span>
        </div>
        <div class="quick-preset-row">
            <button class="preset-btn active" data-cat="Orders">Food Order</button>
            <button class="preset-btn" data-cat="Drinks">Drinks</button>
            <button class="preset-btn" data-cat="Delivery">Delivery</button>
            <button class="preset-btn" data-cat="Takeout">Takeout</button>
            <button class="preset-btn" data-cat="Customer Payment">Payment</button>
        </div>

        <div class="menu-items-section-title">
            <span>Select Menu Items (Optional)</span>
            <span id="order-sum-indicator" style="font-weight:700;color:#10b981;">Selected: $0.00 / $${txn.amount}</span>
        </div>
        <div class="menu-items-grid" id="modal-menu-grid">
            <!-- Rendered from catalog items -->
        </div>

        <div style="margin-top:16px;display:flex;gap:10px;">
            <button id="btn-submit-classification" class="btn btn-primary btn-full">Confirm & Save Order</button>
        </div>
    `;

    container.appendChild(wrap);

    // Preset buttons click
    const presetBtns = wrap.querySelectorAll('.preset-btn');
    let selectedCategory = 'Orders';
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCategory = btn.dataset.cat;
        });
    });

    // Populate Menu Items
    const grid = wrap.querySelector('#modal-menu-grid');
    if (allCatalogItems && allCatalogItems.length > 0) {
        allCatalogItems.forEach(item => {
            const card = document.createElement('div');
            card.className = 'menu-item-card';
            card.innerHTML = `
                <span class="mic-name">${item.name}</span>
                <div class="mic-bottom">
                    <span class="mic-price">$${Number(item.price).toFixed(2)}</span>
                    <span class="mic-qty hidden" id="qty-${item.id}">0</span>
                </div>
            `;
            card.addEventListener('click', () => {
                const current = selectedMenuItems[item.id] || 0;
                selectedMenuItems[item.id] = current + 1;
                card.classList.add('selected');
                const qtyBadge = card.querySelector(`#qty-${item.id}`);
                qtyBadge.textContent = `${selectedMenuItems[item.id]}x`;
                qtyBadge.classList.remove('hidden');

                // Update sum
                updateOrderSum(txn.amount);
            });
            grid.appendChild(card);
        });
    } else {
        grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1;font-size:12px;">No menu items configured yet. You can add them in the Menu tab.</p>';
    }

    // Submit Action
    wrap.querySelector('#btn-submit-classification').addEventListener('click', () => {
        const allocations = [];
        for (const [itemId, qty] of Object.entries(selectedMenuItems)) {
            const item = allCatalogItems.find(i => i.id == itemId);
            if (item) {
                allocations.push({
                    allocation_type: 'product_sale',
                    target_currency: item.currency || 'USD',
                    original_allocated_amount: item.price * qty,
                    converted_amount: item.price * qty,
                    exchange_rate: 1.0,
                    delivery_method: 'cash_hand',
                    item_id: item.id,
                    item_name: item.name,
                    item_quantity: qty
                });
            }
        }

        submitClassification(txn.id, selectedCategory, allocations);
    });
}

function updateOrderSum(targetAmount) {
    let sum = 0;
    for (const [itemId, qty] of Object.entries(selectedMenuItems)) {
        const item = allCatalogItems.find(i => i.id == itemId);
        if (item) sum += item.price * qty;
    }
    const el = document.getElementById('order-sum-indicator');
    if (el) {
        el.textContent = `Selected: $${sum.toFixed(2)} / $${Number(targetAmount).toFixed(2)}`;
    }
}

// ─── 4B. Money Exchange Workflow (Fluid Sliders & Split Conversion) ───────────
function renderMoneyExchangeWorkflow(container, txn) {
    const origAmount = Number(txn.amount);
    const origCurrency = txn.currency || 'SLSH';

    activeAllocations = [
        {
            target_currency: origCurrency === 'SLSH' ? 'USD' : 'SLSH',
            original_allocated_amount: origAmount,
            converted_amount: calculateConverted(origAmount, origCurrency, origCurrency === 'SLSH' ? 'USD' : 'SLSH'),
            exchange_rate: 11000,
            delivery_method: 'cash_hand'
        }
    ];

    const wrap = document.createElement('div');
    wrap.className = 'split-exchange-container';

    wrap.innerHTML = `
        <div class="menu-items-section-title">
            <span>Split Exchange Allocation</span>
            <span id="fx-remaining-badge" class="remaining-alloc-indicator complete">Remaining: 0 ${origCurrency}</span>
        </div>

        <div id="split-cards-container">
            <!-- Dynamic Split Cards -->
        </div>

        <button id="add-split-btn" class="btn btn-secondary btn-sm" style="margin-top:4px;">+ Add Another Split Currency</button>

        <div style="margin-top:16px;">
            <button id="btn-submit-fx" class="btn btn-primary btn-full">Confirm & Record Exchange</button>
        </div>
    `;

    container.appendChild(wrap);

    renderSplitCards(wrap, origAmount, origCurrency);

    wrap.querySelector('#add-split-btn').addEventListener('click', () => {
        const allocatedSum = activeAllocations.reduce((sum, a) => sum + (Number(a.original_allocated_amount) || 0), 0);
        const remainder = Math.max(0, origAmount - allocatedSum);

        activeAllocations.push({
            target_currency: 'ETB',
            original_allocated_amount: remainder,
            converted_amount: calculateConverted(remainder, origCurrency, 'ETB'),
            exchange_rate: 120,
            delivery_method: 'phone_transfer'
        });

        renderSplitCards(wrap, origAmount, origCurrency);
    });

    wrap.querySelector('#btn-submit-fx').addEventListener('click', () => {
        submitClassification(txn.id, 'Currency Exchange', activeAllocations);
    });
}

function renderSplitCards(wrap, origAmount, origCurrency) {
    const cardsContainer = wrap.querySelector('#split-cards-container');
    if (!cardsContainer) return;
    cardsContainer.innerHTML = '';

    activeAllocations.forEach((alloc, index) => {
        const card = document.createElement('div');
        card.className = 'split-card';
        card.innerHTML = `
            <div class="split-card-header">
                <span style="font-size:13px;font-weight:700;">Split #${index + 1}</span>
                <div class="target-currency-pills">
                    <button class="target-curr-btn ${alloc.target_currency === 'USD' ? 'active' : ''}" data-idx="${index}" data-cur="USD">USD ($)</button>
                    <button class="target-curr-btn ${alloc.target_currency === 'SLSH' ? 'active' : ''}" data-idx="${index}" data-cur="SLSH">SLSH</button>
                    <button class="target-curr-btn ${alloc.target_currency === 'ETB' ? 'active' : ''}" data-idx="${index}" data-cur="ETB">eBirr (ETB)</button>
                </div>
            </div>

            <!-- Slider Control -->
            <div class="slider-control-wrap">
                <div class="slider-row">
                    <input type="range" class="allocation-slider" min="0" max="${origAmount}" step="${origAmount > 1000 ? 1000 : 1}" value="${alloc.original_allocated_amount}">
                    <span class="slider-val-badge">${Number(alloc.original_allocated_amount).toLocaleString()} ${origCurrency}</span>
                </div>
                <div class="slider-chips-row">
                    <button class="chip-btn" data-pct="0.25">25%</button>
                    <button class="chip-btn" data-pct="0.50">50%</button>
                    <button class="chip-btn" data-pct="0.75">75%</button>
                    <button class="chip-btn" data-pct="1.00">100%</button>
                </div>
            </div>

            <!-- Conversion Display -->
            <div style="font-size:13px;font-weight:700;color:#6366f1;margin:6px 0;">
                Converted Output: ≈ ${alloc.target_currency === 'USD' ? '$' : ''}${Number(alloc.converted_amount).toLocaleString(undefined, {maximumFractionDigits:2})} ${alloc.target_currency !== 'USD' ? alloc.target_currency : ''}
            </div>

            <!-- Delivery Method -->
            <label style="font-size:11px;font-weight:700;color:#64748b;margin-top:6px;display:block;">Delivery Method:</label>
            <div class="delivery-methods-row">
                <button class="delivery-btn ${alloc.delivery_method === 'cash_hand' ? 'active' : ''}" data-method="cash_hand">Cash / Hand</button>
                <button class="delivery-btn ${alloc.delivery_method === 'phone_transfer' ? 'active' : ''}" data-method="phone_transfer">Phone Transfer</button>
                <button class="delivery-btn ${alloc.delivery_method === 'bank' ? 'active' : ''}" data-method="bank">Bank</button>
                <button class="delivery-btn ${alloc.delivery_method === 'digital_wallet' ? 'active' : ''}" data-method="digital_wallet">eBirr / Digital</button>
            </div>
        `;

        // Range slider input
        const slider = card.querySelector('.allocation-slider');
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) || 0;
            alloc.original_allocated_amount = val;
            alloc.converted_amount = calculateConverted(val, origCurrency, alloc.target_currency);
            renderSplitCards(wrap, origAmount, origCurrency);
        });

        // Quick % Chips
        card.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const pct = parseFloat(btn.dataset.pct);
                alloc.original_allocated_amount = origAmount * pct;
                alloc.converted_amount = calculateConverted(alloc.original_allocated_amount, origCurrency, alloc.target_currency);
                renderSplitCards(wrap, origAmount, origCurrency);
            });
        });

        // Currency buttons
        card.querySelectorAll('.target-curr-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                alloc.target_currency = btn.dataset.cur;
                alloc.converted_amount = calculateConverted(alloc.original_allocated_amount, origCurrency, alloc.target_currency);
                renderSplitCards(wrap, origAmount, origCurrency);
            });
        });

        // Delivery buttons
        card.querySelectorAll('.delivery-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                alloc.delivery_method = btn.dataset.method;
                renderSplitCards(wrap, origAmount, origCurrency);
            });
        });

        cardsContainer.appendChild(card);
    });

    // Update Remaining Badge
    const allocatedSum = activeAllocations.reduce((sum, a) => sum + (Number(a.original_allocated_amount) || 0), 0);
    const rem = origAmount - allocatedSum;
    const badge = wrap.querySelector('#fx-remaining-badge');
    if (badge) {
        if (Math.abs(rem) < 0.01) {
            badge.className = 'remaining-alloc-indicator complete';
            badge.textContent = `Fully Allocated (${origAmount.toLocaleString()} ${origCurrency})`;
        } else if (rem > 0) {
            badge.className = 'remaining-alloc-indicator remaining';
            badge.textContent = `Remaining to allocate: ${rem.toLocaleString()} ${origCurrency}`;
        } else {
            badge.className = 'remaining-alloc-indicator';
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
            badge.style.color = '#dc2626';
            badge.textContent = `Over-allocated by ${Math.abs(rem).toLocaleString()} ${origCurrency}`;
        }
    }
}

function calculateConverted(amount, fromCur, toCur) {
    if (fromCur === toCur) return amount;
    let rateSLSH = 11000;
    let rateETB = 120;
    try {
        if (window.currentCompany && window.currentCompany.exchange_rates_json) {
            const parsed = JSON.parse(window.currentCompany.exchange_rates_json);
            if (parsed.USD_TO_SLSH) rateSLSH = parseFloat(parsed.USD_TO_SLSH) || 11000;
            if (parsed.USD_TO_ETB) rateETB = parseFloat(parsed.USD_TO_ETB) || 120;
        }
    } catch(e) {}

    if (fromCur === 'SLSH' && toCur === 'USD') return amount / rateSLSH;
    if (fromCur === 'USD' && toCur === 'SLSH') return amount * rateSLSH;
    if (fromCur === 'SLSH' && toCur === 'ETB') return (amount / rateSLSH) * rateETB;
    if (fromCur === 'ETB' && toCur === 'USD') return amount / rateETB;
    if (fromCur === 'USD' && toCur === 'ETB') return amount * rateETB;
    return amount;
}

// ─── 4C. Retail & Pharmacy Workflows ─────────────────────────────────────────
function renderRetailWorkflow(container, txn) {
    renderFastCategoryWorkflow(container, txn, [
        { label: 'Product Sale', cat: 'Product Sale' },
        { label: 'Wholesale', cat: 'Wholesale' },
        { label: 'Invoice Payment', cat: 'Invoice Payment' },
        { label: 'Return / Refund', cat: 'Refund' },
        { label: 'Other Income', cat: 'Other' },
    ]);
}

function renderPharmacyWorkflow(container, txn) {
    renderFastCategoryWorkflow(container, txn, [
        { label: 'Prescription Sale', cat: 'Prescription Sale' },
        { label: 'Health Product', cat: 'Health Product' },
        { label: 'Medical Supplies', cat: 'Medical Supplies' },
        { label: 'Customer Payment', cat: 'Customer Payment' },
        { label: 'Refund', cat: 'Refund' },
    ]);
}

function renderFastCategoryWorkflow(container, txn, presets) {
    const wrap = document.createElement('div');
    let selectedCat = presets[0].cat;

    let buttonsHtml = presets.map((p, i) => `
        <button class="preset-btn ${i === 0 ? 'active' : ''}" data-cat="${p.cat}">${p.label}</button>
    `).join('');

    wrap.innerHTML = `
        <div class="menu-items-section-title">
            <span>Fast Classification</span>
        </div>
        <div class="quick-preset-row">
            ${buttonsHtml}
        </div>
        <div style="margin-top: 16px;">
            <button id="btn-submit-fast-cat" class="btn btn-primary btn-full">Save & Confirm</button>
        </div>
    `;

    container.appendChild(wrap);

    wrap.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            wrap.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCat = btn.dataset.cat;
        });
    });

    wrap.querySelector('#btn-submit-fast-cat').addEventListener('click', () => {
        submitClassification(txn.id, selectedCat, [{
            allocation_type: 'general',
            target_currency: txn.currency || 'USD',
            original_allocated_amount: txn.amount,
            converted_amount: txn.amount,
            exchange_rate: 1.0,
            delivery_method: 'cash_hand'
        }]);
    });
}

// ─── 4D. Submit Classification API Call (Super Fast & Optimistic) ────────────
async function submitClassification(txnId, category, allocations) {
    // 1. Optimistic UI update: immediately close modal
    closeClassifyModal();

    // 2. Immediate feedback toast
    if (typeof window.showToast === 'function') {
        window.showToast(`Transaction classified as ${category}`, 'success');
    }

    // 3. Update local in-memory transaction and re-render DOM instantly
    if (window.allTransactions) {
        const localTxn = window.allTransactions.find(t => t.id == txnId);
        if (localTxn) {
            localTxn.category = category;
            localTxn.is_classified = 1;
            localTxn.classification_data = JSON.stringify({
                category: category,
                allocations_count: allocations.length,
                classified_at: new Date().toISOString()
            });
            if (typeof window.applyFilters === 'function') {
                window.applyFilters();
            }
            if (typeof window.updateMetrics === 'function') {
                window.updateMetrics();
            }
        }
    }

    // 4. Send network request asynchronously in background
    try {
        const res = await secureFetch(`/api/transactions/${txnId}/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: category,
                allocations: allocations,
                notes: `Classified (${category})`
            })
        });

        if (!res.ok) {
            console.error('Failed to save classification on server');
            if (typeof window.loadTransactions === 'function') {
                window.loadTransactions();
            }
        } else {
            loadAnalyticsReport(currentReportRange);
        }
    } catch (e) {
        console.error('Classification error', e);
    }
}

// ─── 5. Analytics & Printable Reports Dashboard ──────────────────────────────
function initReportTimePills() {
    const pills = document.querySelectorAll('.time-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentReportRange = pill.dataset.range;

            const customBar = document.getElementById('custom-date-bar');
            if (currentReportRange === 'custom') {
                if (customBar) customBar.classList.remove('hidden');
            } else {
                if (customBar) customBar.classList.add('hidden');
                loadAnalyticsReport(currentReportRange);
            }
        });
    });

    const customApplyBtn = document.getElementById('apply-custom-date-btn');
    if (customApplyBtn) {
        customApplyBtn.addEventListener('click', () => {
            const start = document.getElementById('rep-start-date').value;
            const end = document.getElementById('rep-end-date').value;
            loadAnalyticsReport('custom', start, end);
        });
    }

    // ─── Print Financial Statement Handler ──────────────────────────────────
    const printBtn = document.getElementById('print-statement-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            document.body.classList.remove('printing-invoice-mode');
            window.print();
        });
    }

    // ─── Export Excel Handler ───────────────────────────────────────────────
    const exportExcelBtn = document.getElementById('export-excel-btn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', async () => {
            try {
                let url = '/api/export/excel';
                const now = new Date();
                if (currentReportRange === 'today') {
                    const d = now.toISOString().split('T')[0];
                    url += `?start_date=${d}&end_date=${d}`;
                } else if (currentReportRange === 'yesterday') {
                    const yest = new Date(now);
                    yest.setDate(yest.getDate() - 1);
                    const d = yest.toISOString().split('T')[0];
                    url += `?start_date=${d}&end_date=${d}`;
                } else if (currentReportRange === 'this_week') {
                    const d = new Date(now);
                    d.setDate(d.getDate() - 7);
                    url += `?start_date=${d.toISOString().split('T')[0]}&end_date=${now.toISOString().split('T')[0]}`;
                } else if (currentReportRange === 'custom') {
                    const s = document.getElementById('rep-start-date').value;
                    const e = document.getElementById('rep-end-date').value;
                    if (s && e) url += `?start_date=${s}&end_date=${e}`;
                }

                if (typeof window.showToast === 'function') {
                    window.showToast('Generating Excel spreadsheet...', 'success');
                }

                const res = await secureFetch(url);
                if (!res.ok) throw new Error('Excel generation failed');
                
                const blob = await res.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `financial_statement_${currentReportRange}_${new Date().toISOString().slice(0,10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(downloadUrl);

                if (typeof window.showToast === 'function') {
                    window.showToast('Excel report downloaded successfully! 📊', 'success');
                }
            } catch (err) {
                console.error('Export Excel error', err);
                alert('Could not export Excel: ' + err.message);
            }
        });
    }
}

async function loadAnalyticsReport(range = 'today', startDate = null, endDate = null) {
    let url = '/api/analytics/report';
    const now = new Date();

    if (range === 'today') {
        const d = now.toISOString().split('T')[0];
        url += `?start_date=${d}&end_date=${d}`;
    } else if (range === 'yesterday') {
        const yest = new Date(now);
        yest.setDate(yest.getDate() - 1);
        const d = yest.toISOString().split('T')[0];
        url += `?start_date=${d}&end_date=${d}`;
    } else if (range === 'this_week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        url += `?start_date=${d.toISOString().split('T')[0]}&end_date=${now.toISOString().split('T')[0]}`;
    } else if (range === 'last_week') {
        const end = new Date(now);
        end.setDate(end.getDate() - 7);
        const start = new Date(now);
        start.setDate(start.getDate() - 14);
        url += `?start_date=${start.toISOString().split('T')[0]}&end_date=${end.toISOString().split('T')[0]}`;
    } else if (range === 'this_month') {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        url += `?start_date=${d.toISOString().split('T')[0]}&end_date=${now.toISOString().split('T')[0]}`;
    } else if (range === 'last_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        url += `?start_date=${start.toISOString().split('T')[0]}&end_date=${end.toISOString().split('T')[0]}`;
    } else if (range === 'custom' && startDate && endDate) {
        url += `?start_date=${startDate}&end_date=${endDate}`;
    }

    try {
        const res = await secureFetch(url);
        if (res.ok) {
            const report = await res.json();
            renderReportDashboard(report, range);
            renderCurrencyBalances(report.currencies);
            renderDashboardProviderCards();
        }
    } catch (e) {
        console.error('Analytics load error', e);
    }
}

function renderReportDashboard(report, rangeLabel) {
    // KPI Cards
    let totalReceived = 0;
    let totalSent = 0;
    for (const curData of Object.values(report.currencies || {})) {
        totalReceived += curData.received;
        totalSent += curData.sent;
    }

    const recEl = document.getElementById('report-total-received');
    const sentEl = document.getElementById('report-total-sent');
    const netEl = document.getElementById('report-net-change');

    if (recEl) recEl.textContent = `$${totalReceived.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    if (sentEl) sentEl.textContent = `$${totalSent.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    if (netEl) {
        const diff = totalReceived - totalSent;
        netEl.textContent = `${diff >= 0 ? '+' : ''}$${diff.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        netEl.className = `metric-value ${diff >= 0 ? 'text-success' : 'text-danger'}`;
    }

    // Statement KPIs for Print / Preview
    const stmtRec = document.getElementById('stmt-kpi-received');
    const stmtSent = document.getElementById('stmt-kpi-sent');
    const stmtNet = document.getElementById('stmt-kpi-net');
    const diff = totalReceived - totalSent;

    if (stmtRec) stmtRec.textContent = `+ $${totalReceived.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    if (stmtSent) stmtSent.textContent = `- $${totalSent.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
    if (stmtNet) {
        stmtNet.textContent = `${diff >= 0 ? '+' : ''}$${diff.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`;
        stmtNet.className = `stmt-kpi-val ${diff >= 0 ? 'text-success' : 'text-danger'}`;
    }

    // Currency Statement Table
    const tbody = document.getElementById('statement-currency-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        const curEntries = Object.entries(report.currencies || {});
        if (curEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#64748b;">No multi-currency activity in this period.</td></tr>';
        } else {
            for (const [cur, data] of curEntries) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${cur}</strong></td>
                    <td style="color:#10b981;">+${data.received.toLocaleString(undefined, {minimumFractionDigits:2})} ${cur}</td>
                    <td style="color:#ef4444;">-${data.sent.toLocaleString(undefined, {minimumFractionDigits:2})} ${cur}</td>
                    <td style="font-weight:800;color:${data.net >= 0 ? '#10b981' : '#ef4444'};">${data.net >= 0 ? '+' : ''}${data.net.toLocaleString(undefined, {minimumFractionDigits:2})} ${cur}</td>
                `;
                tbody.appendChild(tr);
            }
        }
    }

    // ─── Provider Net Balance Table ───────────────────────────────────────────
    const providerTbody = document.getElementById('statement-provider-tbody');
    const providerTfoot = document.getElementById('statement-provider-tfoot');
    if (providerTbody) {
        providerTbody.innerHTML = '';
        const providers = report.provider_breakdown || [];
        let grandReceived = 0, grandSent = 0, grandNet = 0;

        const providerColors = {
            'eDahab': '#f59e0b',
            'ZAAD': '#10b981',
            'EVC Plus': '#6366f1',
            'Sahal': '#ec4899',
        };

        if (providers.length === 0) {
            providerTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#64748b;">No provider transactions in this timeframe.</td></tr>';
        } else {
            providers.forEach(item => {
                const received = Number(item.received) || 0;
                const sent = Number(item.sent) || 0;
                const net = item.net !== undefined ? Number(item.net) : (received - sent);
                grandReceived += received;
                grandSent += sent;
                grandNet += net;

                const color = providerColors[item.provider] || '#8b5cf6';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <span style="display:inline-flex;align-items:center;gap:6px;">
                            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></span>
                            <strong>${item.provider}</strong>
                        </span>
                    </td>
                    <td style="color:#10b981;">+${received.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                    <td style="color:#ef4444;">-${sent.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                    <td style="font-weight:800;color:${net >= 0 ? '#10b981' : '#ef4444'};"
                        >${net >= 0 ? '+' : ''}${net.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                `;
                providerTbody.appendChild(tr);
            });
        }

        // Total row in tfoot
        if (providerTfoot) {
            const netColor = grandNet >= 0 ? '#10b981' : '#ef4444';
            providerTfoot.innerHTML = `
                <tr style="background:linear-gradient(90deg,rgba(99,102,241,0.08),rgba(16,185,129,0.06));border-top:2px solid #e2e8f0;">
                    <td style="font-size:13px;font-weight:800;color:#0f172a;">💰 TOTAL (Consolidated Wallets)</td>
                    <td style="font-size:13px;font-weight:800;color:#10b981;">+${grandReceived.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                    <td style="font-size:13px;font-weight:800;color:#ef4444;">-${grandSent.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                    <td style="font-size:14px;font-weight:900;color:${netColor};">${grandNet >= 0 ? '+' : ''}${grandNet.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                </tr>
            `;
        }
    }

    // ─── Statement Transactions Breakdown ─────────────────────────────────────
    const txnsTbody = document.getElementById('statement-txns-tbody');
    if (txnsTbody) {
        txnsTbody.innerHTML = '';
        const preview = report.transactions_preview || [];
        if (preview.length === 0) {
            txnsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;">No transactions recorded in this period.</td></tr>';
        } else {
            preview.slice(0, 15).forEach(t => {
                const dateStr = new Date(t.timestamp).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const isRec = t.type === 'Received';
                const party = isRec ? (t.sender || 'Customer') : (t.receiver || 'Recipient');
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td><span style="font-weight:700;color:${isRec ? '#10b981' : '#ef4444'};">${t.type}</span></td>
                    <td><b>${t.provider || '-'}</b></td>
                    <td>${party}</td>
                    <td>${t.category || 'General'}</td>
                    <td style="font-weight:700;color:${isRec ? '#10b981' : '#ef4444'};">${isRec ? '+' : '-'}${Number(t.amount).toLocaleString(undefined, {minimumFractionDigits:2})} ${t.currency}</td>
                `;
                txnsTbody.appendChild(tr);
            });
        }
    }

    // Statement Meta
    const compEl = document.getElementById('stmt-company-name');
    const compSub = document.getElementById('stmt-company-sub');
    if (window.currentCompany) {
        if (compEl) compEl.textContent = `${window.currentCompany.company_name} — Financial Statement`;
        if (compSub) compSub.textContent = `${window.currentCompany.city || 'Somalia'} • Type: ${(window.currentCompany.business_type || 'General').toUpperCase()} • Code: ${window.currentCompany.company_code}`;
    }

    const perEl = document.getElementById('stmt-period-label');
    if (perEl) {
        perEl.textContent = `Period: ${rangeLabel.replace('_', ' ').toUpperCase()}`;
    }

    const genEl = document.getElementById('stmt-generated-date');
    if (genEl) {
        genEl.textContent = `Generated: ${new Date().toLocaleString()}`;
    }

    const refBadge = document.getElementById('stmt-ref-badge');
    if (refBadge && window.currentCompany) {
        refBadge.textContent = `REF: ${window.currentCompany.company_code}-${new Date().toISOString().slice(0,10)}`;
    }

    const prepDate = document.getElementById('signoff-prep-date');
    const authDate = document.getElementById('signoff-auth-date');
    const todayStr = `Date: ${new Date().toISOString().slice(0,10)}`;
    if (prepDate) prepDate.textContent = todayStr;
    if (authDate) authDate.textContent = todayStr;

    // Render Canvas Charts
    renderCashflowCanvasChart(report.daily_timeline || []);
    renderCategoryCanvasChart(report.category_breakdown || []);
    renderProviderCanvasChart(report.provider_breakdown || []);
}

// ─── 6. Modern Canvas Chart Renderers ─────────────────────────────────────────
function renderCashflowCanvasChart(timeline) {
    const canvas = document.getElementById('cashflow-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth || 500;
    canvas.height = 220;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!timeline || timeline.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No cashflow data in this timeframe', canvas.width / 2, canvas.height / 2);
        return;
    }

    const padding = 35;
    const chartW = canvas.width - padding * 2;
    const chartH = canvas.height - padding * 2;

    const maxVal = Math.max(...timeline.map(t => Math.max(t.received, t.sent)), 100);
    const barWidth = Math.min(30, (chartW / (timeline.length * 2.5)));

    timeline.forEach((item, idx) => {
        const x = padding + (idx * (chartW / timeline.length)) + 15;

        // Received Bar (Green)
        const recH = (item.received / maxVal) * chartH;
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - padding - recH, barWidth, recH, [4, 4, 0, 0]);
        ctx.fill();

        // Sent Bar (Red)
        const sentH = (item.sent / maxVal) * chartH;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.roundRect(x + barWidth + 4, canvas.height - padding - sentH, barWidth, sentH, [4, 4, 0, 0]);
        ctx.fill();

        // Date Label
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.date.slice(5), x + barWidth, canvas.height - 10);
    });
}

function renderCategoryCanvasChart(breakdown) {
    const canvas = document.getElementById('category-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth || 250;
    canvas.height = 220;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!breakdown || breakdown.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No categorised income', canvas.width / 2, canvas.height / 2);
        return;
    }

    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    const total = breakdown.reduce((sum, b) => sum + b.amount, 0) || 1;
    let startAngle = -0.5 * Math.PI;

    const centerX = canvas.width / 2;
    const centerY = 90;
    const radius = 60;

    breakdown.slice(0, 5).forEach((item, idx) => {
        const sliceAngle = (item.amount / total) * 2 * Math.PI;
        ctx.fillStyle = colors[idx % colors.length];
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        startAngle += sliceAngle;
    });

    // Inner Donut Hole
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 35, 0, 2 * Math.PI);
    ctx.fill();

    // Legend
    let legendY = 175;
    breakdown.slice(0, 3).forEach((item, idx) => {
        ctx.fillStyle = colors[idx % colors.length];
        ctx.fillRect(20, legendY - 8, 10, 10);
        ctx.fillStyle = '#334155';
        ctx.font = '11px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${item.category}: $${item.amount.toLocaleString()}`, 36, legendY);
        legendY += 15;
    });
}

function renderProviderCanvasChart(breakdown) {
    const canvas = document.getElementById('provider-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.clientWidth || 250;
    canvas.height = 220;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!breakdown || breakdown.length === 0) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No provider data', canvas.width / 2, canvas.height / 2);
        return;
    }

    const providerColors = {
        'eDahab': '#f59e0b',
        'ZAAD': '#10b981',
        'EVC Plus': '#6366f1',
        'Sahal': '#ec4899',
        'Other': '#94a3b8'
    };

    let startAngle = -0.5 * Math.PI;
    const total = breakdown.reduce((sum, b) => sum + b.amount, 0) || 1;
    const centerX = canvas.width / 2;
    const centerY = 90;
    const radius = 60;

    breakdown.forEach(item => {
        const sliceAngle = (item.amount / total) * 2 * Math.PI;
        ctx.fillStyle = providerColors[item.provider] || '#8b5cf6';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        startAngle += sliceAngle;
    });

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 35, 0, 2 * Math.PI);
    ctx.fill();

    // Legend
    let legendY = 175;
    breakdown.slice(0, 3).forEach(item => {
        ctx.fillStyle = providerColors[item.provider] || '#8b5cf6';
        ctx.fillRect(20, legendY - 8, 10, 10);
        ctx.fillStyle = '#334155';
        ctx.font = '11px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${item.provider}: $${item.amount.toLocaleString()}`, 36, legendY);
        legendY += 15;
    });
}

// ─── 7. Invoices Manager & Print Receipt ─────────────────────────────────────
async function loadInvoices() {
    try {
        const res = await secureFetch('/api/invoices');
        if (res.ok) {
            allInvoices = await res.json();
            renderInvoicesList();
        }
    } catch (e) {
        console.error('Error loading invoices', e);
    }
}

function renderInvoicesList() {
    const listEl = document.getElementById('invoices-list');
    const emptyEl = document.getElementById('invoices-empty');
    const searchInput = document.getElementById('invoice-search');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (!listEl) return;
    listEl.innerHTML = '';

    const filtered = allInvoices.filter(inv => {
        if (!q) return true;
        return (
            (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
            (inv.customer_phone && inv.customer_phone.toLowerCase().includes(q)) ||
            (inv.description && inv.description.toLowerCase().includes(q))
        );
    });

    if (filtered.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    filtered.forEach(inv => {
        const isPaid = inv.status === 'paid';
        const card = document.createElement('div');
        card.className = 'invoice-card';
        card.innerHTML = `
            <div>
                <div class="inv-header">
                    <span class="inv-number">${inv.invoice_number}</span>
                    <span class="inv-status ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'PAID' : 'PENDING'}</span>
                </div>
                <div class="inv-amount">${inv.currency === 'USD' ? '$' : ''}${Number(inv.amount).toLocaleString(undefined, {minimumFractionDigits:2})} ${inv.currency !== 'USD' ? inv.currency : ''}</div>
                <div class="inv-customer">Customer: <b>${inv.customer_phone}</b></div>
                <div class="inv-desc">${inv.description || 'No description provided'}</div>
                <div style="font-size:11px;color:#94a3b8;">Created: ${new Date(inv.created_at).toLocaleDateString()} ${isPaid && inv.paid_at ? `• Paid: ${new Date(inv.paid_at).toLocaleDateString()}` : ''}</div>
            </div>
            <div class="inv-actions">
                <button class="btn btn-secondary btn-sm print-inv-btn" style="padding:4px 10px;font-size:12px;">Print</button>
                ${!isPaid ? `<button class="btn btn-primary btn-sm mark-paid-btn" style="padding:4px 10px;font-size:12px;">Mark Paid</button>` : ''}
                <button class="icon-btn delete-inv-btn" style="color:#ef4444;padding:4px;" title="Delete Invoice">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        `;

        // Print Invoice Action
        card.querySelector('.print-inv-btn').addEventListener('click', () => {
            printSingleInvoice(inv);
        });

        // Mark Paid Action
        const markBtn = card.querySelector('.mark-paid-btn');
        if (markBtn) {
            markBtn.addEventListener('click', async () => {
                inv.status = 'paid';
                inv.paid_at = new Date().toISOString();
                renderInvoicesList();
                if (typeof window.showToast === 'function') {
                    window.showToast(`Invoice ${inv.invoice_number} marked as Paid`, 'success');
                }
                try {
                    const res = await secureFetch(`/api/invoices/${inv.id}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'paid' })
                    });
                    if (!res.ok) {
                        loadInvoices();
                    }
                } catch(e) {
                    console.error('Invoice mark paid error', e);
                    loadInvoices();
                }
            });
        }

        // Delete Invoice Action
        card.querySelector('.delete-inv-btn').addEventListener('click', async () => {
            if (confirm(`Delete invoice ${inv.invoice_number}?`)) {
                await secureFetch(`/api/invoices/${inv.id}`, { method: 'DELETE' });
                loadInvoices();
            }
        });

        listEl.appendChild(card);
    });
}

function printSingleInvoice(inv) {
    const modal = document.getElementById('invoice-print-modal');
    const content = document.getElementById('printable-invoice-content');
    if (!modal || !content) return;

    const comp = window.currentCompany || { company_name: 'Cash-In Business', city: 'Somalia', company_code: 'BIZ' };
    const dateStr = new Date(inv.created_at).toLocaleString();
    const isPaid = inv.status === 'paid';

    content.innerHTML = `
        <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px;">
            <div>
                <h2 style="margin:0;font-size:20px;font-weight:900;color:#0f172a;">${comp.company_name}</h2>
                <div style="font-size:12px;color:#64748b;">${comp.city || 'Somalia'} • Code: ${comp.company_code}</div>
            </div>
            <div style="text-align:right;">
                <h3 style="margin:0;font-size:18px;font-weight:900;color:#6366f1;">INVOICE</h3>
                <div style="font-size:12px;font-weight:700;color:#0f172a;">${inv.invoice_number}</div>
                <div style="font-size:11px;color:#64748b;">Date: ${dateStr}</div>
            </div>
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:20px;background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">
            <div>
                <span style="font-size:11px;font-weight:800;color:#64748b;display:block;">BILLED TO CUSTOMER:</span>
                <span style="font-size:14px;font-weight:700;color:#0f172a;">📱 ${inv.customer_phone}</span>
            </div>
            <div style="text-align:right;">
                <span style="font-size:11px;font-weight:800;color:#64748b;display:block;">PAYMENT STATUS:</span>
                <span style="font-size:13px;font-weight:800;color:${isPaid ? '#059669' : '#d97706'};">${isPaid ? 'PAID IN FULL ✅' : 'PENDING PAYMENT ⏳'}</span>
            </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <thead>
                <tr style="background:#f1f5f9;border-bottom:1.5px solid #cbd5e1;">
                    <th style="padding:8px 10px;text-align:left;font-size:12px;">DESCRIPTION</th>
                    <th style="padding:8px 10px;text-align:right;font-size:12px;">AMOUNT</th>
                </tr>
            </thead>
            <tbody>
                <tr style="border-bottom:1px solid #e2e8f0;">
                    <td style="padding:12px 10px;font-size:13px;font-weight:600;">${inv.description || 'Business Services / Product Sales'}</td>
                    <td style="padding:12px 10px;text-align:right;font-size:14px;font-weight:800;">${inv.currency === 'USD' ? '$' : ''}${Number(inv.amount).toLocaleString(undefined, {minimumFractionDigits:2})} ${inv.currency !== 'USD' ? inv.currency : ''}</td>
                </tr>
            </tbody>
            <tfoot>
                <tr style="border-top:2px solid #0f172a;background:#f8fafc;">
                    <td style="padding:10px;font-weight:800;font-size:14px;">TOTAL DUE</td>
                    <td style="padding:10px;text-align:right;font-weight:900;font-size:16px;color:#0f172a;">${inv.currency === 'USD' ? '$' : ''}${Number(inv.amount).toLocaleString(undefined, {minimumFractionDigits:2})} ${inv.currency !== 'USD' ? inv.currency : ''}</td>
                </tr>
            </tfoot>
        </table>

        <div style="margin-top:30px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px dashed #cbd5e1;padding-top:16px;">
            <div>
                <div style="width:140px;height:1px;background:#000;margin-bottom:6px;"></div>
                <span style="font-size:10px;font-weight:700;color:#64748b;">Authorized Signature</span>
            </div>
            <div style="font-size:11px;color:#64748b;text-align:right;">
                Thank you for your business!<br>
                <span>Automated via Cash-In Smart Ledger</span>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');

    const execPrint = document.getElementById('execute-print-invoice-btn');
    if (execPrint) {
        execPrint.onclick = () => {
            document.body.classList.add('printing-invoice-mode');
            window.print();
            setTimeout(() => {
                document.body.classList.remove('printing-invoice-mode');
            }, 500);
        };
    }
}

function initInvoiceEvents() {
    const openBtn = document.getElementById('create-invoice-btn');
    const modal = document.getElementById('invoice-modal');
    const closeBtn = document.getElementById('invoice-close');
    const overlay = document.getElementById('invoice-overlay');
    const saveBtn = document.getElementById('save-invoice-btn');
    const searchInput = document.getElementById('invoice-search');

    const printModal = document.getElementById('invoice-print-modal');
    const printClose = document.getElementById('invoice-print-close');
    const printOverlay = document.getElementById('invoice-print-overlay');

    if (openBtn && modal) openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    if (overlay && modal) overlay.addEventListener('click', () => modal.classList.add('hidden'));

    if (printClose && printModal) printClose.addEventListener('click', () => printModal.classList.add('hidden'));
    if (printOverlay && printModal) printOverlay.addEventListener('click', () => printModal.classList.add('hidden'));

    if (searchInput) {
        searchInput.addEventListener('input', () => renderInvoicesList());
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const phone = document.getElementById('invoice-phone').value.trim();
            const amount = parseFloat(document.getElementById('invoice-amount').value) || 0;
            const currency = document.getElementById('invoice-currency').value;
            const description = document.getElementById('invoice-description').value.trim();

            if (!phone || amount <= 0) {
                alert('Please enter a valid customer phone and amount');
                return;
            }

            const invNum = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

            try {
                const res = await secureFetch('/api/invoices', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        invoice_number: invNum,
                        customer_phone: phone,
                        amount: amount,
                        currency: currency,
                        description: description
                    })
                });

                if (res.ok) {
                    modal.classList.add('hidden');
                    document.getElementById('invoice-phone').value = '';
                    document.getElementById('invoice-amount').value = '';
                    document.getElementById('invoice-description').value = '';
                    loadInvoices();
                    if (typeof window.showToast === 'function') {
                        window.showToast(`Invoice ${invNum} created successfully! 🧾`, 'success');
                    }
                } else {
                    const err = await res.json();
                    alert(err.detail || 'Could not create invoice');
                }
            } catch (e) {
                console.error('Invoice error', e);
                alert('Error creating invoice');
            }
        });
    }
}

// ─── 8. Catalog & Menu Manager ────────────────────────────────────────────────
async function loadCatalogItems() {
    try {
        const res = await secureFetch('/api/business/items');
        if (res.ok) {
            allCatalogItems = await res.json();
            renderCatalogGrid();
        }
    } catch (e) {
        console.error('Error loading catalog items', e);
    }
}

function renderCatalogGrid() {
    const grid = document.getElementById('catalog-items-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!allCatalogItems || allCatalogItems.length === 0) {
        grid.innerHTML = '<p class="text-muted">No items in catalog yet. Click "+ Add New Item" above to add one.</p>';
        return;
    }

    allCatalogItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'catalog-item-card';
        card.innerHTML = `
            <div class="cic-info">
                <h4>${item.name}</h4>
                <span class="cic-category">${item.category}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
                <span class="cic-price">$${Number(item.price).toFixed(2)}</span>
                <button class="icon-btn delete-item-btn" data-id="${item.id}" style="color:#ef4444;" title="Delete Item">🗑️</button>
            </div>
        `;
        card.querySelector('.delete-item-btn').addEventListener('click', async () => {
            if (confirm(`Delete "${item.name}" from catalog?`)) {
                await secureFetch(`/api/business/items/${item.id}`, { method: 'DELETE' });
                loadCatalogItems();
            }
        });
        grid.appendChild(card);
    });
}

function initCatalogEvents() {
    const addBtn = document.getElementById('add-catalog-item-btn');
    const modal = document.getElementById('catalog-modal');
    const closeBtn = document.getElementById('catalog-close');
    const overlay = document.getElementById('catalog-overlay');
    const form = document.getElementById('catalog-item-form');

    if (addBtn && modal) {
        addBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    }
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }
    if (overlay && modal) {
        overlay.addEventListener('click', () => modal.classList.add('hidden'));
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const category = document.getElementById('cat-category').value.trim();
            const name = document.getElementById('cat-name').value.trim();
            const price = parseFloat(document.getElementById('cat-price').value) || 0;
            const currency = document.getElementById('cat-currency').value;

            const res = await secureFetch('/api/business/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, name, price, currency })
            });

            if (res.ok) {
                modal.classList.add('hidden');
                form.reset();
                loadCatalogItems();
            }
        });
    }

    // Reset catalog items for money exchange
    const resetCatalogBtn = document.getElementById('reset-catalog-btn');
    if (resetCatalogBtn) {
        resetCatalogBtn.addEventListener('click', async () => {
            if (confirm('Reset catalog items to default Foreign Exchange services and rates?')) {
                resetCatalogBtn.disabled = true;
                try {
                    for (const item of allCatalogItems) {
                        await secureFetch(`/api/business/items/${item.id}`, { method: 'DELETE' });
                    }
                    const fxDefaults = [
                        { category: 'FX Services', name: 'USD Cash Exchange', price: 0, currency: 'USD' },
                        { category: 'FX Services', name: 'SLSH Cash Out', price: 0, currency: 'SLSH' },
                        { category: 'FX Services', name: 'Exchange Commission Fee', price: 1.0, currency: 'USD' },
                        { category: 'Remittance', name: 'Hawala / Money Transfer', price: 2.0, currency: 'USD' },
                        { category: 'Remittance', name: 'Merchant Settlement', price: 0, currency: 'USD' }
                    ];
                    for (const def of fxDefaults) {
                        await secureFetch('/api/business/items', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(def)
                        });
                    }
                    await loadCatalogItems();
                    if (typeof window.showToast === 'function') {
                        window.showToast('FX default services successfully restored', 'success');
                    }
                } catch(e) {
                    console.error('Reset catalog error', e);
                } finally {
                    resetCatalogBtn.disabled = false;
                }
            }
        });
    }

    // Save live FX rates from Tab 5
    const saveFxBtn = document.getElementById('save-fx-rates-btn');
    if (saveFxBtn) {
        saveFxBtn.addEventListener('click', async () => {
            const rateSLSH = parseFloat(document.getElementById('fx-rate-slsh').value) || 11000;
            const rateETB = parseFloat(document.getElementById('fx-rate-etb').value) || 120;

            const ratesJson = JSON.stringify({ USD_TO_SLSH: rateSLSH, USD_TO_ETB: rateETB });

            const res = await secureFetch('/api/company/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ exchange_rates_json: ratesJson })
            });

            if (res.ok) {
                const data = await res.json();
                window.currentCompany = data.company;
                if (typeof window.syncFxWidget === 'function') {
                    window.syncFxWidget();
                }
                if (typeof window.showToast === 'function') {
                    window.showToast('Live exchange rates updated successfully', 'success');
                }
            }
        });
    }

    // Save business settings
    const saveSettingsBtn = document.getElementById('save-business-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const bType = document.getElementById('settings-business-type').value;
            const baseCur = document.getElementById('settings-base-currency').value;
            const rateSLSH = parseFloat(document.getElementById('settings-rate-slsh').value) || 11000;

            const ratesJson = JSON.stringify({ USD_TO_SLSH: rateSLSH, USD_TO_ETB: 120 });

            const res = await secureFetch('/api/company/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    business_type: bType,
                    base_currency: baseCur,
                    exchange_rates_json: ratesJson
                })
            });

            if (res.ok) {
                const data = await res.json();
                window.currentCompany = data.company;
                updateBusinessUI(data.company);
                if (typeof window.showToast === 'function') {
                    window.showToast('Business settings saved successfully', 'success');
                }
            }
        });
    }
}

// ─── 9. Manual Transaction Recording ─────────────────────────────────────────
function initManualTxnModal() {
    const openBtn = document.getElementById('open-new-txn-btn');
    const modal = document.getElementById('new-txn-modal');
    const closeBtn = document.getElementById('new-txn-close');
    const overlay = document.getElementById('new-txn-overlay');
    const form = document.getElementById('manual-txn-form');

    if (openBtn && modal) openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    if (overlay && modal) overlay.addEventListener('click', () => modal.classList.add('hidden'));

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const type = document.getElementById('man-type').value;
            const amount = parseFloat(document.getElementById('man-amount').value) || 0;
            const currency = document.getElementById('man-currency').value;
            const provider = document.getElementById('man-provider').value;
            const party = document.getElementById('man-party').value.trim() || (type === 'Received' ? 'Customer' : 'Recipient');

            const payload = {
                amount: amount,
                currency: currency,
                sender: type === 'Received' ? party : 'You',
                receiver: type === 'Received' ? 'You' : party,
                provider: provider,
                timestamp: new Date().toISOString(),
                type: type,
                raw_sms: `Manual entry: ${amount} ${currency} ${type} via ${provider}`
            };

            const res = await secureFetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                modal.classList.add('hidden');
                form.reset();
                if (typeof window.loadTransactions === 'function') window.loadTransactions();
                payload.id = data.id;
                openClassifyModal(payload);
            }
        });
    }
}

// ─── 10. Seed Demo Data Button ───────────────────────────────────────────────
function initSeedDemoDataButton() {
    const seedBtn = document.getElementById('seed-demo-btn');
    if (seedBtn) {
        seedBtn.addEventListener('click', async () => {
            seedBtn.disabled = true;
            seedBtn.textContent = 'Seeding Data...';
            try {
                const res = await secureFetch('/api/dev/seed-mock', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (typeof window.showToast === 'function') {
                        window.showToast(`${data.inserted} Demo transactions created across all providers!`, 'success');
                    }
                    if (typeof window.loadTransactions === 'function') {
                        await window.loadTransactions();
                    }
                    loadAnalyticsReport(currentReportRange);
                    renderCurrencyBalances();
                    renderDashboardProviderCards();
                } else {
                    alert('Failed to seed demo transactions');
                }
            } catch (err) {
                console.error('Seed error', err);
            } finally {
                seedBtn.disabled = false;
                seedBtn.textContent = 'Seed Demo Data';
            }
        });
    }
}

