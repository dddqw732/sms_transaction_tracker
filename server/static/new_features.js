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

// Statement Pagination
let currentStatementTxns = [];
let stmtCurrentPage = 1;
let stmtPerPage = 15;
let stmtShowAll = false;

// Employee Tracking
let currentEmployees = [];
let activeCashierEmployee = null; // name of currently selected cashier

// Import Hub - Spreadsheet
let parsedSheetRows = [];

// Offline
let offlineQueue = [];

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
    initImportHubEvents();
    initReceiptModalEvents();
    initEmployeeEvents();
    initOfflineSyncManager();
    initStatementPaginationEvents();
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

    // Somali Menu Button & Tab: Strictly for Restaurant companies
    const seedSomaliBtn = document.getElementById('seed-somali-menu-btn');
    const importSomaliTabBtn = document.getElementById('import-somali-tab-btn');
    if (seedSomaliBtn) {
        seedSomaliBtn.style.display = bType === 'restaurant' ? 'inline-block' : 'none';
    }
    if (importSomaliTabBtn) {
        importSomaliTabBtn.style.display = bType === 'restaurant' ? 'flex' : 'none';
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
    if (typeof loadEmployees === 'function') loadEmployees();
    if (typeof loadEmployeeAttendance === 'function') loadEmployeeAttendance();
    if (typeof loadEmployeeSalesReport === 'function') loadEmployeeSalesReport();
}

window.updateBusinessUI = updateBusinessUI;

// ─── 3. Multi-Currency Balances Bar & Dashboard Provider Cards ────────────────
function renderCurrencyBalances(currencies) {
    const bar = document.getElementById('currency-balances-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const txns = window.allTransactions || [];
    const curMap = {
        'USD': { received: 0, sent: 0, net: 0, count: 0 },
        'SLSH': { received: 0, sent: 0, net: 0, count: 0 }
    };

    txns.forEach(t => {
        let cur = (t.currency || 'USD').toUpperCase();
        if (cur === 'SOS') return;
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

    // Core Providers: ZAAD, eDahab, Soltelco
    const providers = {
        'ZAAD': {
            name: 'ZAAD',
            color: '#10b981',
            usd: { received: 0, sent: 0 },
            slsh: { received: 0, sent: 0 }
        },
        'eDahab': {
            name: 'eDahab',
            color: '#f59e0b',
            usd: { received: 0, sent: 0 },
            slsh: { received: 0, sent: 0 }
        },
        'Soltelco': {
            name: 'Soltelco',
            color: '#0284c7',
            usd: { received: 0, sent: 0 },
            slsh: { received: 0, sent: 0 }
        }
    };

    let grandUsdRec = 0, grandUsdSent = 0;
    let grandSlshRec = 0, grandSlshSent = 0;

    txns.forEach(t => {
        let prov = (t.provider || '').toLowerCase();
        let target = 'ZAAD';
        if (prov.includes('edahab') || prov.includes('dahab')) target = 'eDahab';
        else if (prov.includes('soltelco') || prov.includes('somtel')) target = 'Soltelco';
        else if (prov.includes('zaad') || prov.includes('telesom')) target = 'ZAAD';
        else target = 'ZAAD'; // default to primary

        const amt = Number(t.amount || 0);
        const cur = (t.currency || 'USD').toUpperCase();
        const isRec = t.type === 'Received';

        if (cur === 'SLSH') {
            if (isRec) {
                providers[target].slsh.received += amt;
                grandSlshRec += amt;
            } else {
                providers[target].slsh.sent += amt;
                grandSlshSent += amt;
            }
        } else {
            if (isRec) {
                providers[target].usd.received += amt;
                grandUsdRec += amt;
            } else {
                providers[target].usd.sent += amt;
                grandUsdSent += amt;
            }
        }
    });

    // Render individual provider cards with BOTH Dollar ($) and SLSH Balances!
    for (const [pName, pData] of Object.entries(providers)) {
        const usdNet = pData.usd.received - pData.usd.sent;
        const slshNet = pData.slsh.received - pData.slsh.sent;

        const card = document.createElement('div');
        card.className = 'provider-balance-card';
        card.innerHTML = `
            <div class="pbc-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span class="pbc-title" style="font-size:14px;font-weight:800;display:flex;align-items:center;gap:6px;">
                    <span class="pbc-dot" style="background:${pData.color};"></span>
                    ${pName}
                </span>
                <span style="font-size:10px;font-weight:800;color:#6366f1;background:rgba(99,102,241,0.08);padding:2px 6px;border-radius:4px;">DUAL WALLET</span>
            </div>
            
            <!-- USD Account -->
            <div class="provider-dual-balance-row">
                <span class="cur-label">💵 USD ($)</span>
                <span class="cur-val ${usdNet >= 0 ? 'text-success' : 'text-danger'}">
                    ${usdNet >= 0 ? '+' : ''}$${usdNet.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
                </span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;padding:0 8px 4px 8px;">
                <span class="text-success">+${pData.usd.received.toLocaleString(undefined, {maximumFractionDigits:1})} in</span>
                <span class="text-danger">-${pData.usd.sent.toLocaleString(undefined, {maximumFractionDigits:1})} out</span>
            </div>

            <!-- SLSH Account -->
            <div class="provider-dual-balance-row" style="margin-top:4px;">
                <span class="cur-label">🪙 SLSH</span>
                <span class="cur-val ${slshNet >= 0 ? 'text-success' : 'text-danger'}">
                    ${slshNet >= 0 ? '+' : ''}${Math.round(slshNet).toLocaleString()} SLSH
                </span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;padding:0 8px;">
                <span class="text-success">+${pData.slsh.received.toLocaleString(undefined, {maximumFractionDigits:0})} in</span>
                <span class="text-danger">-${pData.slsh.sent.toLocaleString(undefined, {maximumFractionDigits:0})} out</span>
            </div>
        `;
        container.appendChild(card);
    }

    // Render Consolidated Total Card with both currencies
    const totalUsdNet = grandUsdRec - grandUsdSent;
    const totalSlshNet = grandSlshRec - grandSlshSent;

    const totalCard = document.createElement('div');
    totalCard.className = 'provider-balance-card total-card';
    totalCard.innerHTML = `
        <div class="pbc-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span class="pbc-title" style="color:#0f172a;font-weight:800;font-size:14px;">
                Total Consolidated
            </span>
            <span style="font-size:10px;font-weight:800;color:#059669;background:rgba(16,185,129,0.1);padding:2px 6px;border-radius:4px;">ALL PROVIDERS</span>
        </div>
        <div class="provider-dual-balance-row">
            <span class="cur-label">💵 Total USD Net</span>
            <span class="cur-val ${totalUsdNet >= 0 ? 'text-success' : 'text-danger'}">
                ${totalUsdNet >= 0 ? '+' : ''}$${totalUsdNet.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}
            </span>
        </div>
        <div class="provider-dual-balance-row" style="margin-top:4px;">
            <span class="cur-label">🪙 Total SLSH Net</span>
            <span class="cur-val ${totalSlshNet >= 0 ? 'text-success' : 'text-danger'}">
                ${totalSlshNet >= 0 ? '+' : ''}${Math.round(totalSlshNet).toLocaleString()} SLSH
            </span>
        </div>
        <div style="margin-top:8px;font-size:11px;font-weight:700;color:#64748b;text-align:right;">
            ZAAD • eDahab • Soltelco
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
    // Catalog FX Widget (inside Exchange Rate Manager)
    const catalogUsdInput = document.getElementById('catalog-fx-calc-usd');
    const catalogSlshInput = document.getElementById('catalog-fx-calc-slsh');
    const catalogRateBadge = document.getElementById('catalog-fx-rate-badge');

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

    function syncCatalogWidget() {
        const rate = getRate();
        if (catalogRateBadge) catalogRateBadge.textContent = `1 USD = ${rate.toLocaleString()} SLSH`;
        if (!catalogUsdInput || !catalogSlshInput) return;
        const usdVal = parseFloat(catalogUsdInput.value) || 0;
        const slshVal = usdVal * rate;
        catalogSlshInput.value = `${slshVal.toLocaleString(undefined, { maximumFractionDigits: 0 })} SLSH`;
    }

    if (catalogUsdInput) catalogUsdInput.addEventListener('input', syncCatalogWidget);
    window.syncFxWidget = syncCatalogWidget;
    syncCatalogWidget();
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

function getItemPriceInTxnCurrency(item, targetCur) {
    const itemCur = item.currency || 'USD';
    if (itemCur === targetCur) return Number(item.price) || 0;
    return calculateConverted(Number(item.price) || 0, itemCur, targetCur);
}

function formatCurrencyAmount(amount, currency) {
    const cur = (currency || 'USD').toUpperCase();
    const num = Number(amount) || 0;
    if (cur === 'SLSH') {
        return `${Math.round(num).toLocaleString()} SLSH`;
    } else if (cur === 'USD') {
        return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
        return `${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
    }
}

// ─── 4A. Restaurant Workflow (Menu Cards & 1-Tap Presets) ─────────────────────
function renderRestaurantWorkflow(container, txn) {
    selectedMenuItems = {};
    const wrap = document.createElement('div');

    const txnCurrency = (txn.currency || 'USD').toUpperCase();
    const txnAmtFormatted = formatCurrencyAmount(txn.amount, txnCurrency);

    wrap.innerHTML = `
        <div class="menu-items-section-title">
            <span>Filter Category / Quick 1-Tap:</span>
        </div>
        <div class="quick-preset-row" id="classify-preset-row">
            <button class="preset-btn active" data-cat="All">All Items</button>
            <button class="preset-btn" data-cat="Mains">Mains / Bariis</button>
            <button class="preset-btn" data-cat="Breakfast">Breakfast</button>
            <button class="preset-btn" data-cat="Starters">Starters / Sambuus</button>
            <button class="preset-btn" data-cat="Drinks">Drinks / Shaah</button>
            <button class="preset-btn" data-cat="Desserts">Desserts / Xalwo</button>
        </div>

        <div class="menu-items-section-title" style="margin-top:14px;">
            <span>Select Menu Items (Optional):</span>
            <span id="order-sum-indicator" style="font-weight:700;color:#10b981;">Selected: ${formatCurrencyAmount(0, txnCurrency)} / ${txnAmtFormatted}</span>
        </div>
        <div class="menu-items-grid" id="modal-menu-grid">
            <!-- Rendered from catalog items -->
        </div>
        <div id="order-overalloc-warning" style="display:none;color:#dc2626;font-size:12px;font-weight:700;margin-top:8px;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:6px;">
            ⚠️ Selected items exceed the received amount. Please deselect or right-click to reduce quantity.
        </div>

        <div style="margin-top:16px;display:flex;gap:10px;">
            <button id="btn-submit-classification" class="btn btn-primary btn-full">Confirm &amp; Save Classification</button>
        </div>
    `;

    container.appendChild(wrap);

    const grid = wrap.querySelector('#modal-menu-grid');

    // Filter menu cards when clicking preset buttons
    const presetRow = wrap.querySelector('#classify-preset-row');
    const presetBtns = presetRow.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const targetCat = btn.dataset.cat;
            
            // Filter cards in grid
            const cards = grid.querySelectorAll('.menu-item-card');
            cards.forEach(card => {
                const itemCat = card.dataset.category || '';
                if (targetCat === 'All' || itemCat.toLowerCase() === targetCat.toLowerCase()) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // Helper to get selected category from DOM
    function getSelectedCategory() {
        const activeBtn = presetRow.querySelector('.preset-btn.active');
        const cat = activeBtn ? activeBtn.dataset.cat : 'Orders';
        return cat === 'All' ? 'Orders' : cat;
    }

    // Populate Menu Items
    if (allCatalogItems && allCatalogItems.length > 0) {
        allCatalogItems.forEach(item => {
            const itemCurrency = (item.currency || 'USD').toUpperCase();
            const itemPriceInTxnCur = getItemPriceInTxnCurrency(item, txnCurrency);
            
            // Format price: if item currency differs from txn currency, show converted note
            let priceLabel = formatCurrencyAmount(item.price, itemCurrency);
            if (itemCurrency !== txnCurrency) {
                priceLabel += ` (≈ ${formatCurrencyAmount(itemPriceInTxnCur, txnCurrency)})`;
            }

            const card = document.createElement('div');
            card.className = 'menu-item-card';
            card.dataset.category = item.category || 'Mains';
            card.innerHTML = `
                <span class="mic-name">${item.name}</span>
                <div class="mic-bottom">
                    <span class="mic-price" style="font-size:11px;">${priceLabel}</span>
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
                updateOrderSum(txn);
            });
            // Right-click or long-press to remove
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (selectedMenuItems[item.id] > 0) {
                    selectedMenuItems[item.id]--;
                    if (selectedMenuItems[item.id] === 0) {
                        delete selectedMenuItems[item.id];
                        card.classList.remove('selected');
                        const qtyBadge = card.querySelector(`#qty-${item.id}`);
                        qtyBadge.classList.add('hidden');
                    } else {
                        const qtyBadge = card.querySelector(`#qty-${item.id}`);
                        qtyBadge.textContent = `${selectedMenuItems[item.id]}x`;
                    }
                    updateOrderSum(txn);
                }
            });
            grid.appendChild(card);
        });
    } else {
        grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1;font-size:12px;padding:12px;background:#f8fafc;border-radius:8px;">No menu items configured yet. Go to <b>Menu &amp; Products</b> tab to add items or load the Somali Menu.</p>';
    }

    // Submit Action
    wrap.querySelector('#btn-submit-classification').addEventListener('click', () => {
        // Validate: check for over-allocation
        let sumInTxnCur = 0;
        for (const [itemId, qty] of Object.entries(selectedMenuItems)) {
            const item = allCatalogItems.find(i => i.id == itemId);
            if (item) sumInTxnCur += getItemPriceInTxnCurrency(item, txnCurrency) * qty;
        }
        if (sumInTxnCur > Number(txn.amount) + 0.05 && Object.keys(selectedMenuItems).length > 0) {
            alert('Cannot classify more than the received amount.');
            return;
        }

        const selectedCategory = getSelectedCategory();
        const allocations = [];
        for (const [itemId, qty] of Object.entries(selectedMenuItems)) {
            const item = allCatalogItems.find(i => i.id == itemId);
            if (item) {
                const convertedPrice = getItemPriceInTxnCurrency(item, txnCurrency);
                allocations.push({
                    allocation_type: 'product_sale',
                    target_currency: item.currency || txnCurrency,
                    original_allocated_amount: item.price * qty,
                    converted_amount: convertedPrice * qty,
                    exchange_rate: item.price ? (convertedPrice / item.price) : 1.0,
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

function updateOrderSum(txn) {
    const txnCurrency = (txn.currency || 'USD').toUpperCase();
    let sumInTxnCur = 0;
    for (const [itemId, qty] of Object.entries(selectedMenuItems)) {
        const item = allCatalogItems.find(i => i.id == itemId);
        if (item) {
            sumInTxnCur += getItemPriceInTxnCurrency(item, txnCurrency) * qty;
        }
    }
    const el = document.getElementById('order-sum-indicator');
    const warning = document.getElementById('order-overalloc-warning');
    const submitBtn = document.getElementById('btn-submit-classification');
    const txnAmt = Number(txn.amount);
    const isOver = sumInTxnCur > txnAmt + 0.05;

    if (el) {
        el.textContent = `Selected: ${formatCurrencyAmount(sumInTxnCur, txnCurrency)} / ${formatCurrencyAmount(txnAmt, txnCurrency)}`;
        el.style.color = isOver ? '#dc2626' : '#10b981';
    }
    if (warning) {
        if (isOver) {
            const excess = sumInTxnCur - txnAmt;
            warning.innerHTML = `⚠️ Selected items exceed the transaction amount by <b>${formatCurrencyAmount(excess, txnCurrency)}</b>. Please deselect some items (right-click card).`;
            warning.style.display = 'block';
        } else {
            warning.style.display = 'none';
        }
    }
    if (submitBtn) {
        submitBtn.disabled = isOver;
        submitBtn.style.opacity = isOver ? '0.5' : '1';
        submitBtn.style.cursor = isOver ? 'not-allowed' : 'pointer';
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

    // Update Remaining Badge — and disable submit when over-allocated
    const allocatedSum = activeAllocations.reduce((sum, a) => sum + (Number(a.original_allocated_amount) || 0), 0);
    const rem = origAmount - allocatedSum;
    const badge = wrap.querySelector('#fx-remaining-badge');
    const submitBtn = wrap.querySelector('#btn-submit-fx');
    if (badge) {
        if (Math.abs(rem) < 0.01) {
            badge.className = 'remaining-alloc-indicator complete';
            badge.textContent = `Fully Allocated (${origAmount.toLocaleString()} ${origCurrency})`;
            if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
        } else if (rem > 0) {
            badge.className = 'remaining-alloc-indicator remaining';
            badge.textContent = `Remaining to allocate: ${rem.toLocaleString()} ${origCurrency}`;
            if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
        } else {
            badge.className = 'remaining-alloc-indicator';
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
            badge.style.color = '#dc2626';
            badge.textContent = `⚠️ Over-allocated by ${Math.abs(rem).toLocaleString()} ${origCurrency} — reduce a split`;
            // Disable submit when over-allocated
            if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
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
    // 1. Determine active employee / cashier
    const employeeName = activeCashierEmployee || (currentEmployees && currentEmployees.length > 0 ? currentEmployees[0].name : 'Cashier');

    // 2. Optimistic UI update: immediately close modal
    closeClassifyModal();

    // 3. Immediate feedback toast
    if (typeof window.showToast === 'function') {
        window.showToast(`Transaction classified as ${category} (${employeeName})`, 'success');
    }

    // 4. Update local in-memory transaction and re-render DOM instantly
    let localTxn = null;
    if (window.allTransactions) {
        localTxn = window.allTransactions.find(t => t.id == txnId);
        if (localTxn) {
            localTxn.category = category;
            localTxn.is_classified = 1;
            localTxn.classification_data = JSON.stringify({
                category: category,
                allocations_count: allocations.length,
                items: allocations,
                classified_by: employeeName,
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

    // 5. Automatic Receipt Prompt: Automatically display official receipt whenever transaction is completed
    if (localTxn && typeof openReceiptModal === 'function') {
        setTimeout(() => {
            openReceiptModal(localTxn);
        }, 300);
    }

    // 6. If Offline: queue action locally for sync when internet returns
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (typeof queueOfflineAction === 'function') {
            queueOfflineAction({
                type: 'classify',
                txnId: txnId,
                payload: {
                    category: category,
                    allocations: allocations,
                    notes: `Classified (${category})`,
                    employee_name: employeeName
                }
            });
        }
        if (typeof window.showToast === 'function') {
            window.showToast('Saved offline. Will auto-sync when connected 🌐', 'info');
        }
        return;
    }

    // 7. Send network request asynchronously in background
    try {
        const res = await secureFetch(`/api/transactions/${txnId}/classify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category: category,
                allocations: allocations,
                notes: `Classified (${category})`,
                employee_name: employeeName
            })
        });

        if (!res.ok) {
            console.error('Failed to save classification on server');
            if (typeof window.loadTransactions === 'function') {
                window.loadTransactions();
            }
        } else {
            loadAnalyticsReport(currentReportRange);
            if (typeof loadEmployeeSalesReport === 'function') {
                loadEmployeeSalesReport();
            }
        }
    } catch (e) {
        console.error('Classification error (queuing offline)', e);
        if (typeof queueOfflineAction === 'function') {
            queueOfflineAction({
                type: 'classify',
                txnId: txnId,
                payload: {
                    category: category,
                    allocations: allocations,
                    notes: `Classified (${category})`,
                    employee_name: employeeName
                }
            });
        }
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
                if (typeof window.showToast === 'function') {
                    window.showToast('Generating Excel spreadsheet...', 'success');
                }

                // If SheetJS is loaded and we have current statement transactions, export directly with full fidelity
                if (typeof XLSX !== 'undefined' && Array.isArray(currentStatementTxns) && currentStatementTxns.length > 0) {
                    const rows = currentStatementTxns.map(t => {
                        let cashierName = 'Owner / General';
                        if (t.employee_name) {
                            cashierName = t.employee_name;
                        } else if (t.metadata && t.metadata.employee_name) {
                            cashierName = t.metadata.employee_name;
                        } else if (t.notes && t.notes.includes('Staff:')) {
                            cashierName = t.notes.split('Staff:')[1].split('|')[0].trim();
                        }

                        let itemsSold = '';
                        if (Array.isArray(t.allocations) && t.allocations.length > 0) {
                            itemsSold = t.allocations.map(a => `${a.item_name || a.category || 'Item'} (x${a.quantity || 1} - $${(a.allocated_amount || 0).toFixed(2)})`).join('; ');
                        } else if (t.notes && t.notes.includes('Items:')) {
                            itemsSold = t.notes.split('Items:')[1].split('|')[0].trim();
                        }

                        return {
                            "Date & Time": t.timestamp ? new Date(t.timestamp).toLocaleString() : '',
                            "Provider": t.provider || 'ZAAD',
                            "Type": t.type || 'Received',
                            "Amount": Number(t.amount || 0),
                            "Currency": t.currency || 'USD',
                            "Customer / Phone": t.sender || t.receiver || 'Direct',
                            "Category": t.category || 'Unclassified',
                            "Cashier / Staff": cashierName,
                            "Items Breakdown": itemsSold || 'N/A',
                            "Transaction ID": t.transaction_id || '',
                            "Notes": t.notes || ''
                        };
                    });

                    const ws = XLSX.utils.json_to_sheet(rows);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Statement");
                    const fileName = `Financial_Statement_${currentReportRange || 'all'}_${new Date().toISOString().slice(0,10)}.xlsx`;
                    XLSX.writeFile(wb, fileName);

                    if (typeof window.showToast === 'function') {
                        window.showToast('Excel report downloaded with items & staff! 📊', 'success');
                    }
                    return;
                }

                // Fallback to server endpoint
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
            'Soltelco': '#0284c7',
            'Other': '#94a3b8'
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

    // ─── Statement Transactions Breakdown & Pagination ────────────────────────
    currentStatementTxns = report.transactions_preview || [];
    renderStatementTransactions();

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
        'Soltelco': '#0284c7',
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
        const amtSym = inv.currency === 'USD' ? '$' : '';
        const amtSuffix = inv.currency !== 'USD' ? ` ${inv.currency}` : '';
        card.innerHTML = `
            <div>
                <div class="inv-header">
                    <span class="inv-number">${inv.invoice_number}</span>
                    <span class="inv-status ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'PAID ✅' : 'PENDING ⏳'}</span>
                </div>
                <div class="inv-amount">${amtSym}${Number(inv.amount).toLocaleString(undefined, {minimumFractionDigits:2})}${amtSuffix}</div>
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

        // Mark Paid Action — properly updates source allInvoices array
        const markBtn = card.querySelector('.mark-paid-btn');
        if (markBtn) {
            markBtn.addEventListener('click', async () => {
                // Update source array first (not just the filtered copy)
                const sourceInv = allInvoices.find(i => i.id === inv.id);
                if (sourceInv) {
                    sourceInv.status = 'paid';
                    sourceInv.paid_at = new Date().toISOString();
                }
                inv.status = 'paid';
                inv.paid_at = new Date().toISOString();
                renderInvoicesList();
                if (typeof window.showToast === 'function') {
                    window.showToast(`Invoice ${inv.invoice_number} marked as Paid ✅`, 'success');
                }
                try {
                    const res = await secureFetch(`/api/invoices/${inv.id}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'paid' })
                    });
                    if (!res.ok) {
                        // Only reload from server on actual failure
                        console.warn('Invoice status update failed, reloading...');
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
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:48px 24px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;">
                <p style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 6px 0;">No items in your catalog yet</p>
                <p class="text-muted" style="margin:0 0 16px 0;font-size:13px;">You can load a complete Somali restaurant menu with 1 click, or add custom items.</p>
                <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                    <button class="btn btn-secondary" onclick="document.getElementById('seed-somali-menu-btn')?.click()" style="background:rgba(99,102,241,0.08);color:#6366f1;border:1px solid rgba(99,102,241,0.25);">🍽️ Load Somali Restaurant Menu</button>
                    <button class="btn btn-primary" onclick="document.getElementById('add-catalog-item-btn')?.click()">+ Add Custom Item</button>
                </div>
            </div>
        `;
        return;
    }

    allCatalogItems.forEach(item => {
        const itemCurrency = (item.currency || 'USD').toUpperCase();
        const priceFormatted = formatCurrencyAmount(item.price, itemCurrency);
        const card = document.createElement('div');
        card.className = 'catalog-item-card';
        card.innerHTML = `
            <div class="cic-info">
                <h4 id="cic-name-${item.id}">${item.name}</h4>
                <span class="cic-category">${item.category}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="cic-price" id="cic-price-${item.id}">${priceFormatted}</span>
                <button class="icon-btn edit-item-btn" data-id="${item.id}" style="color:#6366f1;font-size:14px;" title="Edit Item">✏️</button>
                <button class="icon-btn delete-item-btn" data-id="${item.id}" style="color:#ef4444;" title="Delete Item">🗑️</button>
            </div>
        `;

        // Edit item inline
        card.querySelector('.edit-item-btn').addEventListener('click', () => {
            openEditCatalogItem(item);
        });

        card.querySelector('.delete-item-btn').addEventListener('click', async () => {
            if (confirm(`Delete "${item.name}" from catalog?`)) {
                await secureFetch(`/api/business/items/${item.id}`, { method: 'DELETE' });
                loadCatalogItems();
            }
        });
        grid.appendChild(card);
    });
}

// Opens an edit modal/inline form for catalog item
function openEditCatalogItem(item) {
    const modal = document.getElementById('catalog-modal');
    const form = document.getElementById('catalog-item-form');
    if (!modal || !form) return;

    // Pre-fill the form
    const catInput = document.getElementById('cat-category');
    const nameInput = document.getElementById('cat-name');
    const priceInput = document.getElementById('cat-price');
    const curInput = document.getElementById('cat-currency');
    if (catInput) catInput.value = item.category || '';
    if (nameInput) nameInput.value = item.name || '';
    if (priceInput) priceInput.value = item.price || 0;
    if (curInput) curInput.value = item.currency || 'USD';

    // Change submit button label
    const submitBtn = form.querySelector('button[type="submit"]');
    const origLabel = submitBtn ? submitBtn.textContent : 'Add Item';
    if (submitBtn) submitBtn.textContent = 'Update Item';

    // Store editing item id on form
    form.dataset.editingId = item.id;
    modal.classList.remove('hidden');

    // Restore form on close
    const restoreForm = () => {
        form.dataset.editingId = '';
        if (submitBtn) submitBtn.textContent = origLabel;
    };
    document.getElementById('catalog-close')?.addEventListener('click', restoreForm, { once: true });
    document.getElementById('catalog-overlay')?.addEventListener('click', restoreForm, { once: true });
}

function initCatalogEvents() {
    const addBtn = document.getElementById('add-catalog-item-btn');
    const modal = document.getElementById('catalog-modal');
    const closeBtn = document.getElementById('catalog-close');
    const overlay = document.getElementById('catalog-overlay');
    const form = document.getElementById('catalog-item-form');

    if (addBtn && modal) {
        addBtn.addEventListener('click', () => {
            // Clear editing state when opening fresh
            if (form) {
                form.dataset.editingId = '';
                form.reset();
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Add Item';
            }
            modal.classList.remove('hidden');
        });
    }
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            if (form) { form.dataset.editingId = ''; }
        });
    }
    if (overlay && modal) {
        overlay.addEventListener('click', () => {
            modal.classList.add('hidden');
            if (form) { form.dataset.editingId = ''; }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const category = document.getElementById('cat-category').value.trim();
            const name = document.getElementById('cat-name').value.trim();
            const price = parseFloat(document.getElementById('cat-price').value) || 0;
            const currency = document.getElementById('cat-currency').value;
            const editingId = form.dataset.editingId;

            let res;
            if (editingId) {
                // Update existing item
                res = await secureFetch(`/api/business/items/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, name, price, currency })
                });
            } else {
                // Create new item
                res = await secureFetch('/api/business/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, name, price, currency })
                });
            }

            if (res.ok) {
                modal.classList.add('hidden');
                form.reset();
                form.dataset.editingId = '';
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Add Item';
                await loadCatalogItems();
                if (typeof window.showToast === 'function') {
                    window.showToast(editingId ? `"${name}" updated successfully ✏️` : `"${name}" added to catalog ✅`, 'success');
                }
            } else {
                alert('Could not save item. Please try again.');
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

    // Seed Somali Restaurant Menu
    const seedSomaliBtn = document.getElementById('seed-somali-menu-btn');
    if (seedSomaliBtn) {
        seedSomaliBtn.addEventListener('click', async () => {
            seedSomaliBtn.disabled = true;
            seedSomaliBtn.textContent = 'Loading Somali Foods...';
            try {
                const count = await seedDefaultRestaurantMenu();
                await loadCatalogItems();
                if (typeof window.showToast === 'function') {
                    window.showToast(`${count} Somali food items added to menu! 🍽️`, 'success');
                }
            } catch(e) {
                console.error('Failed to seed Somali menu', e);
            } finally {
                seedSomaliBtn.disabled = false;
                seedSomaliBtn.textContent = '🍽️ Load Somali Menu';
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
                    window.showToast('Live exchange rates updated successfully ✅', 'success');
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

            // Merge with existing ETB rate to avoid overwriting it
            let existingETB = 120;
            try {
                if (window.currentCompany && window.currentCompany.exchange_rates_json) {
                    const parsed = JSON.parse(window.currentCompany.exchange_rates_json);
                    if (parsed.USD_TO_ETB) existingETB = parseFloat(parsed.USD_TO_ETB) || 120;
                }
            } catch(e) {}

            const ratesJson = JSON.stringify({ USD_TO_SLSH: rateSLSH, USD_TO_ETB: existingETB });

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
                    window.showToast('Business settings saved successfully ✅', 'success');
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
// ─── 11. Seed Default Restaurant Menu with Somali Foods ──────────────────────
async function seedDefaultRestaurantMenu() {
    const somaliMenuItems = [
        // ─ Mains ─
        { category: 'Mains', name: 'Bariis (Somali Rice)', price: 5000, currency: 'SLSH' },
        { category: 'Mains', name: 'Hilib Ari (Goat Meat)', price: 8000, currency: 'SLSH' },
        { category: 'Mains', name: 'Hilib Lo\'aad (Beef)', price: 7000, currency: 'SLSH' },
        { category: 'Mains', name: 'Suugo Spaghetti', price: 4500, currency: 'SLSH' },
        { category: 'Mains', name: 'Digaag (Chicken)', price: 9000, currency: 'SLSH' },
        { category: 'Mains', name: 'Muufo (Somali Flatbread)', price: 2000, currency: 'SLSH' },
        { category: 'Mains', name: 'Baasto & Hilib', price: 6000, currency: 'SLSH' },
        { category: 'Mains', name: 'Cambuulo (Cowpeas)', price: 3500, currency: 'SLSH' },
        { category: 'Mains', name: 'Iskukaris (Mixed Rice)', price: 6500, currency: 'SLSH' },
        // ─ Breakfast ─
        { category: 'Breakfast', name: 'Canjeero (Somali Pancake)', price: 1500, currency: 'SLSH' },
        { category: 'Breakfast', name: 'Lahoh', price: 1500, currency: 'SLSH' },
        { category: 'Breakfast', name: 'Malawax (Sweet Pancake)', price: 2000, currency: 'SLSH' },
        { category: 'Breakfast', name: 'Sabaayad (Flatbread)', price: 1500, currency: 'SLSH' },
        { category: 'Breakfast', name: 'Egg & Bread', price: 2500, currency: 'SLSH' },
        // ─ Starters ─
        { category: 'Starters', name: 'Sambuus (Samosa)', price: 500, currency: 'SLSH' },
        { category: 'Starters', name: 'Kac Kac (Crunchy Snack)', price: 1000, currency: 'SLSH' },
        { category: 'Starters', name: 'Salad', price: 2000, currency: 'SLSH' },
        // ─ Drinks ─
        { category: 'Drinks', name: 'Shaah (Somali Tea)', price: 1000, currency: 'SLSH' },
        { category: 'Drinks', name: 'Caano Geel (Camel Milk)', price: 3000, currency: 'SLSH' },
        { category: 'Drinks', name: 'Caano Lo\'aad (Cow Milk)', price: 2000, currency: 'SLSH' },
        { category: 'Drinks', name: 'Juice (Mixed Fruit)', price: 2500, currency: 'SLSH' },
        { category: 'Drinks', name: 'Water Bottle', price: 500, currency: 'SLSH' },
        { category: 'Drinks', name: 'Soft Drink (Soda)', price: 1000, currency: 'SLSH' },
        // ─ Desserts ─
        { category: 'Desserts', name: 'Xalwo (Somali Halva)', price: 2000, currency: 'SLSH' },
        { category: 'Desserts', name: 'Basbousa (Semolina Cake)', price: 2000, currency: 'SLSH' },
        { category: 'Desserts', name: 'Fresh Fruit Plate', price: 3000, currency: 'SLSH' },
    ];

    let added = 0;
    for (const item of somaliMenuItems) {
        try {
            const res = await secureFetch('/api/business/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (res.ok) added++;
        } catch(e) { console.warn('Could not add item', item.name, e); }
    }
    return added;
}

window.seedDefaultRestaurantMenu = seedDefaultRestaurantMenu;

/* ═══════════════════════════════════════════════════════════════════════════ */
/* FEATURE 1: Statement Pagination & Item Breakdowns                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function renderStatementTransactions() {
    const txnsTbody = document.getElementById('statement-txns-tbody');
    const pageInfo  = document.getElementById('statement-page-info');
    const prevBtn   = document.getElementById('statement-prev-btn');
    const nextBtn   = document.getElementById('statement-next-btn');
    const pageNum   = document.getElementById('statement-page-num');
    const showAllBtn = document.getElementById('statement-show-all-btn');

    if (!txnsTbody) return;
    txnsTbody.innerHTML = '';

    const total = currentStatementTxns.length;
    let visible;
    if (stmtShowAll) {
        visible = currentStatementTxns;
        if (pageInfo) pageInfo.textContent = `Showing all ${total} transactions`;
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (pageNum) pageNum.textContent = '—';
        if (showAllBtn) showAllBtn.textContent = 'Paginate';
    } else {
        const totalPages = Math.max(1, Math.ceil(total / stmtPerPage));
        stmtCurrentPage = Math.min(stmtCurrentPage, totalPages);
        const start = (stmtCurrentPage - 1) * stmtPerPage;
        const end   = Math.min(start + stmtPerPage, total);
        visible = currentStatementTxns.slice(start, end);
        if (pageInfo) pageInfo.textContent = `Showing ${total === 0 ? 0 : start + 1}–${end} of ${total} transactions`;
        if (prevBtn) prevBtn.disabled = stmtCurrentPage <= 1;
        if (nextBtn) nextBtn.disabled = stmtCurrentPage >= totalPages;
        if (pageNum) pageNum.textContent = `${stmtCurrentPage} / ${totalPages}`;
        if (showAllBtn) showAllBtn.textContent = `View All ${total}`;
    }

    if (visible.length === 0) {
        txnsTbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#64748b;padding:20px;">No transactions recorded in this period.</td></tr>';
        return;
    }

    visible.forEach(t => {
        const dateStr = new Date(t.timestamp).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const isRec  = t.type === 'Received';
        const party  = isRec ? (t.sender || 'Customer') : (t.receiver || 'Recipient');

        // Items breakdown
        let itemsHtml = '<span style="color:#94a3b8;font-size:11px;">—</span>';
        try {
            const classData = typeof t.classification_data === 'string'
                ? JSON.parse(t.classification_data) : (t.classification_data || {});
            if (classData.items && classData.items.length > 0) {
                const names = classData.items.slice(0, 3).map(i => i.item_name || i.allocation_type || '?');
                itemsHtml = `<span style="font-size:11px;color:#334155;">${names.join(', ')}${classData.items.length > 3 ? ' …' : ''}</span>`;
            } else if (classData.classified_by) {
                itemsHtml = `<span style="font-size:11px;color:#64748b;">👤 ${classData.classified_by}</span>`;
            }
        } catch(e) {}

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Click to view receipt';
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><span style="font-weight:700;color:${isRec ? '#10b981' : '#ef4444'};">${t.type}</span></td>
            <td><b>${t.provider || '-'}</b></td>
            <td>${party}</td>
            <td>${t.category || 'General'}</td>
            <td>${itemsHtml}</td>
            <td style="font-weight:700;color:${isRec ? '#10b981' : '#ef4444'};">${isRec ? '+' : '-'}${Number(t.amount).toLocaleString(undefined, {minimumFractionDigits:2})} ${t.currency}</td>
            <td style="text-align:center;">
                <button class="btn btn-text btn-sm stmt-receipt-btn" data-txnid="${t.id}" style="color:#6366f1;font-size:11px;font-weight:700;padding:2px 6px;" type="button">🧾</button>
            </td>
        `;
        tr.querySelector('.stmt-receipt-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof openReceiptModal === 'function') openReceiptModal(t);
        });
        tr.addEventListener('click', () => {
            if (typeof openReceiptModal === 'function') openReceiptModal(t);
        });
        txnsTbody.appendChild(tr);
    });
}

function initStatementPaginationEvents() {
    const prevBtn    = document.getElementById('statement-prev-btn');
    const nextBtn    = document.getElementById('statement-next-btn');
    const showAllBtn = document.getElementById('statement-show-all-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (stmtCurrentPage > 1) { stmtCurrentPage--; renderStatementTransactions(); }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const total = currentStatementTxns.length;
            const totalPages = Math.ceil(total / stmtPerPage);
            if (stmtCurrentPage < totalPages) { stmtCurrentPage++; renderStatementTransactions(); }
        });
    }
    if (showAllBtn) {
        showAllBtn.addEventListener('click', () => {
            stmtShowAll = !stmtShowAll;
            stmtCurrentPage = 1;
            renderStatementTransactions();
        });
    }
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/* FEATURE 2: Import Hub Events (Scan / Spreadsheet / Manual / Somali Menu)  */
/* ═══════════════════════════════════════════════════════════════════════════ */

function initImportHubEvents() {
    const openBtn   = document.getElementById('open-import-hub-btn');
    const modal     = document.getElementById('import-items-modal');
    const closeBtn  = document.getElementById('import-close-btn');
    const overlay   = document.getElementById('import-overlay');
    const methodBtns = document.querySelectorAll('.import-method-card');

    if (!modal) return;
    if (openBtn) openBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    if (overlay)  overlay.addEventListener('click', () => modal.classList.add('hidden'));

    // Tab switching
    methodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            methodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const method = btn.dataset.method;
            document.querySelectorAll('.import-panel').forEach(p => p.classList.add('hidden'));
            const panel = document.getElementById(`import-panel-${method}`);
            if (panel) panel.classList.remove('hidden');
        });
    });

    // ── Scan Menu Tab ─────────────────────────────────────────────────────────
    const triggerScanBtn = document.getElementById('trigger-scan-btn');
    const scanInput      = document.getElementById('scan-menu-input');
    const scanPreviewContainer = document.getElementById('scan-preview-container');
    const scanPreviewImg       = document.getElementById('scan-preview-img');
    const runOcrBtn            = document.getElementById('run-ocr-btn');
    const scanResultsContainer = document.getElementById('scan-results-container');
    const scanCountBadge       = document.getElementById('scan-count-badge');
    const scanItemsTbody       = document.getElementById('scan-items-tbody');
    const addScanRowBtn        = document.getElementById('add-scan-row-btn');
    const confirmScanBtn       = document.getElementById('confirm-scan-import-btn');

    if (triggerScanBtn && scanInput) {
        triggerScanBtn.addEventListener('click', () => scanInput.click());
    }
    if (scanInput) {
        scanInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            if (scanPreviewImg) scanPreviewImg.src = url;
            if (scanPreviewContainer) scanPreviewContainer.classList.remove('hidden');
        });
    }
    if (runOcrBtn) {
        runOcrBtn.addEventListener('click', async () => {
            runOcrBtn.textContent = '⚡ Extracting…';
            runOcrBtn.disabled = true;
            // Simple regex-based text extraction simulation (no external API needed)
            // In production, this would call a Vision API or server OCR endpoint
            const sampleItems = extractMenuItemsFromImageHint();
            renderScanPreviewTable(sampleItems, scanItemsTbody, scanCountBadge, scanResultsContainer);
            runOcrBtn.textContent = '⚡ Extract Items & Prices';
            runOcrBtn.disabled = false;
        });
    }
    if (addScanRowBtn && scanItemsTbody) {
        addScanRowBtn.addEventListener('click', () => {
            addScanTableRow(scanItemsTbody);
            if (scanCountBadge) {
                const count = scanItemsTbody.querySelectorAll('tr').length;
                scanCountBadge.textContent = `Detected Items (${count})`;
            }
        });
    }
    if (confirmScanBtn) {
        confirmScanBtn.addEventListener('click', async () => {
            const items = collectScanTableItems(scanItemsTbody);
            if (items.length === 0) { alert('No items to import.'); return; }
            await bulkImportItems(items, confirmScanBtn, modal);
        });
    }

    // ── Spreadsheet Tab ───────────────────────────────────────────────────────
    const triggerSheetBtn  = document.getElementById('trigger-sheet-btn');
    const sheetInput       = document.getElementById('spreadsheet-file-input');
    const sheetFilename    = document.getElementById('sheet-filename');
    const sheetMappingRow  = document.getElementById('sheet-mapping-row');
    const sheetPreviewContainer = document.getElementById('sheet-preview-container');
    const sheetCountBadge  = document.getElementById('sheet-count-badge');
    const sheetItemsTbody  = document.getElementById('sheet-items-tbody');
    const confirmSheetBtn  = document.getElementById('confirm-sheet-import-btn');

    const colSelectors = ['map-col-name', 'map-col-price', 'map-col-category', 'map-col-sku'];

    if (triggerSheetBtn && sheetInput) {
        triggerSheetBtn.addEventListener('click', () => sheetInput.click());
    }
    if (sheetInput) {
        sheetInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (sheetFilename) sheetFilename.textContent = file.name;
            try {
                parsedSheetRows = await parseSpreadsheet(file);
                if (parsedSheetRows.length === 0) { alert('No rows found in the file.'); return; }
                const headers = Object.keys(parsedSheetRows[0] || {});
                colSelectors.forEach(selId => {
                    const sel = document.getElementById(selId);
                    if (!sel) return;
                    sel.innerHTML = '<option value="">(none)</option>' + headers.map(h => `<option value="${h}">${h}</option>`).join('');
                    // Auto-detect
                    const autoMatch = { 'map-col-name': /name|item|product/i, 'map-col-price': /price|cost|amount/i, 'map-col-category': /categ|type|group/i, 'map-col-sku': /sku|code|barcode/i };
                    const pattern = autoMatch[selId];
                    if (pattern) {
                        const matched = headers.find(h => pattern.test(h));
                        if (matched) sel.value = matched;
                    }
                });
                if (sheetMappingRow) sheetMappingRow.classList.remove('hidden');
                renderSheetPreview(parsedSheetRows, sheetItemsTbody, sheetCountBadge, sheetPreviewContainer);
            } catch(err) {
                console.error('Spreadsheet parse error', err);
                alert('Could not read file. Make sure it is a valid .xlsx or .csv file.');
            }
        });
    }

    // Re-render preview on column mapping change
    colSelectors.forEach(selId => {
        const sel = document.getElementById(selId);
        if (sel) sel.addEventListener('change', () => renderSheetPreview(parsedSheetRows, sheetItemsTbody, sheetCountBadge, sheetPreviewContainer));
    });

    if (confirmSheetBtn) {
        confirmSheetBtn.addEventListener('click', async () => {
            const nameCol     = document.getElementById('map-col-name')?.value;
            const priceCol    = document.getElementById('map-col-price')?.value;
            const categoryCol = document.getElementById('map-col-category')?.value;
            const skuCol      = document.getElementById('map-col-sku')?.value;

            const items = parsedSheetRows.map(row => ({
                name:     String(row[nameCol] || '').trim(),
                price:    parseFloat(row[priceCol]) || 0,
                category: String(row[categoryCol] || 'General').trim(),
                sku:      skuCol ? String(row[skuCol] || '').trim() : '',
                currency: 'SLSH'
            })).filter(i => i.name);

            if (items.length === 0) { alert('No valid rows with item names.'); return; }
            await bulkImportItems(items, confirmSheetBtn, modal);
        });
    }

    // ── Manual Tab ────────────────────────────────────────────────────────────
    const manualForm = document.getElementById('quick-manual-item-form');
    if (manualForm) {
        manualForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const item = {
                name:     document.getElementById('qman-name').value.trim(),
                category: document.getElementById('qman-category').value.trim(),
                price:    parseFloat(document.getElementById('qman-price').value) || 0,
                currency: document.getElementById('qman-currency').value || 'SLSH',
                sku:      document.getElementById('qman-sku').value.trim(),
                description: document.getElementById('qman-desc').value.trim()
            };
            const res = await secureFetch('/api/business/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            if (res.ok) {
                if (typeof window.showToast === 'function') window.showToast(`✅ "${item.name}" added to catalog!`, 'success');
                manualForm.reset();
                loadCatalogItems();
            } else {
                alert('Failed to add item. Please try again.');
            }
        });
    }

    // ── Somali Menu Tab ───────────────────────────────────────────────────────
    const confirmSomaliBtn = document.getElementById('import-somali-preset-confirm-btn');
    if (confirmSomaliBtn) {
        confirmSomaliBtn.addEventListener('click', async () => {
            confirmSomaliBtn.disabled = true;
            confirmSomaliBtn.textContent = '⏳ Loading Menu…';
            try {
                const added = await seedDefaultRestaurantMenu();
                if (typeof window.showToast === 'function') {
                    window.showToast(`🍽️ Somali Menu loaded — ${added} items added!`, 'success');
                }
                modal.classList.add('hidden');
                loadCatalogItems();
            } finally {
                confirmSomaliBtn.disabled = false;
                confirmSomaliBtn.textContent = '🍽️ Load Full Somali Restaurant Menu';
            }
        });
    }
}

function extractMenuItemsFromImageHint() {
    // Placeholder — returns sample items for the OCR preview table
    // In production, this would send the image to a Vision AI API
    return [
        { name: 'Item 1', category: 'Main', price: 0, currency: 'SLSH' },
        { name: 'Item 2', category: 'Drinks', price: 0, currency: 'SLSH' },
    ];
}

function addScanTableRow(tbody, data = {}) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="custom-input scan-item-name" value="${data.name || ''}" placeholder="Item name" style="font-size:11px;padding:4px 6px;"></td>
        <td><input type="text" class="custom-input scan-item-cat" value="${data.category || 'General'}" placeholder="Category" style="font-size:11px;padding:4px 6px;"></td>
        <td><input type="number" class="custom-input scan-item-price" value="${data.price || 0}" min="0" step="any" style="font-size:11px;padding:4px 6px;width:80px;"></td>
        <td><select class="custom-select scan-item-cur" style="font-size:11px;padding:4px 6px;"><option value="SLSH">SLSH</option><option value="USD">USD</option></select></td>
        <td><button type="button" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:14px;" onclick="this.closest('tr').remove()">✕</button></td>
    `;
    tbody.appendChild(tr);
}

function renderScanPreviewTable(items, tbody, badge, container) {
    if (!tbody) return;
    tbody.innerHTML = '';
    items.forEach(item => addScanTableRow(tbody, item));
    if (badge) badge.textContent = `Detected Items (${items.length})`;
    if (container) container.classList.remove('hidden');
}

function collectScanTableItems(tbody) {
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).map(tr => ({
        name:     tr.querySelector('.scan-item-name')?.value.trim() || '',
        category: tr.querySelector('.scan-item-cat')?.value.trim() || 'General',
        price:    parseFloat(tr.querySelector('.scan-item-price')?.value) || 0,
        currency: tr.querySelector('.scan-item-cur')?.value || 'SLSH'
    })).filter(i => i.name);
}

async function parseSpreadsheet(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            // Fallback: CSV parsing
            const reader = new FileReader();
            reader.onload = (e) => {
                const lines = e.target.result.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length < 2) { resolve([]); return; }
                const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
                const rows = lines.slice(1).map(line => {
                    const cols = line.split(',').map(c => c.replace(/"/g, '').trim());
                    const obj = {};
                    headers.forEach((h, i) => obj[h] = cols[i] || '');
                    return obj;
                });
                resolve(rows);
            };
            reader.onerror = reject;
            reader.readAsText(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'binary' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                    resolve(rows);
                } catch(err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsBinaryString(file);
        }
    });
}

function renderSheetPreview(rows, tbody, badge, container) {
    if (!tbody) return;
    const nameCol     = document.getElementById('map-col-name')?.value;
    const priceCol    = document.getElementById('map-col-price')?.value;
    const categoryCol = document.getElementById('map-col-category')?.value;
    const skuCol      = document.getElementById('map-col-sku')?.value;

    tbody.innerHTML = '';
    const preview = rows.slice(0, 20);
    preview.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row[nameCol] || '—'}</td>
            <td>${row[categoryCol] || '—'}</td>
            <td>${row[priceCol] || '—'}</td>
            <td>${skuCol ? (row[skuCol] || '—') : '—'}</td>
        `;
        tbody.appendChild(tr);
    });
    if (badge) badge.textContent = `Items to Import (${rows.length})`;
    if (container) container.classList.remove('hidden');
}

async function bulkImportItems(items, btn, modal) {
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = `⏳ Importing ${items.length} items…`;
    try {
        const res = await secureFetch('/api/business/items/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        if (res.ok) {
            const data = await res.json();
            if (typeof window.showToast === 'function') {
                window.showToast(`✅ ${data.inserted || items.length} items imported successfully!`, 'success');
            }
            if (modal) modal.classList.add('hidden');
            loadCatalogItems();
        } else {
            alert('Import failed. Please try again.');
        }
    } catch(e) {
        console.error('Bulk import error', e);
        alert('Network error during import.');
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}


/* ═══════════════════════════════════════════════════════════════════════════ */
/* FEATURE 3: Automatic POS Thermal Receipt Modal                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

function openReceiptModal(txn) {
    if (!txn) return;
    const modal = document.getElementById('receipt-modal');
    const slip  = document.getElementById('thermal-receipt-slip');
    if (!modal || !slip) return;

    const company   = window.currentCompany || {};
    const dateStr   = new Date(txn.timestamp || Date.now()).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const isRec   = txn.type === 'Received';
    const party   = isRec ? (txn.sender || 'Customer') : (txn.receiver || 'Recipient');
    const receiptNo = `RCP-${String(txn.id || Date.now()).slice(-6)}`;

    // Parse items from classification_data
    let itemsRows = '';
    let classBy = 'Staff';
    try {
        const cd = typeof txn.classification_data === 'string'
            ? JSON.parse(txn.classification_data) : (txn.classification_data || {});
        classBy = cd.classified_by || classBy;
        if (cd.items && cd.items.length > 0) {
            itemsRows = cd.items.map(item => `
                <tr>
                    <td style="padding:2px 4px;">${item.item_name || item.allocation_type || '—'}</td>
                    <td style="padding:2px 4px;text-align:center;">${item.item_quantity || 1}</td>
                    <td style="padding:2px 4px;text-align:right;font-weight:700;">${item.converted_amount ? `${Number(item.converted_amount).toLocaleString()} ${item.target_currency || ''}` : '—'}</td>
                </tr>
            `).join('');
        }
    } catch(e) {}

    if (!itemsRows) {
        itemsRows = `<tr><td colspan="3" style="padding:4px;color:#888;font-size:11px;">${txn.category || 'Payment'}</td></tr>`;
    }

    slip.innerHTML = `
        <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;">
            <div style="font-size:16px;font-weight:900;letter-spacing:-0.5px;">${company.company_name || 'Cash-In Business'}</div>
            <div style="font-size:11px;color:#555;">${company.city || 'Somalia'} • ${(company.business_type || 'General').toUpperCase()}</div>
            <div style="font-size:11px;color:#555;">Code: ${company.company_code || '—'}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px;">
            <span><b>Receipt #:</b> ${receiptNo}</span>
            <span style="color:#555;">${dateStr}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
            <span><b>${isRec ? 'From (Customer):' : 'To (Recipient):'}</b></span>
            <span>${party}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
            <span><b>Cashier:</b></span>
            <span>${classBy}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px;">
            <span><b>Provider:</b></span>
            <span>${txn.provider || '—'}</span>
        </div>
        <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:6px 0;margin:8px 0;">
            <table style="width:100%;font-size:11px;border-collapse:collapse;">
                <thead><tr style="font-weight:700;border-bottom:1px solid #ddd;">
                    <th style="padding:2px 4px;text-align:left;">Item</th>
                    <th style="padding:2px 4px;text-align:center;">Qty</th>
                    <th style="padding:2px 4px;text-align:right;">Amount</th>
                </tr></thead>
                <tbody>${itemsRows}</tbody>
            </table>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;margin:6px 0;">
            <span>TOTAL</span>
            <span style="color:${isRec ? '#059669' : '#dc2626'};">${isRec ? '+' : '-'}${Number(txn.amount).toLocaleString(undefined, {minimumFractionDigits:2})} ${txn.currency}</span>
        </div>
        <div style="text-align:center;border-top:1px dashed #000;padding-top:8px;margin-top:8px;font-size:10px;color:#888;">
            Thank you for your business!<br>
            Powered by Cash-In Smart Ledger
        </div>
    `;

    // Store receipt text for copy/WhatsApp
    modal.dataset.receiptText = buildReceiptText(company, receiptNo, dateStr, party, classBy, txn);
    modal.dataset.txnId = txn.id || '';
    modal.classList.remove('hidden');
}

function buildReceiptText(company, receiptNo, dateStr, party, classBy, txn) {
    const isRec = txn.type === 'Received';
    return `🧾 *${company.company_name || 'Business'} — Receipt*\n` +
        `No: ${receiptNo} | ${dateStr}\n` +
        `${isRec ? 'Customer' : 'Recipient'}: ${party}\n` +
        `Cashier: ${classBy}\n` +
        `Provider: ${txn.provider || '—'}\n` +
        `Category: ${txn.category || 'General'}\n` +
        `─────────────────────\n` +
        `*TOTAL: ${isRec ? '+' : '-'}${Number(txn.amount).toLocaleString(undefined, {minimumFractionDigits:2})} ${txn.currency}*\n` +
        `─────────────────────\n` +
        `Thank you! Powered by Cash-In`;
}

function initReceiptModalEvents() {
    const modal    = document.getElementById('receipt-modal');
    const closeBtn = document.getElementById('receipt-close-btn');
    const overlay  = document.getElementById('receipt-overlay');
    const printBtn = document.getElementById('print-receipt-btn');
    const waBtn    = document.getElementById('whatsapp-receipt-btn');
    const copyBtn  = document.getElementById('copy-receipt-btn');

    if (!modal) return;
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    if (overlay)  overlay.addEventListener('click', () => modal.classList.add('hidden'));

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
    if (waBtn) {
        waBtn.addEventListener('click', () => {
            const text = modal.dataset.receiptText || '';
            const url  = `https://wa.me/?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        });
    }
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const text = modal.dataset.receiptText || '';
            try {
                await navigator.clipboard.writeText(text);
                if (typeof window.showToast === 'function') window.showToast('Receipt copied to clipboard! 📋', 'success');
            } catch(e) {
                prompt('Copy this receipt text:', text);
            }
        });
    }
}

window.openReceiptModal = openReceiptModal;


/* ═══════════════════════════════════════════════════════════════════════════ */
/* FEATURE 4: Employee Tracking — Directory, Clock In/Out, Sales Report       */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function loadEmployees() {
    try {
        const res = await secureFetch('/api/employees');
        if (!res.ok) return;
        currentEmployees = await res.json();
        renderEmployeeDirectory();
    } catch(e) {
        console.warn('Could not load employees', e);
    }
}

function renderEmployeeDirectory() {
    const listEl   = document.getElementById('employees-list');
    const emptyEl  = document.getElementById('employees-empty');
    const countEl  = document.getElementById('employee-count');

    if (!listEl) return;
    if (countEl) countEl.textContent = currentEmployees.length;
    listEl.innerHTML = '';

    if (currentEmployees.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    currentEmployees.forEach(emp => {
        const card = document.createElement('div');
        card.className = 'employee-card';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <div style="font-weight:800;font-size:14px;color:#0f172a;">${emp.name}</div>
                    <div style="font-size:12px;color:#6366f1;font-weight:600;">${emp.role || 'Staff'}</div>
                    ${emp.phone ? `<div style="font-size:11px;color:#64748b;">${emp.phone}</div>` : ''}
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button class="btn btn-text btn-sm emp-edit-btn" data-id="${emp.id}" style="font-size:11px;color:#6366f1;">✏️ Edit</button>
                    <button class="btn btn-text btn-sm emp-del-btn" data-id="${emp.id}" style="font-size:11px;color:#ef4444;">🗑️</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button class="btn btn-success btn-sm emp-checkin-btn" data-id="${emp.id}" data-name="${emp.name}" style="background:#10b981;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;">🟢 Clock In</button>
                <button class="btn btn-secondary btn-sm emp-checkout-btn" data-id="${emp.id}" data-name="${emp.name}" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;">🔴 Clock Out</button>
                <button class="btn btn-text btn-sm emp-select-btn" data-id="${emp.id}" data-name="${emp.name}" style="font-size:11px;color:#8b5cf6;font-weight:700;margin-left:auto;">Set as Cashier</button>
            </div>
        `;

        // Edit
        card.querySelector('.emp-edit-btn').addEventListener('click', () => openEmployeeModal(emp));
        // Delete
        card.querySelector('.emp-del-btn').addEventListener('click', async () => {
            if (!confirm(`Delete ${emp.name}?`)) return;
            const r = await secureFetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
            if (r.ok) { loadEmployees(); }
        });
        // Clock In
        card.querySelector('.emp-checkin-btn').addEventListener('click', async () => {
            await recordAttendance(emp.id, 'check_in');
            activeCashierEmployee = emp.name;
            if (typeof window.showToast === 'function') window.showToast(`🟢 ${emp.name} clocked in`, 'success');
            loadEmployeeAttendance();
        });
        // Clock Out
        card.querySelector('.emp-checkout-btn').addEventListener('click', async () => {
            await recordAttendance(emp.id, 'check_out');
            if (typeof window.showToast === 'function') window.showToast(`🔴 ${emp.name} clocked out`, 'success');
            loadEmployeeAttendance();
        });
        // Set as active cashier
        card.querySelector('.emp-select-btn').addEventListener('click', () => {
            activeCashierEmployee = emp.name;
            if (typeof window.showToast === 'function') window.showToast(`👤 ${emp.name} set as active cashier`, 'success');
        });

        listEl.appendChild(card);
    });
}

async function recordAttendance(employeeId, action) {
    try {
        await secureFetch(`/api/employees/${employeeId}/attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
    } catch(e) {
        console.warn('Attendance record error', e);
    }
}

async function loadEmployeeAttendance() {
    try {
        const res = await secureFetch('/api/employees/attendance?limit=30');
        if (!res.ok) return;
        const logs = await res.json();
        renderAttendanceLog(logs);
    } catch(e) {}
}

function renderAttendanceLog(logs) {
    const tbody = document.getElementById('attendance-log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#64748b;padding:14px;">No attendance records today.</td></tr>';
        return;
    }
    logs.forEach(log => {
        const tr = document.createElement('tr');
        const timeStr = new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        tr.innerHTML = `
            <td>${log.employee_name || '—'}</td>
            <td><span style="font-weight:700;color:${log.action === 'check_in' ? '#10b981' : '#ef4444'};">${log.action === 'check_in' ? '🟢 Clock In' : '🔴 Clock Out'}</span></td>
            <td>${timeStr}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function loadEmployeeSalesReport() {
    try {
        const res = await secureFetch('/api/employees/sales-report');
        if (!res.ok) return;
        const data = await res.json();
        const tbody = document.getElementById('employee-sales-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        const rows = Array.isArray(data) ? data : (data.report || []);
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:20px;">No employee sales recorded yet.</td></tr>';
            return;
        }
        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:700;">${row.employee_name || '—'}</td>
                <td>${row.role || '—'}</td>
                <td style="text-align:center;font-weight:700;">${row.transaction_count || 0}</td>
                <td style="font-weight:700;color:#10b981;">$${Number(row.total_volume || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch(e) {}
}

function openEmployeeModal(emp = null) {
    const modal    = document.getElementById('employee-modal');
    const title    = document.getElementById('employee-modal-title');
    const editId   = document.getElementById('emp-edit-id');
    const nameEl   = document.getElementById('emp-name');
    const roleEl   = document.getElementById('emp-role');
    const pinEl    = document.getElementById('emp-pin');
    const phoneEl  = document.getElementById('emp-phone');
    if (!modal) return;

    if (emp) {
        if (title)  title.textContent = 'Edit Employee';
        if (editId) editId.value = emp.id;
        if (nameEl) nameEl.value  = emp.name || '';
        if (roleEl) roleEl.value  = emp.role || 'Cashier';
        if (pinEl)  pinEl.value   = emp.pin_code || '';
        if (phoneEl) phoneEl.value = emp.phone || '';
    } else {
        if (title)  title.textContent = 'Add New Employee';
        if (editId) editId.value = '';
        if (nameEl) nameEl.value  = '';
        if (roleEl) roleEl.value  = 'Cashier';
        if (pinEl)  pinEl.value   = '1234';
        if (phoneEl) phoneEl.value = '';
    }
    modal.classList.remove('hidden');
}

function initEmployeeEvents() {
    // Global Clock In / Out header buttons
    const clockInBtn  = document.getElementById('clock-in-btn');
    const clockOutBtn = document.getElementById('clock-out-btn');
    if (clockInBtn) {
        clockInBtn.addEventListener('click', async () => {
            if (!activeCashierEmployee && currentEmployees.length > 0) {
                activeCashierEmployee = currentEmployees[0].name;
            }
            if (!activeCashierEmployee) { alert('No employee selected. Please add an employee first.'); return; }
            const emp = currentEmployees.find(e => e.name === activeCashierEmployee);
            if (emp) {
                await recordAttendance(emp.id, 'check_in');
                if (typeof window.showToast === 'function') window.showToast(`🟢 ${activeCashierEmployee} clocked in`, 'success');
                loadEmployeeAttendance();
            }
        });
    }
    if (clockOutBtn) {
        clockOutBtn.addEventListener('click', async () => {
            if (!activeCashierEmployee) { alert('No active cashier selected.'); return; }
            const emp = currentEmployees.find(e => e.name === activeCashierEmployee);
            if (emp) {
                await recordAttendance(emp.id, 'check_out');
                if (typeof window.showToast === 'function') window.showToast(`🔴 ${activeCashierEmployee} clocked out`, 'success');
                loadEmployeeAttendance();
            }
        });
    }

    // Add Employee button
    const addEmpBtn = document.getElementById('add-employee-btn');
    if (addEmpBtn) addEmpBtn.addEventListener('click', () => openEmployeeModal());

    // Employee Modal: close
    const modal    = document.getElementById('employee-modal');
    const closeBtn = document.getElementById('employee-close-btn');
    const overlay  = document.getElementById('employee-overlay');
    if (closeBtn) closeBtn.addEventListener('click', () => modal && modal.classList.add('hidden'));
    if (overlay)  overlay.addEventListener('click', () => modal && modal.classList.add('hidden'));

    // Employee Form submit
    const form = document.getElementById('employee-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = document.getElementById('emp-edit-id')?.value;
            const payload = {
                name:    document.getElementById('emp-name')?.value.trim(),
                role:    document.getElementById('emp-role')?.value,
                pin_code: document.getElementById('emp-pin')?.value,
                phone:   document.getElementById('emp-phone')?.value.trim(),
                permissions: {
                    classify: document.getElementById('perm-classify')?.checked,
                    reports:  document.getElementById('perm-reports')?.checked,
                    items:    document.getElementById('perm-items')?.checked,
                    delete:   document.getElementById('perm-delete')?.checked,
                }
            };
            const url    = editId ? `/api/employees/${editId}` : '/api/employees';
            const method = editId ? 'PUT' : 'POST';
            const res = await secureFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                if (modal) modal.classList.add('hidden');
                if (typeof window.showToast === 'function') window.showToast(`✅ Employee ${editId ? 'updated' : 'added'}!`, 'success');
                loadEmployees();
            }
        });
    }
}

window.loadEmployees = loadEmployees;
window.loadEmployeeAttendance = loadEmployeeAttendance;
window.loadEmployeeSalesReport = loadEmployeeSalesReport;


/* ═══════════════════════════════════════════════════════════════════════════ */
/* FEATURE 5: Offline Mode — Local Queue, Status Badge, Auto-Sync             */
/* ═══════════════════════════════════════════════════════════════════════════ */

function initOfflineSyncManager() {
    const badge = document.getElementById('network-status-badge');

    function updateBadge() {
        if (!badge) return;
        const pending = getOfflineQueue().length;
        if (navigator.onLine) {
            if (pending > 0) {
                badge.className = 'network-status-badge syncing';
                badge.textContent = `🟡 Syncing (${pending})`;
            } else {
                badge.className = 'network-status-badge online';
                badge.textContent = '🟢 Online';
            }
        } else {
            badge.className = 'network-status-badge offline';
            badge.textContent = pending > 0 ? `🔴 Offline (${pending} pending)` : '🔴 Offline';
        }
    }

    window.addEventListener('online',  () => { updateBadge(); syncOfflineQueue(); });
    window.addEventListener('offline', () => updateBadge());

    // Poll every 15 seconds
    setInterval(() => { if (navigator.onLine) syncOfflineQueue(); }, 15000);
    updateBadge();
}

function getOfflineQueue() {
    try { return JSON.parse(localStorage.getItem('cashin_offline_queue') || '[]'); }
    catch(e) { return []; }
}

function saveOfflineQueue(q) {
    localStorage.setItem('cashin_offline_queue', JSON.stringify(q));
}

function queueOfflineAction(action) {
    const q = getOfflineQueue();
    action._queued_at = new Date().toISOString();
    q.push(action);
    saveOfflineQueue(q);
    offlineQueue = q;
    document.getElementById('network-status-badge') && initOfflineSyncManager && updateOfflineBadge();
}

function updateOfflineBadge() {
    const badge = document.getElementById('network-status-badge');
    if (!badge) return;
    const pending = getOfflineQueue().length;
    if (!navigator.onLine) {
        badge.className = 'network-status-badge offline';
        badge.textContent = pending > 0 ? `🔴 Offline (${pending} pending)` : '🔴 Offline';
    } else if (pending > 0) {
        badge.className = 'network-status-badge syncing';
        badge.textContent = `🟡 Syncing (${pending})`;
    } else {
        badge.className = 'network-status-badge online';
        badge.textContent = '🟢 Online';
    }
}

async function syncOfflineQueue() {
    const q = getOfflineQueue();
    if (q.length === 0) return;

    const badge = document.getElementById('network-status-badge');
    if (badge) { badge.className = 'network-status-badge syncing'; badge.textContent = `🟡 Syncing (${q.length})…`; }

    const remaining = [];
    for (const action of q) {
        try {
            let ok = false;
            if (action.type === 'classify') {
                const res = await secureFetch(`/api/transactions/${action.txnId}/classify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(action.payload)
                });
                ok = res.ok;
            }
            if (!ok) remaining.push(action);
        } catch(e) {
            remaining.push(action);
        }
    }

    saveOfflineQueue(remaining);
    updateOfflineBadge();

    if (remaining.length === 0 && typeof window.showToast === 'function') {
        window.showToast('✅ All offline actions synced!', 'success');
    }
}

window.queueOfflineAction = queueOfflineAction;
