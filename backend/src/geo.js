const fs = require('node:fs');
const { Reader } = require('mmdb-lib');
const { IP2Location } = require('ip2location-nodejs');
const centroids = require('./country-centroids.json');
const readers = new Map();
const cityReaders = new Map();

function readerFor(dbPath) {
  if (!dbPath) return null;
  const cached = readers.get(dbPath);
  if (cached && cached.mtimeMs === fs.statSync(dbPath).mtimeMs) return cached.reader;
  const reader = new Reader(fs.readFileSync(dbPath));
  readers.set(dbPath, { reader, mtimeMs: fs.statSync(dbPath).mtimeMs });
  return reader;
}

function cityReaderFor(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const cached = cityReaders.get(dbPath);
  if (cached && cached.mtimeMs === fs.statSync(dbPath).mtimeMs) return cached.reader;
  const reader = new IP2Location();
  reader.open(dbPath);
  cityReaders.set(dbPath, { reader, mtimeMs: fs.statSync(dbPath).mtimeMs });
  return reader;
}

function lookup(ips, { dbPath, cityDbPath } = {}) {
  const cityReader = cityReaderFor(cityDbPath);
  if (cityReader) {
    const locations = {};
    for (const ip of new Set(ips)) {
      try {
        const data = cityReader.getAll(ip);
        if (!data?.countryShort || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) continue;
        locations[ip] = {
          ip,
          country: data.countryLong || data.countryShort,
          countryCode: data.countryShort,
          city: data.city || '',
          lat: data.latitude,
          lon: data.longitude,
        };
      } catch {
        // Ignore IPs missing from the city database.
      }
    }
    return { locations };
  }
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
