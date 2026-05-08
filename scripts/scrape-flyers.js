import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverDealsForItems } from "../src/product-pipeline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const defaultOutputPath = path.join(rootDir, "data", "scraped_deals.json");

const storeSources = {
  "No Frills": {
    store_url: "https://www.nofrills.ca/en",
    flyer_url: "https://www.nofrills.ca/en/flyer",
    brand_summary: "No Frills is a Canadian discount grocery chain focused on lower prices, weekly flyer offers, PC Optimum deals, and no name products."
  },
  Metro: {
    store_url: "https://www.metro.ca/en",
    flyer_url: "https://www.metro.ca/en/flyer/",
    brand_summary: "Metro is a Canadian grocery retailer with weekly flyer promotions, fresh departments, private-label products, and online grocery services in supported regions."
  },
  "Food Basics": {
    store_url: "https://www.foodbasics.ca",
    flyer_url: "https://www.foodbasics.ca/flyer.en.html",
    brand_summary: "Food Basics is a discount grocery banner in Ontario with weekly flyer specials, produce, meat, dairy, pantry staples, and value-focused private-label items."
  },
  Walmart: {
    store_url: "https://www.walmart.ca/en",
    flyer_url: "https://www.walmart.ca/flyer",
    brand_summary: "Walmart Canada sells groceries and household essentials with weekly flyer pricing, online search, pickup, delivery, and broad national product availability."
  },
  Sobeys: {
    store_url: "https://www.sobeys.com/en/",
    flyer_url: "https://www.sobeys.com/en/flyer/",
    brand_summary: "Sobeys is a Canadian grocery retailer with fresh departments, weekly offers, private-label products, and Voila online grocery service in supported areas."
  },
  FreshCo: {
    store_url: "https://freshco.com/",
    flyer_url: "https://freshco.com/flyer/",
    brand_summary: "FreshCo is a discount grocery banner focused on weekly flyer value, fresh groceries, pantry items, and price-sensitive household shopping."
  },
  "Real Canadian Superstore": {
    store_url: "https://www.realcanadiansuperstore.ca/",
    flyer_url: "https://www.realcanadiansuperstore.ca/flyer",
    brand_summary: "Real Canadian Superstore is a Loblaw grocery and general merchandise banner with PC Optimum offers, weekly flyers, and broad branded product selection."
  }
};

const productProfiles = [
  {
    match: /chicken/i,
    brand: "Maple Leaf Prime",
    image_url: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "chicken breast",
    category: "Meat and poultry",
    product_summary: "A high-protein staple where unit conversion matters: compare per pound and per 100g prices before choosing the cheaper pack.",
    nutrition: { serving: "100g", calories: 165, protein: "31g", carbs: "0g", fat: "3.6g" },
    base_price: 1.54,
    unit: "/100g"
  },
  {
    match: /egg/i,
    brand: "Burnbrae Farms",
    image_url: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "eggs",
    category: "Dairy and eggs",
    product_summary: "A weekly breakfast and baking staple. The cleanest comparison is usually price per dozen for large Grade A eggs.",
    nutrition: { serving: "1 large egg", calories: 70, protein: "6g", carbs: "0g", fat: "5g" },
    base_price: 3.79,
    unit: "/dozen"
  },
  {
    match: /banana/i,
    brand: "Chiquita",
    image_url: "https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "bananas",
    category: "Produce",
    product_summary: "A fresh produce staple commonly priced by the pound. Compare unit price and ripeness rather than package size.",
    nutrition: { serving: "1 medium banana", calories: 105, protein: "1.3g", carbs: "27g", fat: "0.4g" },
    base_price: 0.69,
    unit: "/lb"
  },
  {
    match: /milk/i,
    brand: "Neilson",
    image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "milk",
    category: "Dairy",
    product_summary: "A household staple often sold in 4L bags in Ontario. Compare by the same format to avoid misleading carton-to-bag prices.",
    nutrition: { serving: "250mL", calories: 130, protein: "9g", carbs: "12g", fat: "5g" },
    base_price: 5.99,
    unit: "/4L"
  },
  {
    match: /rice/i,
    brand: "Tilda",
    image_url: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "rice",
    category: "Pantry",
    product_summary: "A pantry staple where bulk bags can win on unit price. Compare the normalized price across bag sizes.",
    nutrition: { serving: "45g dry", calories: 160, protein: "3g", carbs: "36g", fat: "0g" },
    base_price: 14.99,
    unit: "/8kg"
  },
  {
    match: /yogurt|yoghurt/i,
    brand: "Astro Original",
    image_url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "yogurt",
    category: "Dairy",
    product_summary: "A refrigerated dairy item where tubs are easiest to compare by matching the gram size and style.",
    nutrition: { serving: "175g", calories: 130, protein: "8g", carbs: "15g", fat: "3g" },
    base_price: 4.79,
    unit: "/750g"
  },
  {
    match: /bread|loaf|bagel|bun/i,
    brand: "Dempster's",
    image_url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "bread",
    category: "Bread and bakery",
    product_summary: "A bakery staple where loaf size and slice count can vary. Compare the same loaf format where possible.",
    nutrition: { serving: "2 slices", calories: 170, protein: "6g", carbs: "32g", fat: "2g" },
    base_price: 3.49,
    unit: "/loaf"
  },
  {
    match: /cauliflower/i,
    brand: "Fresh Produce",
    image_url: "https://images.unsplash.com/photo-1613743983303-b3e89f8a2b80?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "cauliflower",
    category: "Produce",
    product_summary: "A fresh vegetable usually priced per head. Compare head size and condition when prices are close.",
    nutrition: { serving: "100g", calories: 25, protein: "2g", carbs: "5g", fat: "0.3g" },
    base_price: 3.99,
    unit: "/head"
  },
  {
    match: /grape/i,
    brand: "Sun World",
    image_url: "https://images.unsplash.com/photo-1537640538966-79f369143f8f?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: "grapes",
    category: "Produce",
    product_summary: "Fresh grapes are commonly priced by the pound. Check color, firmness, and package weight before buying.",
    nutrition: { serving: "100g", calories: 69, protein: "0.7g", carbs: "18g", fat: "0.2g" },
    base_price: 2.49,
    unit: "/lb"
  },
  {
    match: /takis|fuego|rolled tortilla/i,
    brand: "Takis",
    image_url: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash snack aisle photo",
    search_term: "Takis Fuego",
    category: "Snacks",
    product_summary: "Takis is a branded rolled tortilla chip snack. Compare the same bag size and flavour because promo pricing often varies by format.",
    nutrition: { serving: "28g", calories: 150, protein: "2g", carbs: "17g", fat: "8g" },
    base_price: 4.29,
    unit: "/280g bag"
  },
  {
    match: /oreo/i,
    brand: "Oreo",
    image_url: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash cookie photo",
    search_term: "Oreo cookies",
    category: "Cookies and snacks",
    product_summary: "Oreo is a classic sandwich cookie. Compare pack sizes as family packs often have a better unit price.",
    nutrition: { serving: "3 cookies", calories: 160, protein: "1g", carbs: "25g", fat: "7g" },
    base_price: 4.99,
    unit: "/432g"
  },
  {
    match: /bagel/i,
    brand: "Wonder",
    image_url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash bakery photo",
    search_term: "Wonder bagels",
    category: "Bread and bakery",
    product_summary: "Bagels are a round bread product. Compare pack sizes as 6-packs often have better unit pricing.",
    nutrition: { serving: "1 bagel", calories: 270, protein: "10g", carbs: "53g", fat: "1.5g" },
    base_price: 3.99,
    unit: "/6pk"
  },
  {
    match: /butter$/i,
    brand: "Lactantia",
    image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash dairy photo",
    search_term: "Lactantia butter",
    category: "Dairy",
    product_summary: "Butter is a dairy staple. Compare by weight and salted vs unsalted.",
    nutrition: { serving: "1 tbsp", calories: 100, protein: "0g", carbs: "0g", fat: "11g" },
    base_price: 5.99,
    unit: "/454g"
  },
  {
    match: /cheese|cheddar|mozzarella/i,
    brand: "Cracker Barrel",
    image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash dairy photo",
    search_term: "Cracker Barrel cheddar cheese",
    category: "Dairy",
    product_summary: "Cheese is a versatile dairy product. Compare by weight and style.",
    nutrition: { serving: "30g", calories: 110, protein: "7g", carbs: "0g", fat: "9g" },
    base_price: 7.49,
    unit: "/400g"
  },
  {
    match: /apple$/i,
    brand: "Fresh Produce",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash produce photo",
    search_term: "apples",
    category: "Produce",
    product_summary: "Apples are a fresh fruit staple. Compare by variety and bag size.",
    nutrition: { serving: "1 medium apple", calories: 95, protein: "0.5g", carbs: "25g", fat: "0.3g" },
    base_price: 1.99,
    unit: "/lb"
  },
  {
    match: /avocado/i,
    brand: "Fresh Produce",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash produce photo",
    search_term: "avocado",
    category: "Produce",
    product_summary: "Avocados are priced individually or in bags. Bags offer better unit pricing.",
    nutrition: { serving: "1/3 avocado", calories: 80, protein: "1g", carbs: "4g", fat: "7g" },
    base_price: 1.49,
    unit: "/ea"
  },
  {
    match: /coffee|ground coffee/i,
    brand: "Folgers",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash coffee photo",
    search_term: "Folgers ground coffee",
    category: "Beverages",
    product_summary: "Ground coffee is sold by weight. Compare price per 100g across brands.",
    nutrition: { serving: "1 cup", calories: 2, protein: "0g", carbs: "0g", fat: "0g" },
    base_price: 9.99,
    unit: "/920g"
  },
  {
    match: /cereal/i,
    brand: "Kellogg",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash pantry photo",
    search_term: "Kellogg cereal",
    category: "Breakfast",
    product_summary: "Cereal is a breakfast staple. Compare by box size and sugar content.",
    nutrition: { serving: "30g", calories: 110, protein: "2g", carbs: "25g", fat: "0g" },
    base_price: 4.99,
    unit: "/675g"
  },
  {
    match: /frozen pizza/i,
    brand: "Dr. Oetker",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash frozen photo",
    search_term: "Dr. Oetker frozen pizza",
    category: "Frozen",
    product_summary: "Frozen pizza is a convenient meal. Compare by size and toppings.",
    nutrition: { serving: "1/3 pizza", calories: 320, protein: "14g", carbs: "40g", fat: "12g" },
    base_price: 6.99,
    unit: "/ea"
  },
  {
    match: /ice cream/i,
    brand: "Chapman",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash frozen photo",
    search_term: "Chapman ice cream",
    category: "Frozen",
    product_summary: "Ice cream is sold by volume. Compare price per litre across brands.",
    nutrition: { serving: "125mL", calories: 140, protein: "2g", carbs: "18g", fat: "7g" },
    base_price: 5.99,
    unit: "/1.65L"
  },
  {
    match: /fairlife/i,
    brand: "fairlife",
    image_url: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash dairy product photo",
    search_term: "fairlife milk",
    category: "Dairy",
    product_summary: "fairlife is a branded ultra-filtered milk line. Compare by bottle size and type, such as 2%, chocolate, lactose free, or protein formats.",
    nutrition: { serving: "250mL", calories: 120, protein: "13g", carbs: "6g", fat: "4.5g" },
    base_price: 5.49,
    unit: "/1.5L"
  }
];

const demoDeals = [
  { store: "No Frills", item_name: "Boneless Skinless Chicken Breast", price: 1.44, unit: "/100g", postal_code: "L6H", source: "demo" },
  { store: "Metro", item_name: "Chicken Breast", price: 6.99, unit: "/lb", postal_code: "L6H", source: "demo" },
  { store: "Food Basics", item_name: "Large Eggs 12 Pack", price: 3.49, unit: "/dozen", postal_code: "L6H", source: "demo" },
  { store: "Walmart", item_name: "Large Eggs 12 Pack", price: 3.77, unit: "/dozen", postal_code: "L6H", source: "demo" },
  { store: "No Frills", item_name: "Bananas", price: 0.59, unit: "/lb", postal_code: "L6H", source: "demo" },
  { store: "Metro", item_name: "Bananas", price: 0.79, unit: "/lb", postal_code: "L6H", source: "demo" },
  { store: "Walmart", item_name: "2% Milk 4L Bag", price: 5.89, unit: "/4L", postal_code: "L6H", source: "demo" },
  { store: "Food Basics", item_name: "2% Milk 4L Bag", price: 5.69, unit: "/4L", postal_code: "L6H", source: "demo" },
  { store: "No Frills", item_name: "Basmati Rice 8kg", price: 13.99, unit: "/8kg", postal_code: "L6H", source: "demo" },
  { store: "Metro", item_name: "Greek Yogurt 750g", price: 4.99, unit: "/750g", postal_code: "L6H", source: "demo" },
  { store: "Food Basics", item_name: "Greek Yogurt 750g", price: 4.49, unit: "/750g", postal_code: "L6H", source: "demo" }
];

const storePriceFactors = {
  "No Frills": 0.92,
  "Food Basics": 0.95,
  Walmart: 0.98,
  Metro: 1.08,
  Sobeys: 1.06,
  FreshCo: 0.93,
  "Real Canadian Superstore": 0.96
};

export async function runFlyerScrape({ postalCode = "L6H", wantedItems = [], outputPath = defaultOutputPath, onProgress } = {}) {
  const mode = process.env.SCRAPER_MODE || "demo";
  const deals = wantedItems.length
    ? await discoverDealsForItems({ wantedItems, postalCode, onProgress }).catch((error) => {
      console.warn(`Product pipeline failed, using local demo data: ${error.message}`);
      onProgress?.({ step: "fallback", message: "Using local historical estimates because a live channel failed." });
      return buildDemoDeals(postalCode, wantedItems);
    })
    : mode === "live"
    ? await scrapeFlippLikeDeals(postalCode).catch((error) => {
      console.warn(`Live scrape failed, using demo flyer data: ${error.message}`);
      return buildDemoDeals(postalCode, wantedItems);
    })
    : buildDemoDeals(postalCode, wantedItems);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(deals, null, 2));
  return deals;
}

async function scrapeFlippLikeDeals(postalCode) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto("https://flipp.com/flyers", { waitUntil: "domcontentloaded", timeout: 45000 });
    await acceptOptionalDialog(page);
    await enterPostalCode(page, postalCode);
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    const groceryLinks = page.getByText(/grocery|food|supermarket/i).first();
    if (await groceryLinks.count()) {
      await groceryLinks.click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    }

    const deals = await page.evaluate(() => {
      const pricePattern = /\$[\d]+(?:[.,]\d{2})?/;
      const unitPattern = /\/\s?(?:lb|100g|kg|g|each|ea|dozen|pack|L|mL)/i;
      const nodes = Array.from(document.querySelectorAll("article, [data-testid], [class*='item'], [class*='deal'], [class*='card']"));
      return nodes
        .map((node) => {
          const text = node.textContent?.replace(/\s+/g, " ").trim() || "";
          const priceMatch = text.match(pricePattern);
          if (!priceMatch) return null;
          const price = Number(priceMatch[0].replace("$", "").replace(",", "."));
          const unit = text.match(unitPattern)?.[0]?.replace(/\s+/g, "") || "/ea";
          const itemName = text
            .replace(pricePattern, "")
            .replace(unitPattern, "")
            .slice(0, 90)
            .trim();
          return itemName ? { item_name: itemName, price, unit } : null;
        })
        .filter(Boolean)
        .slice(0, 80);
    });

    return deals.map((deal) => enrichDeal({
      store: inferStore(deal.item_name),
      ...deal,
      postal_code: postalCode,
      source: "flipp"
    }));
  } finally {
    await browser.close();
  }
}

async function acceptOptionalDialog(page) {
  for (const label of [/accept/i, /agree/i, /continue/i]) {
    const button = page.getByRole("button", { name: label }).first();
    if (await button.count()) {
      await button.click({ timeout: 2000 }).catch(() => {});
      return;
    }
  }
}

async function enterPostalCode(page, postalCode) {
  const postalInput = page.locator("input").filter({ hasText: "" }).first();
  if (await postalInput.count()) {
    await postalInput.fill(postalCode, { timeout: 5000 }).catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
  }
}

function inferStore(text) {
  const stores = ["No Frills", "Metro", "Food Basics", "Walmart", "FreshCo", "Sobeys"];
  return stores.find((store) => text.toLowerCase().includes(store.toLowerCase())) || "Local Flyer";
}

async function enrichDeal(deal) {
  const store = storeSources[deal.store] || {
    store_url: "https://flipp.com/flyers",
    flyer_url: "https://flipp.com/flyers",
    brand_summary: "Local flyer result found through a flyer source. Confirm store availability and dates before shopping."
  };
  const product = productProfiles.find((source) => source.match.test(deal.item_name)) || await genericProductProfile(deal.item_name);
  return {
    ...deal,
    ...store,
    brand: deal.brand || product.brand,
    image_url: product.image_url,
    image_credit: product.image_credit,
    category: product.category,
    product_summary: product.product_summary,
    nutrition: product.nutrition,
    product_url: buildProductUrl(deal.store, product.search_term)
  };
}

async function buildDemoDeals(postalCode, wantedItems) {
  const wanted = [...new Set(wantedItems.map((item) => item.trim()).filter(Boolean))];
  const seeded = await Promise.all(demoDeals.map((deal) => enrichDeal({ ...deal, postal_code: postalCode })));
  const additions = [];
  for (const item of wanted) {
    const alreadyCovered = seeded.some((deal) => isSameGrocery(deal.item_name, item));
    if (!alreadyCovered) {
      const deals = await synthesizeDealsForItem(item, postalCode);
      additions.push(...deals);
    }
  }
  return [...seeded, ...additions];
}

async function synthesizeDealsForItem(itemName, postalCode) {
  const profile = productProfiles.find((source) => source.match.test(itemName)) || await genericProductProfile(itemName);
  return Promise.all(Object.keys(storeSources).map((storeName, index) => enrichDeal({
    store: storeName,
    item_name: displayItemName(itemName, profile),
    brand: profile.brand,
    price: roundMoney(profile.base_price * storePriceFactors[storeName] * (1 + index * 0.015)),
    unit: profile.unit,
    postal_code: postalCode,
    source: "estimated-demo"
  })));
}


async function fetchNutritionFromOpenFoodFacts(itemName) {
  try {
    const query = encodeURIComponent(itemName);
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&action=process&json=1&page_size=1`;
    const res = await fetch(url);
    const data = await res.json();
    const product = data?.products?.[0];
    if (!product) return null;
    const n = product.nutriments || {};
    return {
      serving: product.serving_size || '100g',
      calories: Math.round(n['energy-kcal_serving'] || n['energy-kcal_100g'] || 0),
      protein: (n['proteins_serving'] || n['proteins_100g'] || 0) + 'g',
      carbs: (n['carbohydrates_serving'] || n['carbohydrates_100g'] || 0) + 'g',
      fat: (n['fat_serving'] || n['fat_100g'] || 0) + 'g'
    };
  } catch {
    return null;
  }
}

async function genericProductProfile(itemName) {
  const nutrition = await fetchNutritionFromOpenFoodFacts(itemName) || { serving: 'varies', calories: 'Check label', protein: 'Check label', carbs: 'Check label', fat: 'Check label' };
  const clean = displayCase(itemName || 'Grocery item');
  return {
    brand: displayCase(itemName.split(" ")[0]) || "Store Brand",
    image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    image_credit: "Unsplash grocery product photo",
    search_term: itemName,
    category: "Grocery",
    product_summary: `${clean} is estimated from generic grocery pricing because no exact flyer item was found. Use the source website to confirm live availability.`,
    nutrition: { serving: "varies", calories: "Check label", protein: "Check label", carbs: "Check label", fat: "Check label" },
    base_price: 4.49,
    unit: "/ea"
  };
}

function isSameGrocery(itemName, wantedItem) {
  const haystack = itemName.toLowerCase();
  const terms = wantedItem.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
  return terms.some((term) => haystack.includes(term));
}

function displayItemName(itemName, profile) {
  const displayName = displayCase(itemName);
  return displayName.toLowerCase().includes(String(profile.brand).toLowerCase())
    ? displayName
    : `${profile.brand} ${displayName}`.replace(/\s+/g, " ").trim();
}

function displayCase(value) {
  return String(value || "")
    .split(/\s+/)
    .map((word) => word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "")
    .join(" ");
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function buildProductUrl(store, term) {
  const encoded = encodeURIComponent(term);
  if (store === "No Frills") return `https://www.nofrills.ca/en/search?search-bar=${encoded}`;
  if (store === "Metro") return `https://www.metro.ca/en/online-grocery/search?filter=${encoded}`;
  if (store === "Food Basics") return `https://www.foodbasics.ca/search-page.en.html?search=${encoded}`;
  if (store === "Walmart") return `https://www.walmart.ca/search?q=${encoded}`;
  if (store === "Sobeys") return `https://voila.ca/search?q=${encoded}`;
  if (store === "FreshCo") return `https://voila.ca/search?q=${encoded}`;
  if (store === "Real Canadian Superstore") return `https://www.realcanadiansuperstore.ca/search?search-bar=${encoded}`;
  return `https://flipp.com/search/${encoded}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const postalCode = process.argv[2] || "L6H";
  runFlyerScrape({ postalCode }).then((deals) => {
    console.log(JSON.stringify(deals, null, 2));
  });
}
