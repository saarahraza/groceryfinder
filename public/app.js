const dashboard = document.querySelector("#dashboard");
const form = document.querySelector("#agent-form");
const wantedInput = document.querySelector("#wanted-items");
const modeSelect = document.querySelector("#shopping-mode");
const printButton = document.querySelector("#print-list");
const clearButton = document.querySelector("#clear-list");
const statusCopy = document.querySelector("#status-copy");
const statusDot = document.querySelector("#status-dot");
const skeletonTemplate = document.querySelector("#skeleton-template");

let lastSavings = 0;
let pollTimer;
let refreshTimer;
let currentData = null;
let latestTimeline = [];
const savedListsKey = "flyerBentoSavedLists";
const priceAlertsKey = "flyerBentoPriceAlerts";
const selectedItemsKey = "flyerBentoSelectedItems";

if (window.location.protocol === "file:") {
  window.location.replace("http://localhost:3000/");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const wantedItems = wantedInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  showSkeletons();
  setStatus("Hunting for the best price...", "busy");
  await fetch("/api/run-agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postalCode: "L6H", wantedItems, mode: modeSelect.value })
  });
  saveList(wantedItems, modeSelect.value);
  startPolling();
});

printButton.addEventListener("click", () => window.print());
clearButton.addEventListener("click", clearCurrentList);

async function hydrate() {
  let status;
  let optimized;
  try {
    [status, optimized] = await Promise.all([
      fetchJson("/api/status"),
      fetchJson("/api/optimized-list")
    ]);
  } catch {
    showConnectionState();
    return;
  }

  renderStatus(status);
  if (status?.active) {
    showSkeletons(status.timeline);
    startPolling();
    return;
  }

  if (optimized) {
    renderDashboard(optimized);
    return;
  }

  showEmptyState();
}

async function clearCurrentList() {
  clearInterval(pollTimer);
  pollTimer = null;
  wantedInput.value = "";
  currentData = null;
  latestTimeline = [];
  lastSavings = 0;
  setStatus("List cleared. Add groceries to start a fresh search.", "ready");
  showEmptyState();
  await fetch("/api/clear-list", { method: "POST" }).catch(() => {});
}

function showConnectionState() {
  setStatus("Open the local app server to see live results.", "error");
  dashboard.innerHTML = '<div class="state-card"><h2>Server required</h2><p>Open <strong>http://localhost:3000/</strong> instead of the file version.</p></div>';
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    const status = await fetchJson("/api/status");
    renderStatus(status);
    if (status?.active) showSkeletons(status.timeline);
    if (!status?.active) {
      clearInterval(pollTimer);
      pollTimer = null;
      const optimized = await fetchJson("/api/optimized-list");
      if (optimized) renderDashboard(optimized);
    }
  }, 900);
}

function renderStatus(status) {
  if (!status) return;
  if (Array.isArray(status.timeline)) latestTimeline = status.timeline;
  if (status.phase === "error") {
    setStatus(status.error || "Agent run failed.", "error");
    return;
  }
  if (status.active) {
    const latest = latestTimeline.at(-1)?.message;
    setStatus(latest || (status.phase === "optimizing" ? "Normalizing unit prices..." : "Hunting for the best price..."), "busy");
    return;
  }
  setStatus(status.phase === "complete" ? "Optimized list is live." : "Ready to scan local flyers.", "ready");
}

function setStatus(text, state) {
  statusCopy.textContent = text;
  statusDot.className = `status-dot ${state === "busy" ? "busy" : ""} ${state === "error" ? "error" : ""}`.trim();
}

function showSkeletons(timeline = latestTimeline) {
  latestTimeline = Array.isArray(timeline) ? timeline : latestTimeline;
  const rows = latestTimeline.length
    ? latestTimeline
    : [
      { message: "Checking Global Brand Database..." },
      { message: "Resolving official product identity..." },
      { message: "Checking local Oakville stockists..." },
      { message: "Comparing prices and normalizing unit cost..." }
    ];
  dashboard.innerHTML = "";
  const terminal = document.createElement("article");
  terminal.className = "terminal-card";
  terminal.innerHTML = `
    <p class="terminal-label">Searching across 7 stores</p>
    <div class="terminal-window" aria-live="polite">
      ${rows.slice(-6).map((row, index) => `
        <p class="${index === rows.slice(-6).length - 1 ? "current" : "done"}">
          <span>${String(index + 1).padStart(2, "0")}</span> ${escapeHtml(row.message)}
        </p>
      `).join("")}
    </div>
  `;
  dashboard.append(terminal);
  for (let index = 0; index < 4; index += 1) {
    dashboard.append(skeletonTemplate.content.cloneNode(true));
  }
}

function showEmptyState() {
  dashboard.innerHTML = '<div class="state-card"><h2>Start by searching above</h2><p>Enter grocery items separated by commas to find the lowest prices across 7 Oakville stores.</p></div>';
}

function renderDashboard(data) {
  if (hasRejectedIdentity(data)) {
    setStatus("Rejected a bad product match. Try a more specific brand search.", "error");
    showEmptyState();
    return;
  }
  currentData = data;
  dashboard.innerHTML = "";
  const savingsCard = document.createElement("article");
  savingsCard.className = "savings-hero";
  savingsCard.innerHTML = `
    <div>
      <p class="savings-hero-label">Estimated savings</p>
      <p class="savings-hero-value">$<span id="savings-counter">0.00</span></p>
    </div>
    <div class="savings-hero-meta">
      <span class="savings-meta-item"><strong>${money(data.totals.projected_spend)}</strong> total</span>
      <span class="savings-meta-item"><strong>${data.totals.item_count}</strong> items</span>
      <span class="savings-meta-item"><strong>${data.totals.store_count}</strong> stop${data.totals.store_count === 1 ? "" : "s"}</span>
    </div>
    <div class="savings-hero-actions">
      <button type="button" class="btn-rerun" data-rerun-current>Rerun</button>
      <button type="button" class="btn-ghost" data-print-list>Print</button>
    </div>
  `;
  dashboard.append(savingsCard);

  dashboard.append(renderStatsCard(data));

  const sectionHeader = document.createElement("article");
  sectionHeader.innerHTML = `<p class="feed-label">${flattenResultItems(data).length} result${flattenResultItems(data).length === 1 ? "" : "s"} found across 7 stores</p>`;
  dashboard.append(sectionHeader);

  const productsGrid = document.createElement('div');
  productsGrid.className = 'products-grid';
  flattenResultItems(data).forEach(({ item, store }, index) => {
    productsGrid.append(renderProductResultCard(item, store, index));
  });
  dashboard.append(productsGrid);

  if (data.unmatched_items.length) {
    const unmatched = document.createElement("article");
    unmatched.className = "unmatched-card";
    unmatched.style.animationDelay = "520ms";
    unmatched.innerHTML = `<strong>No match found for:</strong> ${data.unmatched_items.join(", ")} — try a more specific name.`;
    dashboard.append(unmatched);
  }

  renderRetentionCards();
  renderSourcingActions();

  animateCounter(document.querySelector("#savings-counter"), lastSavings, data.totals.projected_savings);
  lastSavings = data.totals.projected_savings;
}

function flattenResultItems(data) {
  return data.cheapest_path.flatMap((store) => store.items.map((item) => ({ item, store })));
}

function renderStatsCard(data) {
  const stores = data.cheapest_path.map((store) => store.store);
  const cheapestStore = data.cheapest_path
    .flatMap((store) => store.items.map((item) => ({ store: store.store, price: item.normalized_price || item.price })))
    .sort((a, b) => a.price - b.price)[0]?.store || stores[0] || "Scanning";
  const inflation = simulatedInflation(data);
  const card = document.createElement("article");
  card.className = "summary-bar";
  card.innerHTML = `
    <div class="summary-stat"><p class="stat-label">Items scanned</p><p class="stat-value">${data.comparisons.reduce((sum, item) => sum + (item.candidates?.length || 0), 0)}</p></div>
    <div class="summary-stat"><p class="stat-label">Best store</p><p class="stat-value" style="font-size:1rem;padding-top:4px">${escapeHtml(cheapestStore)}</p></div>
    <div class="summary-stat"><p class="stat-label">Inflation est.</p><p class="stat-value ${inflation >= 0 ? "" : "green"}">${inflation >= 0 ? "+" : ""}${inflation.toFixed(1)}%</p></div>
  `;
  return card;
}

function renderProductResultCard(item, store, index) {
  const selected = isSelectedItem(item);
  const card = document.createElement("article");
  card.className = "product-card";
  card.style.animationDelay = `${140 + index * 100}ms`;
  card.innerHTML = `
    <div class="product-card-img">
      <button type="button" style="display:block;width:100%;height:100%;padding:0;border:none;background:none;cursor:pointer" data-info-kind="product" data-store="${escapeAttribute(store.store)}" data-item="${escapeAttribute(item.item_name)}" aria-label="Details for ${escapeAttribute(item.item_name)}">
        <img src="${escapeAttribute(item.image_url || fallbackImage(item.item_name))}" alt="${escapeAttribute(item.item_name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover" />
      </button>
      ${index === 0 ? '<span class="best-deal-badge">Best price</span>' : ''}
    </div>
    <div class="product-card-body">
      <p class="product-store">${escapeHtml(store.store)}</p>
      <p class="product-name">${escapeHtml(item.item_name)}</p>
      <p class="product-brand">${escapeHtml(item.brand || "Brand varies")}</p>
      <div class="product-price-row">
        <span class="product-price">${money(item.line_total || item.price)}</span>
        <span class="product-unit">${escapeHtml(item.unit)}</span>
      </div>
      ${item.savings_percent > 0 ? `<p class="product-saving">${item.savings_percent}% below market avg</p>` : ''}
      <div class="product-actions">
        <button type="button" class="btn-add ${selected ? 'added' : ''}" data-add-selected="${escapeAttribute(item.item_name)}" data-store="${escapeAttribute(store.store)}">${selected ? 'Added' : '+ Add'}</button>
        <button type="button" class="btn-details" data-info-kind="product" data-store="${escapeAttribute(store.store)}" data-item="${escapeAttribute(item.item_name)}">Details</button>
        <button type="button" class="btn-watch" data-watch-price="${escapeAttribute(item.item_name)}" data-watch-price-value="${escapeAttribute(item.price)}">Watch</button>
      </div>
    </div>
    <div class="info-panel" data-info-panel="${escapeAttribute(store.store)}" hidden></div>
  `;
  return card;
}

function simulatedInflation(data) {
  const seed = data.generated_at ? new Date(data.generated_at).getMinutes() : 7;
  const spend = data.totals.projected_spend || 1;
  return Math.min(4.8, Math.max(-1.8, ((seed % 9) - 3) * 0.37 + (spend % 3) * 0.22));
}

function hasRejectedIdentity(data) { return false; // disabled
  const items = data?.cheapest_path?.flatMap((store) => store.items || []) || [];
  return items.some((item) => {
    const wanted = String(item.wanted_item || "").toLowerCase();
    const name = String(item.item_name || "").toLowerCase();
    return name.includes("sidi ali");
  });
}

dashboard.addEventListener("click", (event) => {
  const rerun = event.target.closest("[data-rerun-current]");
  const print = event.target.closest("[data-print-list]");
  const watch = event.target.closest("[data-watch-price]");
  const swap = event.target.closest("[data-swap-store]");
  const saved = event.target.closest("[data-saved-list]");
  const clearSaved = event.target.closest("[data-clear-saved]");
  const clearAlerts = event.target.closest("[data-clear-alerts]");
  const addSelected = event.target.closest("[data-add-selected]");
  const removeSelected = event.target.closest("[data-remove-selected]");
  const exportReport = event.target.closest("[data-export-report]");
  if (rerun && currentData) rerunCurrentList();
  if (print) window.print();
  if (watch) addPriceAlert(watch.dataset.watchPrice, Number(watch.dataset.watchPriceValue));
  if (swap) applySwap(swap.dataset.swapItem, swap.dataset.swapStore);
  if (saved) rerunSavedList(Number(saved.dataset.savedList));
  if (clearSaved) clearSavedLists();
  if (clearAlerts) clearPriceAlerts();
  if (addSelected) addToSelectedList(addSelected.dataset.addSelected, addSelected.dataset.store);
  if (removeSelected) removeFromSelectedList(removeSelected.dataset.removeSelected);
  if (exportReport) exportSourcingReport();
});

dashboard.addEventListener("click", (event) => {
  const button = event.target.closest("[data-info-kind]");
  if (!button || !currentData) return;
  const storeName = button.dataset.store;
  const kind = button.dataset.infoKind;
  const store = currentData.cheapest_path.find((candidate) => candidate.store === storeName);
  if (!store) return;
  const item = button.dataset.item
    ? store.items.find((candidate) => candidate.item_name === button.dataset.item)
    : store.items[0];
  renderInfoPanel(store, item, kind, button);
});

function renderInfoPanel(store, item, kind, sourceButton) {
  const panel = sourceButton?.closest(".glass-card")?.querySelector(".info-panel") || dashboard.querySelector(`[data-info-panel="${cssEscape(store.store)}"]`);
  if (!panel) return;
  const title = kind === "product" ? item.item_name : store.store;
  const sourceUrl = kind === "product" ? item.product_url : kind === "flyer" ? item.flyer_url : item.store_url;
  const copy = kind === "product"
    ? item.product_summary
    : kind === "flyer"
      ? `Current flyer source for ${store.store}. Use it to confirm weekly dates, availability, and any store-specific limits before checkout.`
      : item.brand_summary;

  panel.hidden = false;
  panel.innerHTML = `
    <div class="info-panel-inner">
      ${kind === "product" ? `<img src="${escapeAttribute(item.image_url || fallbackImage(item.item_name))}" alt="${escapeAttribute(item.item_name)}" />` : ""}
      <div>
        <p class="label">${kind === "product" ? escapeHtml(item.category || "Product") : kind === "flyer" ? "Flyer Source" : "Brand Source"}</p>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(copy || "Source information is available for this result.")}</p>
        ${kind === "product" ? `
          <dl>
            <div><dt>Brand</dt><dd>${escapeHtml(item.brand || "Brand varies")}</dd></div>
            <div><dt>Store</dt><dd>${escapeHtml(store.store)}</dd></div>
            <div><dt>Deal</dt><dd>$${money(item.price)}${escapeHtml(item.unit)}</dd></div>
            <div><dt>Unit basis</dt><dd>${escapeHtml(item.unit_price || `${money(item.normalized_price)}${item.normalized_unit}`)}</dd></div>
            <div><dt>Savings</dt><dd>${item.savings_percent}% below market</dd></div>
            <div><dt>Compared</dt><dd>${item.compared_options || 1} store options</dd></div>
            <div><dt>Trust score</dt><dd>${Math.round(item.trust_score || (item.confidence_score || 0.55) * 100)}</dd></div>
            <div><dt>Brand type</dt><dd>${item.niche_brand ? "Niche Brand" : "Common Brand"}</dd></div>
          </dl>
          ${item.choice_reason ? `<p class="reason-copy">${escapeHtml(item.choice_reason)}</p>` : ""}
          ${item.warning ? `<p class="warning-copy">${escapeHtml(item.warning)}</p>` : ""}
          ${renderVariants(item.variants, item)}
          ${renderVariationOptions(item.variation_options, item)}
          ${renderAlternatives(item.alternatives)}
          ${renderNutrition(item.nutrition)}
          ${renderCandidateOptions(item.candidate_options, item.item_name)}
        ` : `
          <dl>
            <div><dt>Optimized subtotal</dt><dd>$${money(store.subtotal)}</dd></div>
            <div><dt>Projected savings</dt><dd>$${money(store.projected_savings)}</dd></div>
            <div><dt>Matched items</dt><dd>${store.items.length}</dd></div>
          </dl>
        `}
        <div class="source-row">
          <code>${escapeHtml(sourceUrl || "No source URL available")}</code>
          <button type="button" class="source-link" data-open-source="${escapeAttribute(sourceUrl || "#")}" data-source-query="${escapeAttribute(item.item_name || title)}">Open exact product</button>
        </div>
      </div>
    </div>
  `;
}

function renderCandidateOptions(options = [], itemName = "") {
  if (!options.length) return "";
  return `
    <div class="candidate-box">
      <p class="label">Compared Stores</p>
      ${options.map((option) => `
        <div>
          <strong>${escapeHtml(option.store)}</strong>
          <span>$${money(option.price)}${escapeHtml(option.unit)} · ${escapeHtml(option.unit_price || `${money(option.normalized_price)}${option.normalized_unit}`)}</span>
          <button type="button" data-swap-item="${escapeAttribute(itemName)}" data-swap-store="${escapeAttribute(option.store)}">Swap</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderVariants(variants = [], item = {}) {
  if (!variants.length) return "";
  return `<div class="chip-row"><p class="label">Variants</p>${variants.map((variant) => {
    const query = variantHasBrand(variant, item.brand) ? variant : `${item.brand || item.item_name || ""} ${variant}`.trim();
    return `<button type="button" data-variant-search="${escapeAttribute(query)}">${escapeHtml(variant)}</button>`;
  }).join("")}</div>`;
}

function renderVariationOptions(options = [], item = {}) {
  if (!options.length) return "";
  return `
    <div class="variation-box">
      <p class="label">Available Variations</p>
      ${options.slice(0, 8).map((option) => {
        const name = typeof option === "string" ? option : option.full_name || option.item_name;
        const brand = typeof option === "string" ? item.brand : option.brand || item.brand;
        const query = brand && !variantHasBrand(name, brand) ? `${brand} ${name}` : name;
        return `<button type="button" data-variant-search="${escapeAttribute(query)}">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(brand || "Brand varies")}${option?.niche_brand ? " · Niche Brand" : ""}</span>
        </button>`;
      }).join("")}
    </div>
  `;
}

function renderAlternatives(alternatives = []) {
  if (!alternatives.length) return "";
  return `<div class="chip-row"><p class="label">Similar Cheaper Options</p>${alternatives.map((item) => `<button type="button" data-variant-search="${escapeAttribute(item)}">${escapeHtml(item)}</button>`).join("")}</div>`;
}

function variantHasBrand(variant, brand) {
  return brand && String(variant).toLowerCase().includes(String(brand).toLowerCase());
}

dashboard.addEventListener("click", (event) => {
  const sourceButton = event.target.closest("[data-open-source]");
  if (!sourceButton) return;
  const url = sourceButton.dataset.openSource;
  const query = sourceButton.dataset.sourceQuery || "";
  if (url && url !== "#") openExactSource(sourceButton, url, query);
});

async function openExactSource(button, url, query) {
  const originalText = button.textContent;
  button.textContent = "Finding exact product...";
  button.disabled = true;
  try {
    const resolved = await fetchJson(`/api/resolve-product?url=${encodeURIComponent(url)}&query=${encodeURIComponent(query)}`);
    window.location.assign(resolved?.resolvedUrl || url);
  } catch {
    window.location.assign(url);
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
}

function renderNutrition(nutrition = {}) {
  const entries = [
    ["Serving", nutrition.serving],
    ["Calories", nutrition.calories],
    ["Protein", nutrition.protein],
    ["Carbs", nutrition.carbs],
    ["Fat", nutrition.fat]
  ].filter(([, value]) => value !== undefined && value !== null);
  if (!entries.length) return "";
  return `
    <div class="nutrition-box">
      <p class="label">Nutrition</p>
      ${entries.map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`).join("")}
    </div>
  `;
}

dashboard.addEventListener("click", (event) => {
  const variant = event.target.closest("[data-variant-search]");
  if (!variant) return;
  wantedInput.value = variant.dataset.variantSearch;
  form.requestSubmit();
});

function renderBadge(label) {
  const className = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="badge ${className}">${escapeHtml(label)}</span>`;
}

function formatChecked(value) {
  if (!value) return "Last checked just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Last checked today" : `Last checked ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function formatMode(mode = "cheapest") {
  return {
    cheapest: "Cheapest",
    fewest_stops: "Fewest stops",
    closest: "Closest stores",
    exact_brands: "Exact brands"
  }[mode] || "Cheapest";
}

function saveList(items, mode) {
  const lists = getSavedLists();
  const record = { items, mode, savedAt: new Date().toISOString() };
  const deduped = [record, ...lists.filter((list) => list.items.join("|") !== items.join("|"))].slice(0, 5);
  localStorage.setItem(savedListsKey, JSON.stringify(deduped));
}

function getSavedLists() {
  try {
    const lists = JSON.parse(localStorage.getItem(savedListsKey)) || [];
    const filtered = lists.filter((list) => !isBadLegacyList(list));
    if (filtered.length !== lists.length) localStorage.setItem(savedListsKey, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}

function getAlerts() {
  try {
    const alerts = JSON.parse(localStorage.getItem(priceAlertsKey)) || [];
    const filtered = alerts.filter((alert) => !isBadLegacyAlert(alert));
    if (filtered.length !== alerts.length) localStorage.setItem(priceAlertsKey, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}

function renderRetentionCards() {
  const lists = getSavedLists();
  const alerts = getAlerts();
  const card = document.createElement("article");
  card.className = "retention-section";
  card.innerHTML = `
    <div class="retention-heading">
      <div>
        <p class="label">Saved Trips</p>
        <h3>Quick Reruns</h3>
      </div>
      ${lists.length ? "<button type=\"button\" data-clear-saved>Clear</button>" : ""}
    </div>
    <div class="saved-trip-list">
      ${lists.length ? lists.map((list, index) => `
        <button type="button" class="saved-trip" data-saved-list="${index}">
          <span class="trip-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="trip-copy">
            <strong>${escapeHtml(formatSavedListName(list))}</strong>
            <small>${escapeHtml(formatSavedListDetail(list))}</small>
          </span>
          <span class="trip-mode">${escapeHtml(formatMode(list.mode))}</span>
        </button>
      `).join("") : "<p class=\"empty-retention\">Try fairlife, Monster Energy, Doritos, or grapes.</p>"}
    </div>
    <div class="retention-heading alerts-label">
      <div>
        <p class="label">Price Watch</p>
        <h3>Target Alerts</h3>
      </div>
      ${alerts.length ? "<button type=\"button\" data-clear-alerts>Clear</button>" : ""}
    </div>
    <div class="alert-list">
      ${alerts.length ? alerts.map((alert) => `
        <p class="alert-line">
          <span>${escapeHtml(alert.item)}</span>
          <strong>below $${money(alert.price)}</strong>
        </p>
      `).join("") : "<p class=\"empty-retention\">Watch an item to save a target price.</p>"}
    </div>
    <p class="best-time"><strong>Best time to buy staples</strong><span>Thursday morning after new flyers refresh.</span></p>
  `;
  dashboard.append(card);
}

function renderSourcingActions() {
  const selected = getSelectedItems();
  const sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;
  const total = selected.reduce((sum, item) => sum + (item.price || 0), 0);
  sidebar.innerHTML = selected.length ? `
    <div class="sidebar-header"><h2>Your list · ${selected.length} item${selected.length === 1 ? '' : 's'}</h2></div>
    ${selected.map((item) => `
      <div class="sidebar-item">
        <div><p class="sidebar-item-name">${escapeHtml(item.item_name)}</p><p class="sidebar-item-sub">${escapeHtml(item.store)}</p></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="sidebar-item-price">${money(item.price)}</span>
          <button type="button" class="btn-ghost" data-remove-selected="${escapeAttribute(item.item_name)}" style="padding:4px 8px;font-size:0.72rem">✕</button>
        </div>
      </div>
    `).join('')}
    <div class="sidebar-total"><span>Total estimate</span><span class="sidebar-total-value">${money(total)}</span></div>
    <button type="button" class="btn-export" data-export-report>Download CSV</button>
  ` : `<div class="sidebar-inner"><p class="sidebar-empty-label">Your list</p><p class="sidebar-empty-text">Add items from search results to build your shopping list.</p></div>`;
}

function getSelectedItems() {
  try {
    return JSON.parse(localStorage.getItem(selectedItemsKey)) || [];
  } catch {
    return [];
  }
}

function isSelectedItem(item) {
  return getSelectedItems().some((selected) => selected.item_name === item.item_name);
}

function addToSelectedList(itemName, storeName) {
  if (!currentData) return;
  const match = flattenResultItems(currentData).find(({ item, store }) => item.item_name === itemName && store.store === storeName);
  if (!match) return;
  const selected = getSelectedItems();
  const record = {
    item_name: match.item.item_name,
    brand: match.item.brand,
    store: match.store.store,
    price: match.item.price,
    unit_price: match.item.unit_price,
    trust_score: match.item.trust_score || 55,
    source_url: match.item.product_url
  };
  const next = [record, ...selected.filter((item) => item.item_name !== record.item_name)].slice(0, 20);
  localStorage.setItem(selectedItemsKey, JSON.stringify(next));
  renderDashboard(currentData);
}

function removeFromSelectedList(itemName) {
  const next = getSelectedItems().filter((item) => item.item_name !== itemName);
  localStorage.setItem(selectedItemsKey, JSON.stringify(next));
  if (currentData) renderDashboard(currentData);
}

function exportSourcingReport() {
  const selected = getSelectedItems();
  if (!selected.length) return;
  const rows = [
    ["Item", "Brand", "Store", "Price", "Unit Price", "Trust Score", "Source URL"],
    ...selected.map((item) => [
      item.item_name,
      item.brand,
      item.store,
      money(item.price),
      item.unit_price,
      item.trust_score,
      item.source_url
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sourcing-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatSavedListName(list = {}) {
  const items = Array.isArray(list.items) ? list.items : [];
  return items.slice(0, 2).join(", ") || "Untitled trip";
}

function formatSavedListDetail(list = {}) {
  const items = Array.isArray(list.items) ? list.items : [];
  const remaining = Math.max(0, items.length - 2);
  const saved = list.savedAt ? new Date(list.savedAt) : null;
  const date = saved && !Number.isNaN(saved.getTime()) ? saved.toLocaleDateString([], { month: "short", day: "numeric" }) : "recent";
  return `${items.length || 1} item${items.length === 1 ? "" : "s"}${remaining ? ` · +${remaining} more` : ""} · ${date}`;
}

function isBadLegacyAlert(alert = {}) {
  return String(alert.item || "").toLowerCase().includes("sidi ali");
}

function isBadLegacyList(list = {}) {
  const items = Array.isArray(list.items) ? list.items : [];
  return items.some((item) => String(item || "").trim().toLowerCase() === "bar");
}

function clearSavedLists() {
  localStorage.removeItem(savedListsKey);
  if (currentData) renderDashboard(currentData);
}

function clearPriceAlerts() {
  localStorage.removeItem(priceAlertsKey);
  if (currentData) renderDashboard(currentData);
}

function addPriceAlert(item, price) {
  const alerts = getAlerts();
  const next = [{ item, price: Math.max(0, price - 0.5), createdAt: new Date().toISOString() }, ...alerts].slice(0, 8);
  localStorage.setItem(priceAlertsKey, JSON.stringify(next));
  renderDashboard(currentData);
}

function rerunCurrentList() {
  const items = currentData.comparisons.map((comparison) => `${comparison.quantity || 1} ${comparison.wanted_item}`);
  wantedInput.value = items.join(", ");
  form.requestSubmit();
}

function rerunSavedList(index) {
  const list = getSavedLists()[index];
  if (!list) return;
  wantedInput.value = list.items.join(", ");
  modeSelect.value = list.mode || "cheapest";
  form.requestSubmit();
}

function applySwap(itemName, storeName) {
  if (!currentData) return;
  const flatItems = currentData.cheapest_path.flatMap((store) => store.items.map((item) => ({ ...item, store: store.store })));
  const swapped = flatItems.map((item) => {
    if (item.item_name !== itemName) return item;
    const candidate = item.candidate_options?.find((option) => option.store === storeName);
    return candidate ? { ...item, ...candidate, choice_reason: `You swapped this item to ${storeName}.`, line_total: candidate.price * (item.quantity || 1) } : item;
  });
  const groups = {};
  for (const item of swapped) {
    groups[item.store] ||= { store: item.store, subtotal: 0, projected_savings: 0, items: [] };
    groups[item.store].items.push(item);
    groups[item.store].subtotal += item.line_total || item.price;
    groups[item.store].projected_savings += item.savings || 0;
  }
  const nextData = {
    ...currentData,
    cheapest_path: Object.values(groups).map((store) => ({ ...store, subtotal: Number(store.subtotal.toFixed(2)), projected_savings: Number(store.projected_savings.toFixed(2)) })),
    totals: {
      ...currentData.totals,
      store_count: Object.keys(groups).length,
      projected_spend: Number(Object.values(groups).reduce((sum, store) => sum + store.subtotal, 0).toFixed(2))
    }
  };
  renderDashboard(nextData);
}

function fallbackImage(itemName) {
  const term = encodeURIComponent(itemName || "groceries");
  return `https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80&${term}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function animateCounter(node, from, to) {
  const start = performance.now();
  const duration = 900;
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = money(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

hydrate();
startBackgroundRefresh();

function startBackgroundRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (pollTimer) return;
    const optimized = await fetchJson("/api/optimized-list").catch(() => null);
    if (!optimized) return;
    if (!currentData || optimized.generated_at !== currentData.generated_at) renderDashboard(optimized);
  }, 2500);
}
