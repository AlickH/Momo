const fs = require('node:fs');
const { Reader } = require('mmdb-lib');
const centroids = require('./country-centroids.json');
const readers = new Map();

function readerFor(dbPath) {
  if (!dbPath) return null;
  const cached = readers.get(dbPath);
  if (cached && cached.mtimeMs === fs.statSync(dbPath).mtimeMs) return cached.reader;
  const reader = new Reader(fs.readFileSync(dbPath));
  readers.set(dbPath, { reader, mtimeMs: fs.statSync(dbPath).mtimeMs });
  return reader;
}

function lookup(ips, { dbPath } = {}) {
  const reader = readerFor(dbPath);
  const locations = {};
  if (!reader) return { locations };
  for (const ip of new Set(ips)) {
    try {
      const data = reader.get(ip);
      const code = Array.isArray(data) ? String(data[0] || '').toLowerCase() : '';
      const country = centroids[code];
      if (!country) continue;
      locations[ip] = {
        ip,
        country: country.name,
        countryCode: country.code,
        city: '',
        lat: country.lat,
        lon: country.lon,
      };
    } catch {
      // Ignore IPs missing from the country database.
    }
  }
  return { locations };
}

module.exports = { lookup };
