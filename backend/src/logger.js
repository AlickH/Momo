const fs = require('node:fs');
const path = require('node:path');

const MAX_ENTRIES = 1500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

class Logger {
  constructor(logDir) {
    this.logDir = logDir;
    this.file = path.join(logDir, 'app.log');
    this.entries = [];
    this.nextId = 1;
    this.stream = null;
    this.ready = false;
    this.fileBytes = 0;
    this.rotating = false;
  }

  async init() {
    await fs.promises.mkdir(this.logDir, { recursive: true });
    try {
      this.fileBytes = (await fs.promises.stat(this.file)).size;
    } catch {
      this.fileBytes = 0;
    }
    this.stream = fs.createWriteStream(this.file, { flags: 'a' });
    this.ready = true;
  }

  async rotate() {
    if (this.rotating) return;
    this.rotating = true;
    const oldStream = this.stream;
    this.stream = null;
    await new Promise((resolve) => oldStream.end(resolve));
    try {
      await fs.promises.rm(`${this.file}.1`, { force: true });
      await fs.promises.rename(this.file, `${this.file}.1`);
    } catch {
      // A missing file simply means there is nothing to rotate.
    }
    this.stream = fs.createWriteStream(this.file, { flags: 'a' });
    this.fileBytes = 0;
    this.rotating = false;
  }

  push(level, source, message) {
    const entry = {
      id: this.nextId++,
      time: Date.now(),
      level,
      source,
      message: String(message).replace(/\r$/, ''),
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    const line = `${new Date(entry.time).toISOString()} [${level}] [${source}] ${entry.message}\n`;
    if (this.ready && this.stream) {
      this.stream.write(line);
      this.fileBytes += Buffer.byteLength(line);
      if (this.fileBytes > MAX_FILE_BYTES) void this.rotate();
    } else {
      process.stderr.write(line);
    }
    return entry;
  }

  info(source, message) {
    return this.push('info', source, message);
  }

  warn(source, message) {
    return this.push('warning', source, message);
  }

  error(source, message) {
    return this.push('error', source, message);
  }

  debug(source, message) {
    return this.push('debug', source, message);
  }

  coreLine(line) {
    const text = String(line).trim();
    if (!text) return;
    const levelMatch = text.match(/\blevel=([a-z]+)/);
    let level = levelMatch ? levelMatch[1] : 'info';
    if (level === 'warn') level = 'warning';
    if (!['debug', 'info', 'warning', 'error'].includes(level)) level = 'info';
    const messageMatch = text.match(/\bmsg="((?:[^"\\]|\\.)*)"/);
    let message = text;
    if (messageMatch) {
      try {
        message = JSON.parse(`"${messageMatch[1]}"`);
      } catch {
        message = messageMatch[1];
      }
    }
    this.push(level, 'core', message);
  }

  list({ since = 0, limit = 300 } = {}) {
    const start = this.entries.findIndex((entry) => entry.id > since);
    if (start === -1) return [];
    return this.entries.slice(start, start + Math.min(Math.max(limit, 1), 1000));
  }

  latestId() {
    return this.nextId - 1;
  }

  clear() {
    this.entries = [];
  }

  close() {
    if (this.stream) this.stream.end();
    this.ready = false;
  }
}

module.exports = { Logger };
