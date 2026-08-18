import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

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
