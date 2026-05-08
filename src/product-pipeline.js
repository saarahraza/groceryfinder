import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const identityCachePath = path.join(rootDir, "data", "product_identity_cache.json");
const priceCachePath = path.join(rootDir, "data", "price_cache.json");
const routerLogPath = path.join(rootDir, "data", "router.log");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GRAMS_PER_LB = 453.59237;
const STORE_TIMEOUT_MS = Number(process.env.STORE_SCRAPE_TIMEOUT_MS || 5000);
const AGGREGATOR_TIMEOUT_MS = Number(process.env.AGGREGATOR_SCRAPE_TIMEOUT_MS || 4000);

const storeConfigs = [
  {
    store: "No Frills",
    store_url: "https://www.nofrills.ca/en",
    flyer_url: "https://www.nofrills.ca/en/flyer",
    searchUrl: (query) => `https://www.nofrills.ca/en/search?search-bar=${encodeURIComponent(query)}&storeId=3150`
  },
  {
    store: "Metro",
    store_url: "https://www.metro.ca/en",
    flyer_url: "https://www.metro.ca/en/flyer/",
    searchUrl: (query) => `https://www.metro.ca/en/online-grocery/search?filter=${encodeURIComponent(query)}`
  },
  {
    store: "Sobeys",
    store_url: "https://www.sobeys.com/en/",
    flyer_url: "https://www.sobeys.com/en/flyer/",
    searchUrl: (query) => `https://voila.ca/search?q=${encodeURIComponent(query)}`
  },
  {
    store: "FreshCo",
    store_url: "https://freshco.com/",
    flyer_url: "https://freshco.com/flyer/",
    searchUrl: (query) => `https://voila.ca/search?q=${encodeURIComponent(query)}`
  },
  {
    store: "Food Basics",
    store_url: "https://www.foodbasics.ca/",
    flyer_url: "https://www.foodbasics.ca/flyer.en.html",
    searchUrl: (query) => `https://www.foodbasics.ca/search-page.en.html?search=${encodeURIComponent(query)}`
  },
  {
    store: "Walmart",
    store_url: "https://www.walmart.ca/en",
    flyer_url: "https://www.walmart.ca/en/flyer",
    searchUrl: (query) => `https://www.walmart.ca/search?q=${encodeURIComponent(query)}`
  },
  {
    store: "Real Canadian Superstore",
    store_url: "https://www.realcanadiansuperstore.ca/",
    flyer_url: "https://www.realcanadiansuperstore.ca/flyer",
    searchUrl: (query) => `https://www.realcanadiansuperstore.ca/search?search-bar=${encodeURIComponent(query)}`
  }
];

const aggregatorConfigs = [
  {
    name: "Instacart",
    searchUrl: (query) => `https://www.instacart.ca/store/s?k=${encodeURIComponent(query)}`
  },
  {
    name: "Loblaws",
    searchUrl: (query) => `https://www.loblaws.ca/search?search-bar=${encodeURIComponent(query)}`
  }
];

const fuzzyCatalog = [
  { terms: ["dorito", "doritos"], canonical: "Doritos Nacho Cheese", brand: "Doritos" },
  { terms: ["cheeto", "cheetos", "cheetos chips", "cheetos puffs"], canonical: "Cheetos Crunchy Cheese Snacks", brand: "Cheetos" },
  { terms: ["monster", "monster energy", "ultra white"], canonical: "Monster Energy Ultra White", brand: "Monster Energy" },
  { terms: ["takis", "fuego"], canonical: "Takis Fuego", brand: "Takis" },
  { terms: ["fairlife"], canonical: "fairlife Ultra-Filtered Milk", brand: "fairlife" },
  { terms: ["oreo", "oreos"], canonical: "Oreo Original Cookies", brand: "Oreo" },
  { terms: ["quest", "quest bar", "quest protein bar"], canonical: "Quest Protein Bar", brand: "Quest" },
  { terms: ["clif", "clif bar", "cliff", "cliff bar"], canonical: "CLIF Bar Energy Bar", brand: "CLIF" },
  { terms: ["kind bar", "kind"], canonical: "KIND Bar", brand: "KIND" },
  { terms: ["eggs", "egg"], canonical: "Large Eggs 12 Pack", brand: "Burnbrae Farms" },
  { terms: ["butter", "margarine"], canonical: "Lactantia Butter", brand: "Lactantia" },
  { terms: ["cheese", "cheddar"], canonical: "Cracker Barrel Cheddar Cheese", brand: "Cracker Barrel" },
  { terms: ["coffee", "ground coffee"], canonical: "Folgers Classic Roast Coffee", brand: "Folgers" },
  { terms: ["sugar", "white sugar"], canonical: "Redpath White Sugar", brand: "Redpath" },
  { terms: ["flour", "all purpose flour"], canonical: "Robin Hood All Purpose Flour", brand: "Robin Hood" },
  { terms: ["cereal", "corn flakes"], canonical: "Kellogg Corn Flakes", brand: "Kellogg" },
  { terms: ["oats", "oatmeal", "quaker"], canonical: "Quaker Large Flake Oats", brand: "Quaker" },
  { terms: ["peanut butter", "peanutbutter"], canonical: "Kraft Peanut Butter", brand: "Kraft" },
  { terms: ["orange juice", "oj", "tropicana"], canonical: "Tropicana Orange Juice", brand: "Tropicana" },
  { terms: ["almond milk", "oat milk"], canonical: "Silk Oat Milk", brand: "Silk" },
  { terms: ["greek yogurt", "activia", "oikos"], canonical: "Oikos Greek Yogurt", brand: "Oikos" },
  { terms: ["butter", "becel", "gay lea"], canonical: "Becel Margarine", brand: "Becel" },
  { terms: ["ketchup", "heinz"], canonical: "Heinz Ketchup", brand: "Heinz" },
  { terms: ["pasta", "noodles", "spaghetti", "barilla"], canonical: "Barilla Spaghetti", brand: "Barilla" },
  { terms: ["tuna", "flaked tuna"], canonical: "Clover Leaf Flaked White Tuna", brand: "Clover Leaf" },
  { terms: ["oreo", "oreos"], canonical: "Oreo Original Cookies", brand: "Oreo" },
  { terms: ["celsius", "celsius drink"], canonical: "Celsius Energy Drink", brand: "Celsius" },
  { terms: ["red bull", "redbull"], canonical: "Red Bull Energy Drink", brand: "Red Bull" },
  { terms: ["lays", "lay's", "lays chips"], canonical: "Lay's Classic Chips", brand: "Lay's" },
  { terms: ["pepsi"], canonical: "Pepsi Cola", brand: "Pepsi" },
  { terms: ["coca cola", "coke"], canonical: "Coca-Cola", brand: "Coca-Cola" },
  { terms: ["gatorade"], canonical: "Gatorade Thirst Quencher", brand: "Gatorade" },
  { terms: ["prime", "prime hydration"], canonical: "Prime Hydration Drink", brand: "Prime" },
  { terms: ["bodyarmor", "body armor"], canonical: "BODYARMOR SportWater", brand: "BODYARMOR" }
];

const historicalPrices = {
  "doritos nacho cheese": { base_price: 4.49, unit: "/235g bag" },
  "cheetos crunchy cheese snacks": { base_price: 4.29, unit: "/285g bag" },
  "monster energy ultra white": { base_price: 3.49, unit: "/473ml" },
  "takis fuego": { base_price: 4.29, unit: "/280g bag" },
  "fairlife ultra-filtered milk": { base_price: 5.49, unit: "/1.5L" },
  "quest protein bar": { base_price: 3.49, unit: "/60g bar" },
  "clif bar energy bar": { base_price: 2.49, unit: "/68g bar" },
  "kind bar": { base_price: 2.29, unit: "/40g bar" },
  "dempster's bread": { base_price: 3.49, unit: "/loaf" },
  cauliflower: { base_price: 3.99, unit: "/head" },
  "red seedless grapes": { base_price: 2.49, unit: "/lb" },
  "greek yogurt": { base_price: 4.79, unit: "/750g" },
  "large eggs 12 pack": { base_price: 3.99, unit: "/dozen" },
  "lactantia butter": { base_price: 5.99, unit: "/454g" },
  "cracker barrel cheddar cheese": { base_price: 7.49, unit: "/400g" },
  "folgers classic roast coffee": { base_price: 9.99, unit: "/920g" },
  "redpath white sugar": { base_price: 4.49, unit: "/2kg" },
  "robin hood all purpose flour": { base_price: 5.99, unit: "/5kg" },
  "kellogg corn flakes": { base_price: 4.99, unit: "/675g" },
  "quaker large flake oats": { base_price: 5.49, unit: "/1kg" },
  "kraft peanut butter": { base_price: 6.99, unit: "/1kg" },
  "tropicana orange juice": { base_price: 5.49, unit: "/1.75L" },
  "silk oat milk": { base_price: 4.99, unit: "/1.75L" },
  "oikos greek yogurt": { base_price: 5.49, unit: "/750g" },
  "becel margarine": { base_price: 4.99, unit: "/454g" },
  "heinz ketchup": { base_price: 4.49, unit: "/1L" },
  "barilla spaghetti": { base_price: 2.49, unit: "/450g" },
  "clover leaf flaked white tuna": { base_price: 2.29, unit: "/170g" },
  "oreo original cookies": { base_price: 4.99, unit: "/432g" },
  "celsius energy drink": { base_price: 2.99, unit: "/355ml" },
  "red bull energy drink": { base_price: 3.29, unit: "/250ml" },
  "lay's classic chips": { base_price: 4.49, unit: "/235g" },
  "pepsi cola": { base_price: 1.49, unit: "/2L" },
  "coca-cola": { base_price: 1.49, unit: "/2L" },
  "gatorade thirst quencher": { base_price: 1.99, unit: "/591ml" },
  "prime hydration drink": { base_price: 3.49, unit: "/500ml" },
  "bodyarmor sportwater": { base_price: 2.49, unit: "/700ml" }
};

const fallbackProfiles = [
  { match: /dorito/i, item_name: "Doritos Nacho Cheese", brand: "Doritos", image_url: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=80", category: "Snacks", nutrition: { serving: "28g", calories: 150, protein: "2g", carbs: "18g", fat: "8g" }, base_price: 4.49, unit: "/235g bag" },
  { match: /cheeto/i, item_name: "Cheetos Crunchy Cheese Snacks", brand: "Cheetos", image_url: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=80", category: "Snacks", nutrition: { serving: "28g", calories: 160, protein: "2g", carbs: "15g", fat: "10g" }, base_price: 4.29, unit: "/285g bag" },
  { match: /monster|ultra white/i, item_name: "Monster Energy Ultra White", brand: "Monster Energy", image_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=900&q=80", category: "Beverages", nutrition: { serving: "473mL", calories: 10, protein: "0g", carbs: "3g", fat: "0g" }, base_price: 3.49, unit: "/473ml" },
  { match: /takis|fuego/i, item_name: "Takis Fuego", brand: "Takis", image_url: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=80", category: "Snacks", nutrition: { serving: "28g", calories: 150, protein: "2g", carbs: "17g", fat: "8g" }, base_price: 4.29, unit: "/280g bag" },
  { match: /fairlife/i, item_name: "fairlife Ultra-Filtered Milk", brand: "fairlife", image_url: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80", category: "Dairy", nutrition: { serving: "250mL", calories: 120, protein: "13g", carbs: "6g", fat: "4.5g" }, base_price: 5.49, unit: "/1.5L" },
  { match: /quest.*bar|quest/i, item_name: "Quest Protein Bar", brand: "Quest", image_url: "https://images.unsplash.com/photo-1622484211148-66f167ffc1ee?auto=format&fit=crop&w=900&q=80", category: "Protein bars", nutrition: { serving: "1 bar", calories: 200, protein: "20g", carbs: "22g", fat: "8g" }, base_price: 3.49, unit: "/60g bar" },
  { match: /clif/i, item_name: "CLIF Bar Energy Bar", brand: "CLIF", image_url: "https://images.unsplash.com/photo-1622484211148-66f167ffc1ee?auto=format&fit=crop&w=900&q=80", category: "Energy bars", nutrition: { serving: "1 bar", calories: 250, protein: "10g", carbs: "43g", fat: "5g" }, base_price: 2.49, unit: "/68g bar" },
  { match: /kind bar|kind/i, item_name: "KIND Bar", brand: "KIND", image_url: "https://images.unsplash.com/photo-1622484211148-66f167ffc1ee?auto=format&fit=crop&w=900&q=80", category: "Snack bars", nutrition: { serving: "1 bar", calories: 200, protein: "6g", carbs: "16g", fat: "15g" }, base_price: 2.29, unit: "/40g bar" },
  { match: /bread|loaf/i, item_name: "Dempster's Bread", brand: "Dempster's", image_url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80", category: "Bread and bakery", nutrition: { serving: "2 slices", calories: 170, protein: "6g", carbs: "32g", fat: "2g" }, base_price: 3.49, unit: "/loaf" },
  { match: /cauliflower/i, item_name: "Cauliflower", brand: "Fresh Produce", image_url: "https://images.unsplash.com/photo-1613743983303-b3e89f8a2b80?auto=format&fit=crop&w=900&q=80", category: "Produce", nutrition: { serving: "100g", calories: 25, protein: "2g", carbs: "5g", fat: "0.3g" }, base_price: 3.99, unit: "/head" },
  { match: /grape/i, item_name: "Red Seedless Grapes", brand: "Sun World", image_url: "https://images.unsplash.com/photo-1537640538966-79f369143f8f?auto=format&fit=crop&w=900&q=80", category: "Produce", nutrition: { serving: "100g", calories: 69, protein: "0.7g", carbs: "18g", fat: "0.2g" }, base_price: 2.49, unit: "/lb" },
  { match: /oreo/i, item_name: "Oreo Original Cookies", brand: "Oreo", image_url: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=900&q=80", category: "Cookies", nutrition: { serving: "3 cookies", calories: 160, protein: "1g", carbs: "25g", fat: "7g" }, base_price: 4.99, unit: "/432g" },
  { match: /celsius/i, item_name: "Celsius Energy Drink", brand: "Celsius", image_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=900&q=80", category: "Beverages", nutrition: { serving: "355ml", calories: 10, protein: "0g", carbs: "2g", fat: "0g" }, base_price: 2.99, unit: "/355ml" },
  { match: /red bull|redbull/i, item_name: "Red Bull Energy Drink", brand: "Red Bull", image_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=900&q=80", category: "Beverages", nutrition: { serving: "250ml", calories: 110, protein: "1g", carbs: "28g", fat: "0g" }, base_price: 3.29, unit: "/250ml" },
  { match: /^lays|lay's/i, item_name: "Lay's Classic Chips", brand: "Lay's", image_url: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=80", category: "Snacks", nutrition: { serving: "28g", calories: 160, protein: "2g", carbs: "15g", fat: "10g" }, base_price: 4.49, unit: "/235g" },
  { match: /gatorade/i, item_name: "Gatorade Thirst Quencher", brand: "Gatorade", image_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=900&q=80", category: "Beverages", nutrition: { serving: "591ml", calories: 140, protein: "0g", carbs: "36g", fat: "0g" }, base_price: 1.99, unit: "/591ml" },
  { match: /prime hydration|prime drink/i, item_name: "Prime Hydration Drink", brand: "Prime", image_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=900&q=80", category: "Beverages", nutrition: { serving: "500ml", calories: 25, protein: "2g", carbs: "5g", fat: "0g" }, base_price: 3.49, unit: "/500ml" },
  { match: /^eggs?$|dozen eggs|large eggs/i, item_name: "Large Eggs 12 Pack", brand: "Burnbrae Farms", image_url: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=900&q=80", category: "Dairy and eggs", nutrition: { serving: "1 large egg", calories: 70, protein: "6g", carbs: "0g", fat: "5g" }, base_price: 3.99, unit: "/dozen" },
  { match: /butter|margarine/i, item_name: "Lactantia Butter", brand: "Lactantia", image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80", category: "Dairy", nutrition: { serving: "1 tbsp", calories: 100, protein: "0g", carbs: "0g", fat: "11g" }, base_price: 5.99, unit: "/454g" },
  { match: /cheese|cheddar|mozzarella/i, item_name: "Cracker Barrel Cheddar Cheese", brand: "Cracker Barrel", image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80", category: "Dairy", nutrition: { serving: "30g", calories: 110, protein: "7g", carbs: "0g", fat: "9g" }, base_price: 7.49, unit: "/400g" },
  { match: /coffee|ground coffee|folgers/i, item_name: "Folgers Classic Roast Coffee", brand: "Folgers", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Beverages", nutrition: { serving: "1 cup", calories: 2, protein: "0g", carbs: "0g", fat: "0g" }, base_price: 9.99, unit: "/920g" },
  { match: /sugar|white sugar/i, item_name: "Redpath White Sugar", brand: "Redpath", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Pantry", nutrition: { serving: "1 tsp", calories: 15, protein: "0g", carbs: "4g", fat: "0g" }, base_price: 4.49, unit: "/2kg" },
  { match: /flour|all purpose/i, item_name: "Robin Hood All Purpose Flour", brand: "Robin Hood", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Pantry", nutrition: { serving: "30g", calories: 110, protein: "3g", carbs: "23g", fat: "0g" }, base_price: 5.99, unit: "/5kg" },
  { match: /cereal|corn flakes|kellogg/i, item_name: "Kellogg Corn Flakes", brand: "Kellogg", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Breakfast", nutrition: { serving: "30g", calories: 110, protein: "2g", carbs: "25g", fat: "0g" }, base_price: 4.99, unit: "/675g" },
  { match: /oat|oatmeal|quaker/i, item_name: "Quaker Large Flake Oats", brand: "Quaker", image_url: "https://images.unsplash.com/photo-1614961233913-a5113a4a34ed?auto=format&fit=crop&w=900&q=80", category: "Pantry", nutrition: { serving: "40g", calories: 150, protein: "5g", carbs: "27g", fat: "3g" }, base_price: 5.49, unit: "/1kg" },
  { match: /peanut butter/i, item_name: "Kraft Peanut Butter", brand: "Kraft", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Pantry", nutrition: { serving: "2 tbsp", calories: 190, protein: "7g", carbs: "7g", fat: "16g" }, base_price: 6.99, unit: "/1kg" },
  { match: /orange juice|tropicana/i, item_name: "Tropicana Orange Juice", brand: "Tropicana", image_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=900&q=80", category: "Beverages", nutrition: { serving: "250ml", calories: 110, protein: "2g", carbs: "26g", fat: "0g" }, base_price: 5.49, unit: "/1.75L" },
  { match: /almond milk|oat milk|silk/i, item_name: "Silk Oat Milk", brand: "Silk", image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80", category: "Dairy alternative", nutrition: { serving: "250ml", calories: 90, protein: "2g", carbs: "16g", fat: "2.5g" }, base_price: 4.99, unit: "/1.75L" },
  { match: /ketchup|heinz/i, item_name: "Heinz Ketchup", brand: "Heinz", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Condiments", nutrition: { serving: "1 tbsp", calories: 20, protein: "0g", carbs: "5g", fat: "0g" }, base_price: 4.49, unit: "/1L" },
  { match: /pasta|spaghetti|barilla/i, item_name: "Barilla Spaghetti", brand: "Barilla", image_url: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80", category: "Pantry", nutrition: { serving: "85g", calories: 300, protein: "11g", carbs: "61g", fat: "1.5g" }, base_price: 2.49, unit: "/450g" },
  { match: /tuna|clover leaf/i, item_name: "Clover Leaf Flaked White Tuna", brand: "Clover Leaf", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Pantry", nutrition: { serving: "85g", calories: 100, protein: "22g", carbs: "0g", fat: "0.5g" }, base_price: 2.29, unit: "/170g" },
  { match: /yogurt|yoghurt/i, item_name: "Greek Yogurt", brand: "Astro Original", image_url: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&q=80", category: "Dairy", nutrition: { serving: "175g", calories: 130, protein: "8g", carbs: "15g", fat: "3g" }, base_price: 4.79, unit: "/750g" }
];

export async function discoverDealsForItems({ wantedItems, postalCode = "L6H", onProgress } = {}) {
  const identityCache = await readJsonFile(identityCachePath, {});
  const priceCache = await readJsonFile(priceCachePath, {});
  const allDeals = [];
  for (const rawItem of wantedItems) {
    const item = rawItem.trim();
    if (!item) continue;
    onProgress?.({ step: "identity", message: `Checking Global Brand Database for ${item}` });
    const identityKey = normalizeCacheKey(item, "identity");
    const priceKey = normalizeCacheKey(item, postalCode);
    const fuzzy = fuzzyIdentity(item);
    const canonicalPriceKey = normalizeCacheKey(fuzzy.canonical || fuzzy.item_name || item, postalCode);
    const cached = priceCache[priceKey] || priceCache[canonicalPriceKey];
    if (cached && Date.now() - cached.cached_at < CACHE_TTL_MS) {
      await logRouterPhase("cache_hit", item, { cache: "price" });
      onProgress?.({ step: "cache", message: `Using cached price data for ${item}` });
      allDeals.push(...cached.deals.map((deal) => ({ ...deal, wanted_item: item, cache_status: "hit", confidence: "Cached today" })));
      continue;
    }

    const result = await discoverOneItem(item, postalCode, {
      cachedIdentity: identityCache[identityKey],
      onProgress
    });
    const identity = result[0] ? dealToIdentity(result[0]) : null;
    if (identity) identityCache[identityKey] = { cached_at: Date.now(), identity };
    priceCache[priceKey] = { cached_at: Date.now(), deals: result };
    if (identity?.item_name) {
      priceCache[normalizeCacheKey(identity.item_name, postalCode)] = { cached_at: Date.now(), deals: result };
    }
    allDeals.push(...result);
  }
  await writeJsonFile(identityCachePath, identityCache);
  await writeJsonFile(priceCachePath, priceCache);
  return allDeals;
}

async function discoverOneItem(input, postalCode, { cachedIdentity, onProgress } = {}) {
  const liveScrape = process.env.SCRAPER_MODE === "live";
  const routed = cachedIdentity && Date.now() - cachedIdentity.cached_at < CACHE_TTL_MS
    ? { identity: { ...cachedIdentity.identity, lookup_phase: `${cachedIdentity.identity.lookup_phase}+identity_cache` }, priceResults: [] }
    : await globalSearchRouter(input, postalCode, onProgress);
  if (routed.priceResults.length) return routed.priceResults;

  onProgress?.({ step: "variations", message: `Finding product variations for ${routed.identity.item_name}` });
  const variations = await findProductVariations(input, routed.identity).catch((error) => logAndEmpty("variation_error", input, error));
  onProgress?.({ step: "instacart", message: `Checking Instacart aggregation layer for ${routed.identity.item_name}` });
  const fallbackProducts = liveScrape ? await withTimeout(fallbackAggregatorSearch(routed.identity.item_name), 9000).catch(() => []) : [];
  onProgress?.({ step: "stockists", message: `Checking local Oakville stockists for ${routed.identity.item_name}` });
  const identified = {
    ...(fallbackProducts[0] || routed.identity || fallbackProfile(input)),
    variation_options: variations.length ? variations : variationOptionsFor(routed.identity || fallbackProfile(input))
  };
  const storeDeals = liveScrape ? await withTimeout(scrapeStorePrices(identified, postalCode), 12000).catch(() => []) : [];
  onProgress?.({ step: "normalize", message: `Comparing prices for ${identified.item_name}` });
  return storeDeals.length ? storeDeals : synthesizeStoreDeals(identified, postalCode);
}

async function globalSearchRouter(input, postalCode, onProgress) {
  const fuzzy = fuzzyIdentity(input);
  await logRouterPhase("fuzzy_match", input, { canonical: fuzzy.item_name, score: fuzzy.confidence_score });
  const [openFoodFacts, upcItemDb] = await Promise.all([
    lookupOpenFoodFacts(fuzzy.canonical).catch((error) => logAndNull("open_food_facts_error", input, error)),
    lookupUpcItemDb(fuzzy.canonical).catch((error) => logAndNull("upcitemdb_error", input, error))
  ]);
  onProgress?.({ step: "identity", message: `Resolved identity for ${fuzzy.canonical}` });
  const identity = mergeIdentities(fuzzy, openFoodFacts, upcItemDb, input);
  const shoppingResults = await searchGoogleShopping(identity, postalCode).catch((error) => logAndEmpty("serpapi_error", input, error));
  if (shoppingResults.length) await logRouterPhase("serpapi_results", input, { count: shoppingResults.length });
  return {
    identity,
    priceResults: shoppingResults.map((result) => shoppingResultToDeal(result, identity, postalCode))
  };
}

async function lookupOpenFoodFacts(input) {
  const fields = "code,product_name,brands,image_url,quantity,nutriments,categories";
  const isBarcode = /^\d{8,14}$/.test(input.trim());
  const data = isBarcode
    ? await httpGet(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(input.trim())}.json`, { fields })
    : await httpGet("https://world.openfoodfacts.org/api/v2/search", {
      search_terms: input,
      fields,
      page_size: 8
    });

  const product = isBarcode ? data.product : chooseBestProductRecord(data.products || [], input, mapOpenFoodFactsScoreFields);
  if (!product?.product_name || !product?.brands) return null;
  if (!isBarcode && !isRelevantProduct(product, input)) return null;
  return mapOpenFoodFactsProduct(product, input);
}

async function lookupOpenFoodFactsProducts(input, pageSize = 8) {
  const fields = "code,product_name,brands,image_url,quantity,nutriments,categories";
  const data = await httpGet("https://world.openfoodfacts.org/api/v2/search", {
    search_terms: input,
    fields,
    page_size: pageSize
  });
  return (data.products || [])
    .filter((product) => product?.product_name && product?.brands && isRelevantProduct(product, input))
    .map((product) => mapOpenFoodFactsProduct(product, input));
}

function mapOpenFoodFactsProduct(product, input) {
  return {
    lookup_phase: "open_food_facts",
    input,
    barcode: product.code,
    item_name: product.product_name,
    brand: firstBrand(product.brands),
    image_url: product.image_url || fallbackProfile(input).image_url,
    quantity: product.quantity,
    category: product.categories?.split(",")[0]?.trim() || "Grocery",
    nutrition: nutritionFromNutriments(product.nutriments),
    base_price: fallbackProfile(input).base_price,
    unit: unitFromQuantity(product.quantity) || fallbackProfile(input).unit
  };
}

async function lookupUpcItemDb(input) {
  const data = await httpGet("https://api.upcitemdb.com/prod/trial/search", { s: input, match_mode: 0 }, upcHeaders());
  const item = chooseBestProductRecord(data.items || [], input, mapUpcScoreFields);
  if (!item?.title) return null;
  if (!isRelevantProduct({ product_name: item.title, brands: item.brand || "" }, input)) return null;
  return {
    lookup_phase: "upcitemdb",
    input,
    barcode: item.ean || item.upc,
    item_name: item.title,
    brand: item.brand || firstBrand(item.title),
    image_url: item.images?.[0] || fallbackProfile(input).image_url,
    category: item.category || "Grocery",
    nutrition: fallbackProfile(input).nutrition,
    base_price: fallbackProfile(input).base_price,
    unit: fallbackProfile(input).unit,
    retailers: item.offers?.map((offer) => offer.merchant).filter(Boolean) || []
  };
}

async function lookupUpcItemDbProducts(input, pageSize = 8) {
  const data = await httpGet("https://api.upcitemdb.com/prod/trial/search", { s: input, match_mode: 0 }, upcHeaders());
  return (data.items || [])
    .map((item) => ({ item, score: scoreProductCandidate(mapUpcScoreFields(item), input) }))
    .filter((candidate) => candidate.score >= minimumCandidateScore(input))
    .sort((a, b) => b.score - a.score)
    .slice(0, pageSize)
    .map(({ item }) => ({
      lookup_phase: "upcitemdb",
      input,
      barcode: item.ean || item.upc,
      item_name: item.title,
      brand: item.brand || firstBrand(item.title),
      image_url: item.images?.[0] || fallbackProfile(input).image_url,
      category: item.category || "Grocery",
      nutrition: fallbackProfile(input).nutrition,
      base_price: fallbackProfile(input).base_price,
      unit: fallbackProfile(input).unit,
      retailers: item.offers?.map((offer) => offer.merchant).filter(Boolean) || []
    }));
}

async function findProductVariations(input, identity) {
  const query = identity?.item_name || input;
  const [openFoodFacts, upcItemDb] = await Promise.all([
    lookupOpenFoodFactsProducts(query, 10).catch(() => []),
    lookupUpcItemDbProducts(query, 10).catch(() => [])
  ]);
  const safeOpenFoodFacts = openFoodFacts.filter((product) => isSafeExternalIdentity(product, identity, input));
  const safeUpcItemDb = upcItemDb.filter((product) => isSafeExternalIdentity(product, identity, input));
  return dedupeVariations([
    identity,
    ...safeOpenFoodFacts,
    ...safeUpcItemDb,
    ...variationOptionsFor(identity || fallbackProfile(input)).map((name) => ({
      item_name: brandVariantName(identity, name),
      brand: identity?.brand || fallbackProfile(input).brand,
      image_url: identity?.image_url || fallbackProfile(input).image_url,
      category: identity?.category || "Grocery",
      unit: identity?.unit || fallbackProfile(input).unit,
      lookup_phase: "fuzzy_variation"
    }))
  ]);
}

async function searchGoogleShopping(identity, postalCode) {
  if (!process.env.SERPAPI_KEY) return [];
  const data = await httpGet("https://serpapi.com/search.json", {
    engine: "google_shopping",
    q: `site:*.ca "${identity.item_name}" price Oakville`,
    location: "Oakville, Ontario, Canada",
    google_domain: "google.ca",
    gl: "ca",
    hl: "en",
    api_key: process.env.SERPAPI_KEY
  });
  return (data.shopping_results || [])
    .map((result) => ({
      item_name: result.title,
      store: result.source || result.seller || "Google Shopping",
      price: parsePrice(result.extracted_price ?? result.price),
      unit: inferUnitFromText(`${result.title} ${result.snippet || ""}`),
      image_url: result.thumbnail,
      product_url: result.link || result.product_link
    }))
    .filter((result) => Number.isFinite(result.price))
    .slice(0, 8);
}

function shoppingResultToDeal(result, identity, postalCode) {
  const storeConfig = {
    store: result.store,
    store_url: result.product_url,
    flyer_url: result.product_url,
    searchUrl: () => result.product_url
  };
  return toDeal({
    ...identity,
    item_name: result.item_name || identity.item_name,
    price: result.price,
    unit: result.unit || identity.unit,
    image_url: result.image_url || identity.image_url,
    product_url: result.product_url
  }, storeConfig, postalCode, "google_shopping");
}

async function fallbackAggregatorSearch(input) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const config of aggregatorConfigs) {
      const page = await browser.newPage();
      try {
        await page.goto(config.searchUrl(input), { waitUntil: "domcontentloaded", timeout: AGGREGATOR_TIMEOUT_MS });
        await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
        const products = await extractProductsFromPage(page, config.name, input);
        if (products.length) return products.slice(0, 3);
      } catch {
        continue;
      } finally {
        await page.close().catch(() => {});
      }
    }
    return [];
  } finally {
    await browser.close();
  }
}

async function scrapeStorePrices(product, postalCode) {
  const results = [];
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const config of storeConfigs) {
      const page = await browser.newPage();
      try {
        const searchUrl = config.searchUrl(product.item_name);
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: STORE_TIMEOUT_MS });
        await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
        const scraped = await extractProductsFromPage(page, config.store, product.item_name);
        const best = scraped[0];
        if (!best) throw new Error("No product cards found");
        results.push(toDeal({
          ...product,
          ...best,
          item_name: best.item_name || product.item_name,
          brand: product.brand,
          image_url: best.image_url || product.image_url,
          product_url: best.product_url || searchUrl
        }, config, postalCode, "store_scrape"));
      } catch {
        const synthetic = synthesizeStoreDeals(product, postalCode, [config])[0];
        results.push({ ...synthetic, source: "store_fallback" });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function extractProductsFromPage(page, sourceName, input) {
  return page.evaluate(({ sourceName, input }) => {
    const pricePattern = /\$ ?\d+(?:[.,]\d{2})?/;
    const cards = Array.from(document.querySelectorAll("article, [data-testid], [class*='product'], [class*='Product'], [class*='card'], [class*='Card']"));
    return cards.map((card) => {
      const text = card.textContent?.replace(/\s+/g, " ").trim() || "";
      const priceMatch = text.match(pricePattern);
      const image = card.querySelector("img");
      const anchor = card.querySelector("a[href]");
      const title = image?.alt || anchor?.textContent?.replace(/\s+/g, " ").trim() || text.replace(pricePattern, "").slice(0, 90).trim();
      if (!priceMatch || !title || !title.toLowerCase().includes(input.split(/\s+/)[0].toLowerCase())) return null;
      return {
        sourceName,
        item_name: title,
        price: Number(priceMatch[0].replace(/[$ ]/g, "").replace(",", ".")),
        unit: inferUnitFromText(text),
        image_url: image?.src || "",
        product_url: anchor?.href || location.href
      };
    }).filter(Boolean).slice(0, 3);

    function inferUnitFromText(text) {
      const unit = text.match(/\/\s?(?:100g|100ml|lb|kg|g|ml|l|ea|each|dozen|pack|bag|loaf|head)/i)?.[0];
      return unit ? unit.replace(/\s+/g, "") : "/ea";
    }
  }, { sourceName, input });
}

function synthesizeStoreDeals(product, postalCode, configs = storeConfigs) {
  const factors = {
    "No Frills": 0.94,
    Metro: 1.08,
    Sobeys: 1.06,
    FreshCo: 0.93,
    "Food Basics": 0.95,
    Walmart: 0.97,
    "Real Canadian Superstore": 0.96
  };
  const historical = historicalPriceFor(product);
  return configs.map((config) => toDeal({
    ...product,
    price: roundMoney((historical.base_price || product.base_price || 4.49) * (factors[config.store] || 1)),
    unit: historical.unit || product.unit || "/ea",
    product_url: config.searchUrl(product.item_name)
  }, config, postalCode, "estimated_store_price"));
}

function toDeal(product, storeConfig, postalCode, source) {
  const normalized = normalizePrice(product.price, product.unit || product.quantity);
  const checkedAt = new Date().toISOString();
  const exactBarcodeMatch = Boolean(product.barcode && /^\d{8,14}$/.test(String(product.input || "")));
  return {
    item_name: product.item_name,
    wanted_item: product.input || product.wanted_item || product.item_name,
    brand: product.brand || "Brand varies",
    store: storeConfig.store,
    price: roundMoney(product.price),
    unit: product.unit || "/ea",
    unit_price: normalized.unit_price,
    normalized_price: normalized.normalized_price,
    normalized_unit: normalized.normalized_unit,
    image_url: product.image_url,
    category: product.category || "Grocery",
    nutrition: product.nutrition,
    product_summary: product.product_summary || `${product.item_name} identified through ${product.lookup_phase || source}.`,
    product_url: product.product_url || buildExactStoreUrl(storeConfig.store, product.item_name, product.brand, product.input || product.wanted_item),
    store_url: storeConfig.store_url,
    flyer_url: storeConfig.flyer_url,
    postal_code: postalCode,
    source,
    lookup_phase: product.lookup_phase || "fallback",
    confidence: confidenceFor(source, product, exactBarcodeMatch),
    confidence_score: confidenceScoreFor(source, product, exactBarcodeMatch),
    trust_score: trustScoreFor(source, product, exactBarcodeMatch),
    niche_brand: isNicheBrand(product.brand),
    last_checked: checkedAt,
    exact_barcode_match: exactBarcodeMatch,
    warning: warningFor(source),
    variants: variantsFor(product),
    variation_options: product.variation_options || variationOptionsFor(product),
    alternatives: alternativesFor(product)
  };
}

export async function universalProductSearch({ query, postalCode = "L6H" }) {
  const deals = await discoverOneItem(query, postalCode);
  const sorted = [...deals].sort((a, b) => a.normalized_price - b.normalized_price);
  const best = sorted[0];
  const variations = dedupeVariations(sorted.flatMap((deal) => [
    deal,
    ...(deal.variation_options || []).map((variation) => ({
      ...deal,
      item_name: typeof variation === "string" ? brandVariantName(deal, variation) : variation.full_name || variation.item_name,
      brand: typeof variation === "string" ? deal.brand : variation.brand || deal.brand,
      image_url: typeof variation === "string" ? deal.image_url : variation.image_url || deal.image_url
    }))
  ]));
  return {
    Brand: best?.brand || "Brand varies",
    Full_Product_Name: best?.item_name || displayCase(query),
    Lowest_Price: best?.price ?? null,
    Store_Name: best?.store || null,
    Last_Updated: new Date().toISOString(),
    variations: variations.map((variation) => ({
      brand: variation.brand || "Brand varies",
      full_name: variation.item_name || variation.full_name,
      price: variation.price ?? null,
      store_name: variation.store || null,
      trust_score: variation.trust_score ?? trustScoreFor(variation.source, variation, variation.exact_barcode_match),
      image_url: variation.image_url,
      niche_brand: isNicheBrand(variation.brand)
    })),
    results: sorted.map((deal) => ({
      Brand: deal.brand,
      Full_Product_Name: deal.item_name,
      Lowest_Price: deal.price,
      Store_Name: deal.store,
      Last_Updated: new Date().toISOString(),
      item_name: deal.item_name,
      brand: deal.brand,
      store: deal.store,
      price: deal.price,
      unit_price: deal.unit_price,
      image_url: deal.image_url,
      trust_score: deal.trust_score,
      niche_brand: deal.niche_brand
    }))
  };
}

export function normalizePrice(price, unit = "/ea") {
  const unitText = String(unit || "/ea").toLowerCase().replace(/\s+/g, "");
  const numericPrice = Number(price);
  const grams = unitText.match(/(\d+(?:\.\d+)?)g/);
  const kilograms = unitText.match(/(\d+(?:\.\d+)?)kg/);
  const millilitres = unitText.match(/(\d+(?:\.\d+)?)ml/);
  const litres = unitText.match(/(\d+(?:\.\d+)?)l/);

  if (unitText.includes("100g")) return unitResult(numericPrice, "/100g");
  if (unitText.includes("/lb")) return unitResult(numericPrice / (GRAMS_PER_LB / 100), "/100g");
  if (kilograms) return unitResult(numericPrice / (Number(kilograms[1]) * 10), "/100g");
  if (grams) return unitResult(numericPrice / (Number(grams[1]) / 100), "/100g");
  if (unitText.includes("100ml")) return unitResult(numericPrice, "/100ml");
  if (litres) return unitResult(numericPrice / (Number(litres[1]) * 10), "/100ml");
  if (millilitres) return unitResult(numericPrice / (Number(millilitres[1]) / 100), "/100ml");
  return unitResult(numericPrice, unitText || "/ea");
}

function unitResult(value, unit) {
  const normalized = roundMoney(value);
  return {
    normalized_price: normalized,
    normalized_unit: unit,
    unit_price: `$${normalized.toFixed(2)}${unit}`
  };
}

async function httpGet(url, params = {}, extraHeaders = {}) {
  try {
    const { default: axios } = await import("axios");
    const response = await axios.get(url, {
      params,
      timeout: 5000,
      headers: { "user-agent": "Flyer-to-Bento-Agent/1.0", ...extraHeaders },
      validateStatus: (status) => status < 500 || status === 429
    });
    if (response.status === 429) throw new RateLimitError("Rate limited", response.headers?.["retry-after"]);
    if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
    return response.data;
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    if (error?.response || error?.code === "ERR_MODULE_NOT_FOUND") {
      const target = new URL(url);
      Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(target, {
        signal: controller.signal,
        headers: { "user-agent": "Flyer-to-Bento-Agent/1.0", ...extraHeaders }
      }).finally(() => clearTimeout(timeout));
      if (response.status === 429) throw new RateLimitError("Rate limited", response.headers.get("retry-after"));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }
    throw error;
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return import("/Users/saarahraza/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs");
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function fallbackProfile(input) {
  if (/sidi ali/i.test(input)) return { input, lookup_phase: "generic_fallback", item_name: displayCase(input), brand: "Brand varies", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80", category: "Grocery", nutrition: { serving: "varies", calories: "Check label", protein: "Check label", carbs: "Check label", fat: "Check label" }, base_price: 4.49, unit: "/ea" };
  const profile = fallbackProfiles.find((item) => item.match.test(input));
  if (profile) return { ...profile, input, lookup_phase: "local_profile" };
  const guessed = guessProductCategory(input);
  return {
    input,
    lookup_phase: "generic_fallback",
    item_name: displayCase(input),
    brand: displayCase(input.split(" ")[0]),
    image_url: guessed.image_url,
    category: guessed.category,
    nutrition: { serving: "varies", calories: "Check label", protein: "Check label", carbs: "Check label", fat: "Check label" },
    base_price: guessed.base_price,
    unit: guessed.unit
  };
}

function firstBrand(brands = "") {
  return brands.split(",")[0]?.trim() || "Brand varies";
}

function nutritionFromNutriments(nutriments = {}) {
  return {
    serving: "100g",
    calories: nutriments["energy-kcal_100g"] ?? "Check label",
    protein: nutriments.proteins_100g !== undefined ? `${nutriments.proteins_100g}g` : "Check label",
    carbs: nutriments.carbohydrates_100g !== undefined ? `${nutriments.carbohydrates_100g}g` : "Check label",
    fat: nutriments.fat_100g !== undefined ? `${nutriments.fat_100g}g` : "Check label"
  };
}

function unitFromQuantity(quantity = "") {
  const compact = String(quantity).toLowerCase().replace(/\s+/g, "");
  const match = compact.match(/\d+(?:\.\d+)?\s?(?:g|kg|ml|l)/i);
  return match ? `/${match[0]}` : "";
}

function normalizeCacheKey(item, postalCode) {
  return `v6:${postalCode}:${item}`.toLowerCase().replace(/\s+/g, " ").trim();
}

function isRelevantProduct(product, input) {
  return scoreProductCandidate({
    title: product.product_name || product.title || "",
    brand: product.brands || product.brand || "",
    category: product.categories || product.category || ""
  }, input) >= minimumCandidateScore(input);
}



function buildExactStoreUrl(store, itemName, brand, userInput) {
  const full = encodeURIComponent(itemName || userInput || "");
  const generic = encodeURIComponent(userInput || itemName || "");
  if (store === "No Frills") return `https://www.nofrills.ca/en/search?search-bar=${full}`;
  if (store === "Metro") return `https://www.metro.ca/en/online-grocery/search?filter=${full}`;
  if (store === "Food Basics") return `https://www.foodbasics.ca/search-page.en.html?search=${full}`;
  if (store === "Walmart") return `https://www.walmart.ca/search?q=${full}&sort=price_asc`;
  if (store === "Sobeys" || store === "FreshCo") return `https://voila.ca/search?q=${full}&sort=price`;
  if (store === "Real Canadian Superstore") return `https://www.realcanadiansuperstore.ca/search?search-bar=${full}`;
  return `https://flipp.com/search/${generic}`;
}

function guessProductCategory(input) {
  const t = input.toLowerCase();
  if (/drink|juice|water|soda|pop|beverage|energy|tea|coffee/.test(t)) return { category: "Beverages", base_price: 2.49, unit: "/ea", image_url: "https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=900&q=80" };
  if (/chip|crisp|snack|puff|cracker|pretzel|popcorn/.test(t)) return { category: "Snacks", base_price: 4.29, unit: "/bag", image_url: "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=900&q=80" };
  if (/bar|protein|granola/.test(t)) return { category: "Bars", base_price: 2.99, unit: "/bar", image_url: "https://images.unsplash.com/photo-1622484211148-66f167ffc1ee?auto=format&fit=crop&w=900&q=80" };
  if (/chocolate|candy|gummy|sweet/.test(t)) return { category: "Candy", base_price: 3.49, unit: "/ea", image_url: "https://images.unsplash.com/photo-1548907040-4d42e11f9658?auto=format&fit=crop&w=900&q=80" };
  if (/cookie|biscuit|wafer/.test(t)) return { category: "Cookies", base_price: 4.49, unit: "/ea", image_url: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=900&q=80" };
  if (/egg/.test(t)) return { category: "Dairy and eggs", base_price: 3.99, unit: "/dozen", image_url: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=900&q=80" };
  if (/milk|cream|cheese|butter|dairy|yogurt/.test(t)) return { category: "Dairy", base_price: 5.49, unit: "/ea", image_url: "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80" };
  if (/chicken|beef|pork|meat|turkey|salmon|fish/.test(t)) return { category: "Meat", base_price: 8.99, unit: "/ea", image_url: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=900&q=80" };
  if (/bread|loaf|bagel|muffin|bun/.test(t)) return { category: "Bakery", base_price: 3.99, unit: "/ea", image_url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80" };
  if (/rice|pasta|noodle|grain|cereal|oat/.test(t)) return { category: "Pantry", base_price: 4.99, unit: "/ea", image_url: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80" };
  if (/sauce|ketchup|mustard|mayo|dressing/.test(t)) return { category: "Condiments", base_price: 3.99, unit: "/ea", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80" };
  if (/apple|banana|orange|grape|berry|fruit|vegetable|tomato|pepper/.test(t)) return { category: "Produce", base_price: 2.99, unit: "/ea", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80" };
  if (/shampoo|conditioner|soap|deodorant|toothpaste/.test(t)) return { category: "Personal Care", base_price: 5.99, unit: "/ea", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80" };
  if (/detergent|cleaner|dish|laundry|tide|lysol/.test(t)) return { category: "Household", base_price: 7.99, unit: "/ea", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80" };
  return { category: "Grocery", base_price: 4.49, unit: "/ea", image_url: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80" };
}

function displayCase(value) {
  return String(value || "")
    .split(/\s+/)
    .map((word) => word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : "")
    .join(" ");
}

function fuzzyIdentity(input) {
  const normalized = normalizeText(input);
  const best = fuzzyCatalog
    .map((entry) => ({
      ...entry,
      score: Math.max(...entry.terms.map((term) => similarity(normalized, normalizeText(term))))
    }))
    .sort((a, b) => b.score - a.score)[0];
  if (best?.score >= 0.74 || best?.terms.some((term) => normalized.includes(normalizeText(term)))) {
    const fallback = fallbackProfile(best.canonical);
    return {
      ...fallback,
      lookup_phase: "fuzzy_match",
      input,
      item_name: best.canonical,
      canonical: best.canonical,
      brand: best.brand,
      confidence_score: roundMoney(best.score)
    };
  }
  const guessed = guessProductCategory(input);
  const cleanName = displayCase(input);
  return {
    ...fallbackProfile(input),
    canonical: input,
    input,
    item_name: cleanName,
    brand: cleanName.split(" ")[0] || "Store Brand",
    category: guessed.category,
    base_price: guessed.base_price,
    unit: guessed.unit,
    image_url: guessed.image_url,
    product_summary: cleanName + " — price comparison across Oakville stores.",
    lookup_phase: "fuzzy_input"
  };
}

function mergeIdentities(fuzzy, openFoodFacts, upcItemDb, input) {
  const safeOpenFoodFacts = isSafeExternalIdentity(openFoodFacts, fuzzy, input) ? openFoodFacts : null;
  const safeUpcItemDb = isSafeExternalIdentity(upcItemDb, fuzzy, input) ? upcItemDb : null;
  const winner = safeUpcItemDb || safeOpenFoodFacts || fuzzy || fallbackProfile(input);
  const fallback = fallbackProfile(winner.item_name || input);
  return {
    ...fallback,
    ...fuzzy,
    ...safeOpenFoodFacts,
    ...safeUpcItemDb,
    item_name: safeUpcItemDb?.item_name || safeOpenFoodFacts?.item_name || fuzzy?.item_name || fallback.item_name,
    brand: safeUpcItemDb?.brand || safeOpenFoodFacts?.brand || fuzzy?.brand || fallback.brand,
    image_url: safeUpcItemDb?.image_url || safeOpenFoodFacts?.image_url || fuzzy?.image_url || fallback.image_url,
    nutrition: safeOpenFoodFacts?.nutrition || safeUpcItemDb?.nutrition || fuzzy?.nutrition || fallback.nutrition,
    lookup_phase: [fuzzy?.lookup_phase, safeOpenFoodFacts?.lookup_phase, safeUpcItemDb?.lookup_phase].filter(Boolean).join("+") || "fallback"
  };
}

function isSafeExternalIdentity(identity, fuzzy, input) {
  if (!identity) return false;
  if (/sidi ali/i.test(identity.item_name || "") || /sidi ali/i.test(identity.brand || "")) return false;
  const score = scoreProductCandidate({
    title: identity.item_name || "",
    brand: identity.brand || "",
    category: identity.category || ""
  }, fuzzy?.canonical || input);
  if (score < minimumCandidateScore(fuzzy?.canonical || input)) return false;
  const text = normalizeText(`${identity.item_name || ""} ${identity.brand || ""} ${identity.category || ""}`);
  const query = normalizeText(`${fuzzy?.canonical || ""} ${input || ""}`);
  if (/bar|protein|energy/.test(query) && /water|beverage|drink|soda|juice/.test(text) && !/bar|protein|energy|granola|snack/.test(text)) {
    return false;
  }
  return true;
}

function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[a.length][b.length];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePrice(value) {
  if (typeof value === "number") return value;
  const match = String(value || "").match(/\d+(?:[.,]\d{2})?/);
  return match ? Number(match[0].replace(",", ".")) : NaN;
}

function chooseBestProductRecord(records, input, mapper) {
  return records
    .map((record) => ({ record, score: scoreProductCandidate(mapper(record), input) }))
    .filter((candidate) => candidate.score >= minimumCandidateScore(input))
    .sort((a, b) => b.score - a.score)[0]?.record || null;
}

function mapOpenFoodFactsScoreFields(product) {
  return {
    title: product.product_name || "",
    brand: product.brands || "",
    category: product.categories || ""
  };
}

function mapUpcScoreFields(item) {
  return {
    title: item.title || "",
    brand: item.brand || "",
    category: item.category || ""
  };
}

export function scoreProductCandidate(candidate, input) {
  const query = normalizeText(input);
  const haystack = normalizeText(`${candidate.title || ""} ${candidate.brand || ""} ${candidate.category || ""}`);
  const title = normalizeText(candidate.title || "");
  const queryTerms = query.split(" ").filter((term) => term.length > 2);
  let score = 0;

  for (const term of queryTerms) {
    if (haystack.includes(term)) score += 3;
  }
  if (title.includes(query)) score += 4;
  if (candidate.brand && query.includes(normalizeText(candidate.brand))) score += 4;

  const intent = intentRuleFor(query);
  if (intent) {
    for (const term of intent.positive) {
      if (haystack.includes(term)) score += 3;
    }
    for (const term of intent.negative) {
      if (haystack.includes(term)) score -= 8;
    }
  }

  return score;
}

function intentRuleFor(query) {
  if (query === "bar" || query === "protein bar" || query === "energy bar") {
    return {
      positive: ["bar", "protein", "energy", "snack", "granola"],
      negative: ["water", "beverage", "drink", "soda", "juice"]
    };
  }
  if (/cheeto|dorito|taki/.test(query) && !/mac|macaroni|pasta/.test(query)) {
    return {
      positive: ["chip", "chips", "snack", "snacks", "crunchy", "puff", "puffs", "flamin", "cheese snack"],
      negative: ["mac", "macaroni", "pasta", "dinner", "cheese sauce"]
    };
  }
  if (/mac|macaroni|pasta/.test(query)) {
    return {
      positive: ["mac", "macaroni", "pasta", "dinner"],
      negative: ["chip", "chips", "puff", "puffs"]
    };
  }
  if (/quest|clif|kind/.test(query) && /bar|protein|energy|snack/.test(query)) {
    return {
      positive: ["bar", "protein", "energy", "snack"],
      negative: ["drink", "powder", "cookie", "cereal"]
    };
  }
  return null;
}

function minimumCandidateScore(input) {
  const normalized = normalizeText(input);
  const terms = normalized.split(" ").filter((term) => term.length > 2);
  if (terms.length <= 1) return 5;
  return 4;
}

function inferUnitFromText(text) {
  const unit = String(text || "").match(/\/\s?(?:100g|100ml|lb|kg|g|ml|l|ea|each|dozen|pack|bag|loaf|head)/i)?.[0];
  return unit ? unit.replace(/\s+/g, "") : "/ea";
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function upcHeaders() {
  const key = process.env.UPCITEMDB_API_KEY || process.env.UPCITEMDB_KEY;
  return key ? { user_key: key } : {};
}

function historicalPriceFor(product) {
  const key = normalizeText(product.item_name);
  return historicalPrices[key] || Object.entries(historicalPrices).find(([name]) => key.includes(name) || name.includes(key))?.[1] || {};
}

function dealToIdentity(deal) {
  return {
    item_name: deal.item_name,
    brand: deal.brand,
    image_url: deal.image_url,
    category: deal.category,
    nutrition: deal.nutrition,
    base_price: deal.price,
    unit: deal.unit,
    lookup_phase: deal.lookup_phase,
    barcode: deal.barcode,
    variation_options: deal.variation_options
  };
}

function confidenceScoreFor(source, product, exactBarcodeMatch = false) {
  if (exactBarcodeMatch) return 1;
  if (source === "google_shopping") return 0.95;
  if (source === "estimated_store_price") return 0.55;
  if (source === "store_fallback") return 0.45;
  if (product?.lookup_phase?.includes("upcitemdb")) return 0.9;
  if (product?.lookup_phase?.includes("open_food_facts")) return 0.82;
  if (product?.lookup_phase?.includes("fuzzy")) return product.confidence_score || 0.72;
  return 0.5;
}

function trustScoreFor(source, product = {}, exactBarcodeMatch = false) {
  if (exactBarcodeMatch) return 100;
  if (source === "google_shopping") return 92;
  if (source === "store_scrape") return 86;
  if (product.cache_status === "hit") return 78;
  if (source === "estimated_store_price") return 55;
  if (source === "store_fallback") return 45;
  return Math.round((product.confidence_score || confidenceScoreFor(source, product, exactBarcodeMatch)) * 100);
}

function isNicheBrand(brand = "") {
  const normalized = normalizeText(brand);
  if (!normalized || normalized === "brand varies" || normalized === "fresh produce") return false;
  const householdBrands = new Set([
    "doritos",
    "cheetos",
    "monster energy",
    "oreo",
    "fairlife",
    "takis",
    "dempsters",
    "quest",
    "clif",
    "kind",
    "coca cola",
    "pepsi",
    "lays",
    "frito lay"
  ]);
  return !householdBrands.has(normalized);
}

async function logRouterPhase(phase, input, detail = {}) {
  const entry = JSON.stringify({ at: new Date().toISOString(), phase, input, detail });
  await fs.mkdir(path.dirname(routerLogPath), { recursive: true });
  await fs.appendFile(routerLogPath, `${entry}\n`).catch(() => {});
}

async function logAndNull(phase, input, error) {
  await logRouterPhase(phase, input, { message: error.message, retry_after: error.retryAfter || null });
  return null;
}

async function logAndEmpty(phase, input, error) {
  await logRouterPhase(phase, input, { message: error.message, retry_after: error.retryAfter || null });
  return [];
}

class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

function confidenceFor(source, product, exactBarcodeMatch = false) {
  if (source === "google_shopping") return "Live price";
  if (product?.cache_status === "hit") return "Cached today";
  if (exactBarcodeMatch) return "Exact barcode match";
  if (source === "estimated_store_price") return "Estimated";
  if (source === "store_fallback") return "Fallback";
  return "Estimated";
}

function warningFor(source) {
  if (source === "estimated_store_price") return "Estimated price. Live local stock was not verified.";
  if (source === "store_fallback") return "Fallback result. A live store page was unavailable or incomplete.";
  return "";
}

function variantsFor(product) {
  const text = `${product.item_name} ${product.brand}`.toLowerCase();
  if (text.includes("doritos")) return ["Nacho Cheese", "Cool Ranch", "Spicy Sweet Chili", "Zesty Cheese"];
  if (text.includes("cheetos")) return ["Crunchy Cheese Snacks", "Puffs", "Flamin Hot", "Mac and Cheese"];
  if (text.includes("monster")) return ["Ultra White", "Original Green", "Zero Sugar", "Mango Loco"];
  if (text.includes("takis")) return ["Fuego", "Blue Heat", "Crunchy Fajitas", "Intense Nacho"];
  if (text.includes("fairlife")) return ["2% Ultra-Filtered", "Chocolate", "Lactose Free", "Protein Shake"];
  if (text.includes("quest")) return ["Chocolate Chip Cookie Dough", "Cookies and Cream", "Birthday Cake", "Chocolate Brownie"];
  if (text.includes("clif")) return ["Chocolate Chip", "Crunchy Peanut Butter", "White Chocolate Macadamia"];
  if (text.includes("kind")) return ["Dark Chocolate Nuts", "Peanut Butter", "Caramel Almond"];
  return [];
}

function variationOptionsFor(product = {}) {
  const text = `${product.item_name || ""} ${product.brand || ""}`.toLowerCase();
  if (text.includes("doritos")) return ["Nacho Cheese", "Cool Ranch", "Spicy Sweet Chili", "Zesty Cheese"];
  if (text.includes("cheetos")) return ["Crunchy Cheese Snacks", "Puffs", "Flamin Hot", "Mac and Cheese"];
  if (text.includes("monster")) return ["Ultra White", "Original Green", "Zero Sugar", "Mango Loco"];
  if (text.includes("takis")) return ["Fuego", "Blue Heat", "Crunchy Fajitas", "Intense Nacho"];
  if (text.includes("fairlife")) return ["2% Ultra-Filtered", "Chocolate", "Lactose Free", "Protein Shake"];
  if (text.includes("quest")) return ["Chocolate Chip Cookie Dough", "Cookies and Cream", "Birthday Cake", "Chocolate Brownie"];
  if (text.includes("clif")) return ["Chocolate Chip", "Crunchy Peanut Butter", "White Chocolate Macadamia"];
  if (text.includes("kind")) return ["Dark Chocolate Nuts", "Peanut Butter", "Caramel Almond"];
  return [];
}

function brandVariantName(product = {}, variation = "") {
  const brand = product.brand && product.brand !== "Brand varies" ? product.brand : "";
  const variant = String(variation || "").trim();
  if (!variant) return product.item_name || "";
  if (brand && normalizeText(variant).includes(normalizeText(brand))) return variant;
  return `${brand} ${variant}`.trim();
}

function dedupeVariations(variations = []) {
  const seen = new Set();
  const clean = [];
  for (const variation of variations) {
    if (!variation) continue;
    const item = typeof variation === "string" ? { item_name: variation } : variation;
    const name = item.item_name || item.full_name;
    if (!name) continue;
    if (isRejectedVariation(item)) continue;
    const key = normalizeText(`${item.brand || ""} ${name}`);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      brand: item.brand || "Brand varies",
      item_name: name,
      full_name: name,
      image_url: item.image_url,
      category: item.category || "Grocery",
      source: item.source || item.lookup_phase || "variation",
      price: item.price,
      store: item.store,
      trust_score: item.trust_score,
      niche_brand: isNicheBrand(item.brand)
    });
  }
  return clean.slice(0, 12);
}

function isRejectedVariation(item = {}) {
  const text = normalizeText(`${item.item_name || item.full_name || ""} ${item.brand || ""} ${item.category || ""}`);
  return text.includes("sidi ali");
}

function alternativesFor(product) {
  const text = `${product.item_name} ${product.category}`.toLowerCase();
  if (text.includes("chips") || text.includes("snack")) return ["No name tortilla chips", "Compliments ripple chips"];
  if (text.includes("milk") || text.includes("dairy")) return ["Neilson milk", "Lactantia milk"];
  if (text.includes("bar") || text.includes("protein")) return ["KIND Bar", "CLIF Bar", "No name granola bars"];
  if (text.includes("bread")) return ["No name whole wheat bread", "Wonder bread"];
  return ["Store brand alternative"];
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    })
  ]);
}
