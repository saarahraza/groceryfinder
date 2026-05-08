import assert from "node:assert/strict";
import { normalizePrice } from "../src/product-pipeline.js";

const cases = [
  { label: "pounds to 100g", price: 6.99, unit: "/lb", expectedPrice: 1.54, expectedUnit: "/100g" },
  { label: "already per 100g", price: 1.44, unit: "/100g", expectedPrice: 1.44, expectedUnit: "/100g" },
  { label: "kilograms to 100g", price: 4.99, unit: "/1kg", expectedPrice: 0.5, expectedUnit: "/100g" },
  { label: "grams to 100g", price: 5.49, unit: "/750g", expectedPrice: 0.73, expectedUnit: "/100g" },
  { label: "millilitres to 100ml", price: 3.99, unit: "/500ml", expectedPrice: 0.8, expectedUnit: "/100ml" },
  { label: "litres to 100ml", price: 5.49, unit: "/1.5L", expectedPrice: 0.37, expectedUnit: "/100ml" },
  { label: "pack sizes stay item-based", price: 7.99, unit: "/6pack", expectedPrice: 7.99, expectedUnit: "/6pack" }
];

for (const testCase of cases) {
  const normalized = normalizePrice(testCase.price, testCase.unit);
  assert.equal(normalized.normalized_price, testCase.expectedPrice, testCase.label);
  assert.equal(normalized.normalized_unit, testCase.expectedUnit, testCase.label);
  assert.equal(normalized.unit_price, `$${testCase.expectedPrice.toFixed(2)}${testCase.expectedUnit}`, testCase.label);
}

console.log(`normalizePrice passed ${cases.length} unit cases.`);
