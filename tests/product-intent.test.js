import assert from "node:assert/strict";
import { scoreProductCandidate } from "../src/product-pipeline.js";

const cheetosChips = scoreProductCandidate({
  title: "Cheetos Crunchy Cheese Flavored Snacks",
  brand: "Cheetos",
  category: "Chips and Snacks"
}, "cheetos");

const cheetosMac = scoreProductCandidate({
  title: "Cheetos Mac N Cheese Bold and Cheesy",
  brand: "Cheetos",
  category: "Macaroni and Pasta Dinner"
}, "cheetos");

const explicitMac = scoreProductCandidate({
  title: "Cheetos Mac N Cheese Bold and Cheesy",
  brand: "Cheetos",
  category: "Macaroni and Pasta Dinner"
}, "cheetos mac and cheese");

assert.ok(cheetosChips > cheetosMac, "Cheetos should prefer snack products over mac and cheese by default.");
assert.ok(explicitMac > cheetosMac, "Explicit mac and cheese searches should still recognize mac products.");

const questBar = scoreProductCandidate({
  title: "Quest Protein Bar Cookies and Cream",
  brand: "Quest",
  category: "Protein and Energy Bars"
}, "quest bar");

const questPowder = scoreProductCandidate({
  title: "Quest Protein Powder Vanilla",
  brand: "Quest",
  category: "Protein Powder"
}, "quest bar");

assert.ok(questBar > questPowder, "Quest bar should prefer bar products over powders or other Quest formats.");

const randomWater = scoreProductCandidate({
  title: "Sidi Ali",
  brand: "Sidi Ali",
  category: "Beverages and water"
}, "bar");

assert.ok(randomWater < 5, "A generic bar search should reject unrelated beverage products.");

const waterAgainstClif = scoreProductCandidate({
  title: "Sidi Ali",
  brand: "Sidi Ali",
  category: "Beverages and water"
}, "CLIF Bar Energy Bar");

assert.ok(waterAgainstClif < 4, "A CLIF bar search should reject beverage records.");

console.log("product intent matching passed.");
