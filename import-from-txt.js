/**
 * import-from-txt.js
 *
 * Reads a plain text file of movie/series names and appends them to addItems
 * in items.js. Names already present in addItems or removeItems are skipped.
 *
 * Usage:
 *   node import-from-txt.js [file]        (defaults to watchlist.txt)
 *
 * Text file format:
 *   [movies]
 *   Inception
 *   The Dark Knight
 *
 *   [series]
 *   Breaking Bad
 *   The Wire
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ITEMS_PATH = resolve(__dirname, "items.js");

// ---------------------------------------------------------------------------
// Parse the text file into { movies: [...], series: [...] }
// ---------------------------------------------------------------------------
function parseTxtFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const result = { movies: [], series: [] };
  let section = null;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line.toLowerCase() === "[movies]") { section = "movies"; continue; }
    if (line.toLowerCase() === "[series]") { section = "series"; continue; }

    if (section) result[section].push(line);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Extract names already present in items.js (both lists) to skip duplicates
// ---------------------------------------------------------------------------
function extractExistingNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/name:\s*["']([^"']+)["']/g)) {
    names.add(match[1].toLowerCase());
  }
  return names;
}

// ---------------------------------------------------------------------------
// Insert new entries before the closing ] of a named export array
// ---------------------------------------------------------------------------
function insertIntoArray(source, exportName, newEntries) {
  if (newEntries.length === 0) return source;

  const lines = newEntries.map((e) => `  ${e},`).join("\n");

  // Match the array: export const <name> = [ ... ]
  const pattern = new RegExp(
    `(export const ${exportName}\\s*=\\s*\\[)([\\s\\S]*?)(\\])`,
    "m"
  );

  return source.replace(pattern, (_, open, body, close) => {
    const trimmed = body.trimEnd();
    const separator = trimmed.length > 0 ? "\n" : "";
    return `${open}${trimmed}${separator}\n${lines}\n${close}`;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const txtPath = resolve(process.argv[2] ?? "watchlist.txt");

let parsed;
try {
  parsed = parseTxtFile(txtPath);
} catch {
  console.error(`Error: could not read "${txtPath}"`);
  process.exit(1);
}

const totalInFile = parsed.movies.length + parsed.series.length;
if (totalInFile === 0) {
  console.log("No titles found in the text file. Nothing to do.");
  process.exit(0);
}

let source = readFileSync(ITEMS_PATH, "utf8");
const existing = extractExistingNames(source);

const toAdd = { movies: [], series: [] };
let skipped = 0;

for (const name of parsed.movies) {
  if (existing.has(name.toLowerCase())) { skipped++; continue; }
  toAdd.movies.push(`{ name: "${name}", type: "movie" }`);
}
for (const name of parsed.series) {
  if (existing.has(name.toLowerCase())) { skipped++; continue; }
  toAdd.series.push(`{ name: "${name}", type: "series" }`);
}

source = insertIntoArray(source, "addItems", [...toAdd.movies, ...toAdd.series]);
writeFileSync(ITEMS_PATH, source, "utf8");

const added = toAdd.movies.length + toAdd.series.length;
console.log(`Done: ${added} title(s) added to addItems, ${skipped} skipped (already present).`);
if (added > 0) {
  [...toAdd.movies, ...toAdd.series].forEach((e) => {
    const name = e.match(/name: "([^"]+)"/)[1];
    const type = e.match(/type: "([^"]+)"/)[1];
    console.log(`  + ${name} (${type})`);
  });
}
