import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { DAMAGE_CLASSES } from "../lib/damage-classes.ts";

const REPORT_DIR = new URL("../components/report/", import.meta.url);

const messages = async (locale) =>
  JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

const sources = async () => {
  const names = (await readdir(REPORT_DIR)).filter((name) => name.endsWith(".tsx")).sort();
  return Promise.all(
    names.map(async (name) => [name, await readFile(new URL(name, REPORT_DIR), "utf8")]),
  );
};

const resolve = (catalog, path) =>
  path.split(".").reduce((node, part) => (node == null ? undefined : node[part]), catalog);

test("every static message key the report prints exists in both locales", async () => {
  // next-intl resolves keys in the BROWSER: neither tsc nor eslint notices a
  // key that was renamed out from under a t(). The report is the surface where
  // that fails silently and unrecoverably — a missing key prints a raw key
  // string onto a document someone hands to an examiner.
  const catalogs = { en: await messages("en"), ar: await messages("ar") };
  const files = await sources();
  const found = [];

  for (const [name, source] of files) {
    for (const match of source.matchAll(/\bt(?:\.raw)?\("([^"$]+)"/g)) {
      found.push([name, match[1]]);
    }
  }
  assert.ok(found.length > 0, "no message keys were extracted — did the regex or the layout change?");

  for (const [name, key] of found) {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      const value = resolve(catalog, key);
      assert.equal(typeof value, "string", `${locale}: ${name} reads a missing key ${key}`);
      assert.ok(value.length > 0, `${locale}: ${name} reads an empty key ${key}`);
    }
  }
});

test("the report's per-class keys resolve for all four classes", async () => {
  // The class-scoped lookups are template literals, so the check above cannot
  // see them. They are what the verdict band, the regions table and the
  // recommendation strip all interpolate.
  const catalogs = { en: await messages("en"), ar: await messages("ar") };
  const perClass = ["name", "description", "recommendation.title"];

  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const { key } of DAMAGE_CLASSES) {
      for (const field of perClass) {
        const value = resolve(catalog, `damageClasses.${key}.${field}`);
        assert.equal(typeof value, "string", `${locale}: damageClasses.${key}.${field}`);
      }
      const items = resolve(catalog, `damageClasses.${key}.recommendation.items`);
      assert.ok(Array.isArray(items) && items.length > 0, `${locale}: ${key} recommendation items`);
    }
  }
});

test("nothing in the printed report animates", async () => {
  // The report is display:none until Chrome takes the print snapshot, and
  // window.print() is synchronous. A framer-motion element that starts at
  // `initial` and animates to its real value has no reason to have arrived: a
  // scale strip would print dimmed and a score bar would print empty. This is
  // why the report has its own static scale and score bars instead of reusing
  // DamageStrip and ConfidenceBars.
  for (const [name, source] of await sources()) {
    assert.ok(!/framer-motion/.test(source), `${name} imports framer-motion`);
    assert.ok(
      !/\bfrom "@\/components\/ui\/DamageStrip"|\bfrom "@\/components\/analyze\/ConfidenceBars"/.test(
        source,
      ),
      `${name} reuses an animated screen component`,
    );
  }
});
