import { normalizePrice } from "./product-pipeline.js";

const marketFallbacks = {
  "chicken breast": { normalizedPrice: 1.65, normalizedUnit: "/100g" },
  milk: { normalizedPrice: 6.05, normalizedUnit: "/4L" },
  eggs: { normalizedPrice: 4.1, normalizedUnit: "/dozen" },
  bananas: { normalizedPrice: 0.75, normalizedUnit: "/lb" },
  rice: { normalizedPrice: 16.99, normalizedUnit: "/8kg" },
  yogurt: { normalizedPrice: 5.25, normalizedUnit: "/750g" }
};

export function optimizeShoppingList(scrapedData, userWantedItems, options = {}) {
  const mode = options.mode || "cheapest";
  const parsedItems = userWantedItems.map(parseWantedItem);
  const candidateSets = parsedItems.map((wanted) => ({
    wanted,
    candidates: scrapedData
      .filter((deal) => isLikelyMatch(`${deal.item_name} ${deal.brand || ""} ${deal.wanted_item || ""}`, wanted.item))
      .map((deal) => ({
        ...deal,
        wanted_item: wanted.item,
        normalized: normalizeDeal(deal)
      }))
      .filter((deal) => Number.isFinite(deal.normalized.normalizedPrice))
  }));
  const preferredStore = choosePreferredStore(candidateSets, mode);

  const matches = candidateSets.map(({ wanted, candidates }) => {
    const filteredCandidates = mode === "exact_brands"
      ? candidates.filter((deal) => isExactEnough(deal, wanted.item))
      : candidates;
    if (!candidates.length) {
      return {
        wanted_item: wanted.item,
        quantity: wanted.quantity,
        status: "not_found",
        candidates: [],
        selected: null
      };
    }

    const selected = selectCandidate(filteredCandidates.length ? filteredCandidates : candidates, preferredStore, mode);
    const average = averageNormalizedPrice(candidates, wanted.item);
    const savings = Math.max(0, average - selected.normalized.normalizedPrice);
    return {
      wanted_item: wanted.item,
      raw_item: wanted.raw,
      quantity: wanted.quantity,
      status: "matched",
      selected,
      candidates,
      average_market_price: roundMoney(average),
      savings: roundMoney(savings * wanted.quantity),
      savings_percent: average ? Math.round((savings / average) * 100) : 0
    };
  });

  const stores = {};
  for (const match of matches.filter((item) => item.status === "matched")) {
    const store = match.selected.store;
    stores[store] ||= { store, subtotal: 0, projected_savings: 0, items: [] };
    stores[store].items.push({
      wanted_item: match.wanted_item,
      quantity: match.quantity,
      item_name: match.selected.item_name,
      price: match.selected.price,
      line_total: roundMoney(match.selected.price * match.quantity),
      unit: match.selected.unit,
      unit_price: match.selected.unit_price || `$${match.selected.normalized.normalizedPrice.toFixed(2)}${match.selected.normalized.normalizedUnit}`,
      normalized_price: match.selected.normalized.normalizedPrice,
      normalized_unit: match.selected.normalized.normalizedUnit,
      savings: match.savings,
      savings_percent: match.savings_percent,
      image_url: match.selected.image_url,
      image_credit: match.selected.image_credit,
      category: match.selected.category,
      brand: match.selected.brand,
      product_summary: match.selected.product_summary,
      nutrition: match.selected.nutrition,
      brand_summary: match.selected.brand_summary,
      product_url: match.selected.product_url,
      store_url: match.selected.store_url,
      flyer_url: match.selected.flyer_url,
      confidence: match.selected.cache_status === "hit" ? "Cached today" : match.selected.confidence,
      confidence_score: match.selected.confidence_score,
      trust_score: match.selected.trust_score,
      niche_brand: match.selected.niche_brand,
      last_checked: match.selected.last_checked,
      exact_barcode_match: match.selected.exact_barcode_match,
      warning: match.selected.warning,
      variants: match.selected.variants || [],
      variation_options: match.selected.variation_options || [],
      alternatives: match.selected.alternatives || [],
      choice_reason: choiceReason(match, store),
      compared_options: match.candidates.length,
      candidate_options: match.candidates.map((candidate) => ({
        store: candidate.store,
        item_name: candidate.item_name,
        brand: candidate.brand,
        price: candidate.price,
        unit: candidate.unit,
        unit_price: candidate.unit_price || `$${candidate.normalized.normalizedPrice.toFixed(2)}${candidate.normalized.normalizedUnit}`,
        normalized_price: candidate.normalized.normalizedPrice,
        normalized_unit: candidate.normalized.normalizedUnit,
        confidence: candidate.cache_status === "hit" ? "Cached today" : candidate.confidence,
        confidence_score: candidate.confidence_score,
        trust_score: candidate.trust_score,
        niche_brand: candidate.niche_brand,
        product_url: candidate.product_url,
        flyer_url: candidate.flyer_url
      }))
    });
    stores[store].subtotal += match.selected.price * match.quantity;
    stores[store].projected_savings += match.savings;
  }

  const groupedStores = Object.values(stores).map((store) => ({
    ...store,
    subtotal: roundMoney(store.subtotal),
    projected_savings: roundMoney(store.projected_savings)
  }));

  return {
    generated_at: new Date().toISOString(),
    postal_code: scrapedData[0]?.postal_code || "L6H",
    mode,
    cheapest_path: groupedStores,
    unmatched_items: matches.filter((item) => item.status === "not_found").map((item) => item.wanted_item),
    totals: {
      item_count: matches.filter((item) => item.status === "matched").length,
      store_count: groupedStores.length,
      projected_spend: roundMoney(groupedStores.reduce((sum, store) => sum + store.subtotal, 0)),
      projected_savings: roundMoney(groupedStores.reduce((sum, store) => sum + store.projected_savings, 0))
    },
    comparisons: matches
  };
}

function isLikelyMatch(itemName, wantedItem) {
  const haystack = normalizeWords(itemName);
  const terms = normalizeWords(wantedItem).split(" ").filter((term) => term.length > 2);
  if (!terms.length) return false;
  return terms.some((term) => haystack.includes(term));
}

function parseWantedItem(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  return {
    raw,
    quantity: match ? Number(match[1]) : 1,
    item: (match ? match[2] : raw).trim()
  };
}

function choosePreferredStore(candidateSets, mode) {
  if (mode === "closest") return "No Frills";
  if (mode !== "fewest_stops") return "";
  const counts = {};
  for (const { candidates } of candidateSets) {
    for (const candidate of candidates) {
      counts[candidate.store] = (counts[candidate.store] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function selectCandidate(candidates, preferredStore, mode) {
  const sorted = [...candidates].sort((a, b) => a.normalized.normalizedPrice - b.normalized.normalizedPrice);
  if ((mode === "fewest_stops" || mode === "closest") && preferredStore) {
    return sorted.find((candidate) => candidate.store === preferredStore) || sorted[0];
  }
  return sorted[0];
}

function isExactEnough(deal, wantedItem) {
  const haystack = normalizeWords(`${deal.item_name} ${deal.brand || ""}`);
  const terms = normalizeWords(wantedItem).split(" ").filter((term) => term.length > 2);
  return terms.every((term) => haystack.includes(term));
}

function choiceReason(match, store) {
  const selected = match.selected;
  const nextBest = [...match.candidates]
    .filter((candidate) => candidate.store !== selected.store)
    .sort((a, b) => a.normalized.normalizedPrice - b.normalized.normalizedPrice)[0];
  if (!nextBest) return `${store} had the best available match for ${match.wanted_item}.`;
  const difference = Math.max(0, nextBest.normalized.normalizedPrice - selected.normalized.normalizedPrice);
  const percent = nextBest.normalized.normalizedPrice
    ? Math.round((difference / nextBest.normalized.normalizedPrice) * 100)
    : 0;
  return `${store} is ${percent}% cheaper per unit than ${nextBest.store} for ${match.wanted_item}.`;
}

function averageNormalizedPrice(candidates, wantedItem) {
  const normalized = candidates.map((candidate) => candidate.normalized.normalizedPrice);
  if (normalized.length > 1) {
    return normalized.reduce((sum, price) => sum + price, 0) / normalized.length;
  }
  const fallback = marketFallbacks[wantedItem.toLowerCase()];
  return fallback?.normalizedUnit === candidates[0].normalized.normalizedUnit
    ? fallback.normalizedPrice
    : candidates[0].normalized.normalizedPrice * 1.12;
}

function normalizeDeal(deal) {
  const normalized = normalizePrice(deal.price, deal.unit);
  return {
    normalizedPrice: normalized.normalized_price,
    normalizedUnit: normalized.normalized_unit
  };
}

function normalizeWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
