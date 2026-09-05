import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { DAMAGE_CLASSES } from "../lib/damage-classes.ts";

const messages = async (locale) =>
  JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

test("both locales explain an invalid repair backend", async () => {
  const [english, arabic] = await Promise.all([messages("en"), messages("ar")]);

  assert.equal(
    english.repair.errors.invalid_repair_backend,
    "The repair backend is configured incorrectly. Ask the server operator to fix it, then retry.",
  );
  assert.equal(typeof arabic.repair.errors.invalid_repair_backend, "string");
  assert.ok(arabic.repair.errors.invalid_repair_backend.length > 0);
});

const keyPaths = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child)
      ? keyPaths(child, path)
      : [path];
  });

test("English and Arabic message contracts stay in exact parity", async () => {
  const [english, arabic] = await Promise.all([messages("en"), messages("ar")]);
  assert.deepEqual(keyPaths(arabic).sort(), keyPaths(english).sort());
  // Derived, never retyped: renaming a `key` in lib/damage-classes.ts passes
  // tsc and eslint but breaks every `t("damageClasses.<key>.…")` at runtime,
  // because next-intl resolves keys in the browser. This is where that is caught.
  assert.deepEqual(
    Object.keys(english.damageClasses),
    DAMAGE_CLASSES.map((entry) => entry.key),
  );
});

// The four surfaces the UI reads per class. A class present but missing one of
// these renders an empty string in one locale only, which no type check sees.
const PER_CLASS_STRINGS = ["name", "description"];

test("every damage class is fully translated in both locales", async () => {
  const catalogs = { en: await messages("en"), ar: await messages("ar") };
  assert.equal(DAMAGE_CLASSES.length, 4, "the active scale is four classes");

  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const { key } of DAMAGE_CLASSES) {
      const entry = catalog.damageClasses[key];
      assert.ok(entry, `${locale}: damageClasses.${key} is missing`);
      for (const field of PER_CLASS_STRINGS) {
        assert.equal(typeof entry[field], "string", `${locale}: ${key}.${field}`);
        assert.ok(entry[field].length > 0, `${locale}: ${key}.${field} is empty`);
      }
      assert.equal(typeof entry.recommendation?.title, "string", `${locale}: ${key} title`);
      assert.ok(Array.isArray(entry.recommendation?.items), `${locale}: ${key} items`);
      assert.ok(entry.recommendation.items.length > 0, `${locale}: ${key} items empty`);
    }
  }
});

test("every damage class has its landing photo and demo sample", async () => {
  const exists = async (path) =>
    access(new URL(`../public/${path}`, import.meta.url)).then(
      () => true,
      () => false,
    );

  for (const { code } of DAMAGE_CLASSES) {
    assert.ok(await exists(`landing/tier-${code}.jpg`), `missing landing/tier-${code}.jpg`);
    assert.ok(await exists(`samples/sample-${code}.jpg`), `missing samples/sample-${code}.jpg`);
  }
});

test("the four landing photos are four distinct images", async () => {
  // The regression this guards is documented in DamageClassGrid.tsx and
  // public/landing/CREDITS.md: four classes once shared three retired-tier
  // photos, so SMD and HVD showed the SAME picture and the scale section read
  // as three levels. Existence alone cannot catch that — only distinctness can.
  const digests = await Promise.all(
    DAMAGE_CLASSES.map(async ({ code }) => {
      const bytes = await readFile(new URL(`../public/landing/tier-${code}.jpg`, import.meta.url));
      return createHash("sha256").update(bytes).digest("hex");
    }),
  );
  assert.equal(new Set(digests).size, DAMAGE_CLASSES.length, "two classes share one landing photo");
});
