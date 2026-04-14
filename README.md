# stremio-lib-import

A Node.js utility to bulk-import movies and TV series into your [Stremio](https://www.stremio.com/) library using the unofficial Stremio API.

## Features

- Add or remove titles from your Stremio library in bulk
- Auto-resolves titles to IMDb IDs via the Cinemeta API (no manual lookup needed)
- Skips items already in your library to avoid duplicates
- Respects rate limits with built-in request delays
- Import titles from a plain text file with `import-from-txt.js`
- Logs results to `output.txt` for review

## Requirements

- Node.js v18+
- A Stremio account

## Installation

```bash
git clone https://github.com/yourusername/stremio-lib-import.git
cd stremio-lib-import
npm install
```

## Setup

Create a `.env` file in the project root with your Stremio credentials. Choose **one** of the two authentication methods:

### Option A — Email & Password

```env
STREMIO_EMAIL=your@email.com
STREMIO_PASSWORD=yourpassword
```

### Option B — Auth Key (for Facebook / social logins)

If you sign in to Stremio via Facebook or another social provider, you won't have a password. Instead, grab your auth key from the web app:

1. Go to [web.strem.io](https://web.strem.io) and log in
2. Open DevTools (`F12`) → **Console** tab
3. Run the following command:
   ```js
   JSON.parse(localStorage['profile']).auth.key
   ```
4. Copy the returned string and add it to your `.env`:
   ```env
   STREMIO_AUTH_KEY=your_auth_key_here
   ```

> `STREMIO_AUTH_KEY` takes precedence over email/password if both are set.

## Usage

### 1. Define your titles

Edit [items.js](items.js) and add entries to the `addItems` or `removeItems` arrays:

```js
export const addItems = [
  { name: "The Godfather", type: "movie", imdbId: "tt0068646" },
  { name: "Breaking Bad", type: "series" }, // imdbId is optional — auto-resolved
];

export const removeItems = [
  { name: "Some Show", type: "series", imdbId: "tt1234567" },
];
```

Each entry supports:

| Field    | Required | Description                                         |
|----------|----------|-----------------------------------------------------|
| `name`   | Yes      | Title of the movie or series                        |
| `type`   | Yes      | `"movie"` or `"series"`                             |
| `imdbId` | No       | IMDb ID (e.g. `"tt0068646"`). Auto-resolved if omitted. |

### 2. Run the import

```bash
npm start
```

Results are printed to the console and saved to `output.txt`:

```
[OK]   tt0068646  The Godfather
[SKIP] tt0903747  Breaking Bad  (already in library)
[FAIL] -          Unknown Title  (not found on Cinemeta)

Done: 1 added, 0 removed, 1 skipped.
```

### Import from a text file

If you maintain a watchlist in a plain text file, use `import-from-txt.js` to parse it and auto-append new entries to `items.js`.

**Expected file format** (`watchlist.txt`):

```
[movies]
The Godfather
Parasite

[series]
Breaking Bad
Squid Game
```

**Run the importer:**

```bash
node import-from-txt.js            # defaults to watchlist.txt
node import-from-txt.js mylist.txt # use a custom file
```

This will append any new titles (skipping duplicates) to the `addItems` array in `items.js`. Then run `npm start` as usual.

## Configuration

The following constants can be adjusted at the top of [stremio-library-import.js](stremio-library-import.js):

| Constant          | Default                                | Description                              |
|-------------------|----------------------------------------|------------------------------------------|
| `STREMIO_API`     | `https://api.strem.io/api`             | Stremio API base URL                     |
| `CINEMETA_API`    | `https://v3-cinemeta.strem.io/meta`    | Cinemeta metadata endpoint               |
| `CINEMETA_CATALOG`| `https://v3-cinemeta.strem.io/catalog` | Cinemeta search catalog                  |
| `DELAY_MS`        | `500`                                  | Delay (ms) between API calls to avoid throttling |

## Output

After each run, `output.txt` is overwritten with a full log:

- `[OK]` — item was successfully added or removed
- `[SKIP]` — item was already in (or not in) the library; no action taken
- `[FAIL]` — item could not be resolved or the API call failed (with reason)

A summary line at the end shows total counts.

## Notes

- This tool uses the **unofficial** Stremio API. It may break if Stremio changes their API.
- Auth keys can expire. If you get authentication errors, re-fetch your key from the browser console.
- The 500ms delay between requests helps avoid being rate-limited.
