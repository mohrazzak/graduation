import { readdir } from "node:fs/promises";

const entries = await readdir(new URL(".", import.meta.url), { withFileTypes: true });
const testNames = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => entry.name)
  .sort();

for (const name of testNames) {
  await import(new URL(name, import.meta.url).href);
}
