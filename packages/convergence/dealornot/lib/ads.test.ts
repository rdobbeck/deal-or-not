import { describe, it } from "node:test";
import assert from "node:assert";

// Inline the shuffle since we can't use path aliases in node:test
function seededShuffle<T>(arr: T[], seed: bigint): T[] {
  const shuffled = [...arr];
  let s = Number(seed % 2147483647n) || 1;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

describe("seededShuffle", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("returns same length array", () => {
    const result = seededShuffle(items, 28n);
    assert.strictEqual(result.length, items.length);
  });

  it("contains all original items", () => {
    const result = seededShuffle(items, 28n);
    assert.deepStrictEqual([...result].sort(), [...items].sort());
  });

  it("is deterministic — same seed gives same order", () => {
    const a = seededShuffle(items, 42n);
    const b = seededShuffle(items, 42n);
    assert.deepStrictEqual(a, b);
  });

  it("different seeds give different orders", () => {
    const a = seededShuffle(items, 28n);
    const b = seededShuffle(items, 99n);
    // Extremely unlikely to be identical with 8 items
    assert.notDeepStrictEqual(a, b);
  });

  it("does not mutate original array", () => {
    const original = [...items];
    seededShuffle(items, 28n);
    assert.deepStrictEqual(items, original);
  });

  it("handles seed of 0n", () => {
    const result = seededShuffle(items, 0n);
    assert.strictEqual(result.length, items.length);
  });

  it("handles very large seeds (like VRF output)", () => {
    const bigSeed = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
    const result = seededShuffle(items, bigSeed);
    assert.strictEqual(result.length, items.length);
    assert.deepStrictEqual([...result].sort(), [...items].sort());
  });
});

describe("SPONSOR_ADS data", () => {
  // Read the raw file to validate structure
  it("all ads have required fields", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(new URL("./ads.ts", import.meta.url), "utf-8");

    // Check that every object has text, tagline, url, bg
    const textCount = (content.match(/text:/g) || []).length;
    const taglineCount = (content.match(/tagline:/g) || []).length;
    const urlCount = (content.match(/url:/g) || []).length;
    const bgCount = (content.match(/bg:/g) || []).length;

    assert.strictEqual(textCount, taglineCount, "every ad should have text and tagline");
    assert.strictEqual(textCount, urlCount, "every ad should have text and url");
    assert.strictEqual(textCount, bgCount, "every ad should have text and bg");
    assert.ok(textCount > 20, `should have >20 ads, found ${textCount}`);
  });

  it("no ads link to placeholder #", async () => {
    const fs = await import("node:fs");
    const content = fs.readFileSync(new URL("./ads.ts", import.meta.url), "utf-8");
    const placeholders = (content.match(/url: "#"/g) || []).length;
    // Banker's Therapy Fund is the only allowed placeholder
    assert.ok(placeholders <= 1, `found ${placeholders} placeholder URLs, max 1 allowed`);
  });
});
