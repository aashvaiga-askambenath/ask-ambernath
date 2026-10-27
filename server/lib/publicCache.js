const TTL_MS = 30_000;
const MAX_ENTRIES = 100;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_BYTES = 256 * 1024;
const CACHE_CONTROL = 'public, max-age=0, s-maxage=30, stale-while-revalidate=30';

function createPublicCache() {
  const entries = new Map();
  let totalBytes = 0;
  let generation = 0;

  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    entries.delete(key);
    totalBytes -= entry.bytes;
  }

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      remove(key);
      return null;
    }
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }

  function set(key, body, expectedGeneration) {
    if (expectedGeneration !== generation) return false;
    const serialized = JSON.stringify(body);
    if (serialized === undefined) return false;
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > MAX_ENTRY_BYTES) return false;

    remove(key);
    while (entries.size >= MAX_ENTRIES || totalBytes + bytes > MAX_CACHE_BYTES) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) return false;
      remove(oldestKey);
    }
    entries.set(key, { body, bytes, expiresAt: Date.now() + TTL_MS });
    totalBytes += bytes;
    return true;
  }

  return {
    clear() {
      entries.clear();
      totalBytes = 0;
      generation += 1;
    },
    middleware(req, res, next) {
      if (req.method !== 'GET') return next();

      const key = req.originalUrl;
      const cached = get(key);
      if (cached) {
        res.set('Cache-Control', CACHE_CONTROL);
        return res.json(cached.body);
      }

      const requestGeneration = generation;
      const sendJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && set(key, body, requestGeneration)) {
          res.set('Cache-Control', CACHE_CONTROL);
        }
        return sendJson(body);
      };
      return next();
    },
  };
}

module.exports = { createPublicCache };
