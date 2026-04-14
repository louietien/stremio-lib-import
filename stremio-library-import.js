/**
 * stremio-library-import.js
 *
 * Adds a list of movies/series to a Stremio account's library via the
 * unofficial Stremio API (https://api.strem.io).
 *
 * Setup:
 *   1. npm install dotenv
 *   2. Create a .env file in the same directory.
 *
 *   If you log in with email/password:
 *        STREMIO_EMAIL=your@email.com
 *        STREMIO_PASSWORD=yourpassword
 *
 *   If you log in with Facebook (or any other social login):
 *        STREMIO_AUTH_KEY=your_auth_key_here
 *
 *     How to get your authKey:
 *       a. Go to https://web.strem.io and log in with Facebook.
 *       b. Open DevTools → Console and run:
 *            JSON.parse(localStorage['web-settings-stremio5']).auth.key
 *       c. Copy the returned string into STREMIO_AUTH_KEY.
 *
 *   3. node stremio-library-import.js
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { addItems, removeItems } from "./items.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "output.txt");

const outputLines = [];
function log(line) {
  console.log(line);
  outputLines.push(line);
}

const items = [
  ...addItems.map((i) => ({ ...i, removed: false })),
  ...removeItems.map((i) => ({ ...i, removed: true })),
];

const STREMIO_API = "https://api.strem.io/api";
const CINEMETA_API = "https://v3-cinemeta.strem.io/meta";
const CINEMETA_CATALOG = "https://v3-cinemeta.strem.io/catalog";
const DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(email, password) {
  const res = await fetch(`${STREMIO_API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "Login", email, password, facebook: false }),
  });

  if (!res.ok) {
    throw new Error(`Login request failed with HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Login error: ${data.error}`);
  }

  const authKey = data.result?.authKey;
  if (!authKey) {
    throw new Error("Login succeeded but no authKey in response.");
  }

  return authKey;
}

// If no imdbId is provided, search Cinemeta by name and use the first result.
// The resolved item will have _poster pre-filled so we skip a second fetch later.
async function resolveItem(item) {
  if (item.imdbId) return item;

  const query = encodeURIComponent(item.name);
  const res = await fetch(
    `${CINEMETA_CATALOG}/${item.type}/top/search=${query}.json`
  );
  if (!res.ok) throw new Error(`Cinemeta search failed with HTTP ${res.status}`);

  const data = await res.json();
  const match = data.metas?.[0];
  if (!match) throw new Error(`No results found for "${item.name}"`);

  return { ...item, imdbId: match.id, name: match.name ?? item.name, _poster: match.poster ?? "" };
}

async function fetchPoster(item) {
  if (item._poster !== undefined) return item._poster;
  try {
    const res = await fetch(`${CINEMETA_API}/${item.type}/${item.imdbId}.json`);
    if (!res.ok) return "";
    const data = await res.json();
    return data.meta?.poster ?? "";
  } catch {
    return "";
  }
}

function buildLibraryItem(item, poster) {
  const now = new Date().toISOString();
  return {
    _id: item.imdbId,
    name: item.name,
    type: item.type,
    poster,
    posterShape: "poster",
    _ctime: now,
    _mtime: now,
    state: {
      lastWatched: null,
      timeWatched: 0,
      timeOffset: 0,
      overallTimeWatched: 0,
      timesWatched: 0,
      flaggedWatched: 0,
      duration: 0,
      video_id: null,
      watched: "",
      noNotif: false,
    },
    behaviorHints: {
      defaultVideoId: null,
    },
    removed: item.removed === true,
    temp: false,
  };
}

async function fetchExistingIds(authKey, ids) {
  const res = await fetch(`${STREMIO_API}/datastoreGet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authKey, collection: "libraryItem", ids }),
  });

  if (!res.ok) throw new Error(`datastoreGet failed with HTTP ${res.status}`);

  const data = await res.json();
  if (data.error) throw new Error(`datastoreGet error: ${data.error}`);

  // Return a Set of IDs that exist in the library and haven't been removed
  const existing = new Set();
  for (const entry of data.result ?? []) {
    if (!entry.removed) existing.add(entry._id);
  }
  return existing;
}

async function addToLibrary(authKey, item) {
  const poster = item.removed ? "" : await fetchPoster(item);
  const payload = {
    authKey,
    collection: "libraryItem",
    changes: [buildLibraryItem(item, poster)],
  };

  const res = await fetch(`${STREMIO_API}/datastorePut`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`API error: ${data.error}`);
  }

  return data;
}

async function main() {
  const authKeyEnv = process.env.STREMIO_AUTH_KEY;
  const email = process.env.STREMIO_EMAIL;
  const password = process.env.STREMIO_PASSWORD;

  let authKey;

  if (authKeyEnv) {
    authKey = authKeyEnv;
    console.log("Using STREMIO_AUTH_KEY from environment.\n");
  } else if (email && password) {
    console.log(`Logging in as ${email}...`);
    try {
      authKey = await login(email, password);
      console.log("Login successful.\n");
    } catch (err) {
      console.error(`Login failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error(
      "Error: provide either STREMIO_AUTH_KEY or both STREMIO_EMAIL and STREMIO_PASSWORD in .env.\n" +
      "Facebook users: see the setup instructions at the top of this file for how to get your authKey."
    );
    process.exit(1);
  }

  // Resolve any items that are missing an imdbId via Cinemeta name search
  const resolvedItems = [];
  for (const item of items) {
    try {
      resolvedItems.push(await resolveItem(item));
    } catch (err) {
      console.error(`  [FAIL] "${item.name}": ${err.message}`);
    }
  }

  const existingIds = await fetchExistingIds(authKey, resolvedItems.map((i) => i.imdbId));

  let addedCount = 0;
  let removedCount = 0;
  let skippedCount = 0;

  for (const item of resolvedItems) {
    const isRemoval = item.removed === true;
    const inLibrary = existingIds.has(item.imdbId);

    if (isRemoval && !inLibrary) {
      log(`  [SKIP] ${item.name} (${item.imdbId}) — not in library`);
      skippedCount++;
      continue;
    }

    if (!isRemoval && inLibrary) {
      log(`  [SKIP] ${item.name} (${item.imdbId}) — already in library`);
      skippedCount++;
      continue;
    }

    try {
      await addToLibrary(authKey, item);
      if (isRemoval) {
        log(`  [REMOVED] ${item.name} (${item.imdbId})`);
        removedCount++;
      } else {
        log(`  [OK] ${item.name} (${item.imdbId})`);
        addedCount++;
      }
    } catch (err) {
      log(`  [FAIL] ${item.name} (${item.imdbId}): ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  const summary = `\nDone: ${addedCount} added, ${removedCount} removed, ${skippedCount} skipped.`;
  log(summary);

  writeFileSync(OUTPUT_PATH, outputLines.join("\n") + "\n", "utf8");
  console.log(`Output written to output.txt`);
}

main();
