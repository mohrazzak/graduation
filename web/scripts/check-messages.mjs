// Message-catalog audit: en/ar key trees must be identical, and every key
// referenced from code (t("...") literals, template-key patterns, dotted key
// literals fed to t indirectly) must exist in BOTH catalogs. Orphans are
// reported as information only. Run: node scripts/check-messages.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function flatten(tree, prefix = "") {
  const keys = [];
  for (const [name, value] of Object.entries(tree)) {
    const path = prefix === "" ? name : `${prefix}.${name}`;
    if (typeof value === "string") keys.push(path);
    else keys.push(...flatten(value, path));
  }
  return keys;
}

const en = flatten(JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8")));
const ar = flatten(JSON.parse(readFileSync(join(ROOT, "messages/ar.json"), "utf8")));
const enSet = new Set(en);
const arSet = new Set(ar);

const treeDiff = [
  ...en.filter((key) => !arSet.has(key)).map((key) => `in en only: ${key}`),
  ...ar.filter((key) => !enSet.has(key)).map((key) => `in ar only: ${key}`),
];

// --- collect source files -----------------------------------------------
function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}
const sources = ["app", "components", "lib", "i18n"].flatMap((dir) => walk(join(ROOT, dir)));

// --- extract references ---------------------------------------------------
const failures = [];
// Each entry: RegExp matching fully-qualified catalog keys this reference covers.
const referenced = [];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const file of sources) {
  const text = readFileSync(file, "utf8");

  // translator bindings: const tm = useTranslations("ns") / await getTranslations("ns")
  // / getTranslations({ locale, namespace: "ns" }). Unlisted `t` (e.g. the
  // Promise.all destructure in Navbar) defaults to the root namespace.
  const bindings = new Map();
  for (const m of text.matchAll(
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:use|get)Translations\(\s*(?:"([^"]+)")?\s*\)/g,
  )) {
    bindings.set(m[1], m[2] ?? "");
  }
  for (const m of text.matchAll(/namespace:\s*"([^"]+)"/g)) bindings.set("t", m[1]);

  const nsOf = (name) => bindings.get(name) ?? (name === "t" ? "" : null);

  // static calls: t("key") and t.rich("key")
  for (const m of text.matchAll(/\b(\w+)(?:\.rich)?\(\s*"([^"]+)"/g)) {
    const ns = nsOf(m[1]);
    if (ns === null) continue;
    const full = ns === "" ? m[2] : `${ns}.${m[2]}`;
    referenced.push({ file, source: full, regex: new RegExp(`^${esc(full)}$`) });
  }
  // template calls: t(`levels.${level.key}.name`) -> wildcard per ${...} hole
  for (const m of text.matchAll(/\b(\w+)(?:\.rich)?\(\s*`([^`]+)`/g)) {
    const ns = nsOf(m[1]);
    if (ns === null) continue;
    const pattern = m[2]
      .split(/\$\{[^}]*\}/)
      .map(esc)
      .join("[A-Za-z0-9]+");
    const full = ns === "" ? pattern : `${esc(ns)}\\.${pattern}`;
    referenced.push({ file, source: m[2], regex: new RegExp(`^${full}$`), template: true });
  }
  // dotted key literals routed to t() through records (e.g. SUBMIT_ERROR_KEYS):
  // any quoted path rooted at a real top-level namespace must resolve.
  const topLevel = new Set(en.map((key) => key.split(".")[0]));
  for (const m of text.matchAll(/"([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)"/g)) {
    const key = m[1];
    if (!topLevel.has(key.split(".")[0])) continue;
    referenced.push({ file, source: key, regex: new RegExp(`^${esc(key)}$`), literal: true });
  }
}

// --- verify ----------------------------------------------------------------
for (const ref of referenced) {
  const inEn = en.some((key) => ref.regex.test(key));
  const inAr = ar.some((key) => ref.regex.test(key));
  // Dotted literals that match nothing may be non-message strings (namespace
  // prefixes like "common.actions") — only fail them when they LOOK like a
  // leaf (resolve in neither catalog AND are not a prefix of real keys).
  if (ref.literal && !inEn && en.some((key) => key.startsWith(`${ref.source}.`))) continue;
  if (!inEn || !inAr) {
    failures.push(`${ref.file.replace(ROOT, "")}: "${ref.source}" missing in ${!inEn ? "en" : "ar"}`);
  }
}

const orphans = en.filter((key) => !referenced.some((ref) => ref.regex.test(key)));

if (treeDiff.length > 0) {
  console.error("CATALOG TREES DIFFER:");
  for (const line of treeDiff) console.error(`  ${line}`);
}
if (failures.length > 0) {
  console.error("MISSING KEYS (referenced in code, absent from a catalog):");
  for (const line of failures) console.error(`  ${line}`);
}
console.log(`en keys: ${en.length}, ar keys: ${ar.length}, references: ${referenced.length}`);
console.log(
  orphans.length > 0
    ? `orphan keys (defined, never referenced — informational):\n  ${orphans.join("\n  ")}`
    : "no orphan keys",
);
if (treeDiff.length > 0 || failures.length > 0) process.exit(1);
console.log("OK: catalogs identical, all referenced keys exist in both.");
