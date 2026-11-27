const fs = require('node:fs');
const { Reader } = require('mmdb-lib');
const countries = require('world-countries');

const countryByCode = new Map(countries.map((country) => [country.cca2.toLowerCase(), country]));
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
      const country = countryByCode.get(code);
      if (!country || !Array.isArray(country.latlng)) continue;
      locations[ip] = {
        ip,
        country: country.name.common,
        countryCode: country.cca2,
        city: '',
        lat: country.latlng[0],
        lon: country.latlng[1],
      };
    } catch {
      // Ignore IPs missing from the country database.
    }
  }
  return { locations };
}

module.exports = { lookup };
