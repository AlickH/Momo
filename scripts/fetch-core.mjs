#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor');
const VERSION = '1.19.34';

const BINARIES = [
  {
    name: `mihomo-darwin-arm64-v${VERSION}`,
    url: `https://github.com/MetaCubeX/mihomo/releases/download/v${VERSION}/mihomo-darwin-arm64-v${VERSION}.gz`,
    gzSha256: '1a7a20eca63fbbaec90137717465bfde488d0db2a3a79b8fadebf9b2545b6e4c',
    sha256: 'a55a9073f9b7b1fa596a82c034d2dae3407ec34732102b6e42c5513ce3033f34',
  },
  {
    name: `mihomo-linux-amd64-compatible-v${VERSION}`,
    url: `https://github.com/MetaCubeX/mihomo/releases/download/v${VERSION}/mihomo-linux-amd64-compatible-v${VERSION}.gz`,
    gzSha256: '2763f5b414527f7baf6dc57e3f82f3ab561eedf34bfd7c2f2cde1f7e592efe06',
    sha256: '5b6644c487e5dffae86b0e0e9bb5cec445579a3a9d03977c09576fee2aeefc01',
  },
  {
    name: `mihomo-linux-arm64-v${VERSION}`,
    url: `https://github.com/MetaCubeX/mihomo/releases/download/v${VERSION}/mihomo-linux-arm64-v${VERSION}.gz`,
    gzSha256: 'daaf78a6240a282cdfd75bcbf98fe321f6bd52765cc29e79f344191198f0b50f',
    sha256: '022da41e03ce70641a2f50c485b4f69ade8f1c7aeeece2cf1ec45c614a029441',
  },
];

const GEO_FILES = [
  {
    name: 'geoip.metadb',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb',
    sha256: '2eb4749bec1e1b9c269a7997ae63ee0f673cf4288349c9ee73a4e369d4d2915a',
  },
  {
    name: 'geosite.dat',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
    sha256: 'ae35a23f40a8e0486f0ed1723780ba6805a9f917a51ff30441eb2c41f688244c',
  },
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function download(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`下载失败 ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  fs.mkdirSync(VENDOR, { recursive: true });

  for (const item of BINARIES) {
    const target = path.join(VENDOR, item.name);
    if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === item.sha256) {
      console.log(`✓ ${item.name}`);
      continue;
    }
    console.log(`↓ ${item.url}`);
    const archive = await download(item.url);
    if (sha256(archive) !== item.gzSha256) throw new Error(`${item.name} 压缩包校验失败`);
    const binary = gunzipSync(archive);
    if (sha256(binary) !== item.sha256) throw new Error(`${item.name} 解压后校验失败`);
    fs.writeFileSync(target, binary, { mode: 0o755 });
    console.log(`✓ ${item.name}`);
  }

  for (const item of GEO_FILES) {
    const target = path.join(VENDOR, item.name);
    if (fs.existsSync(target) && sha256(fs.readFileSync(target)) === item.sha256) {
      console.log(`✓ ${item.name}`);
      continue;
    }
    console.log(`↓ ${item.url}`);
    const data = await download(item.url);
    if (sha256(data) !== item.sha256) throw new Error(`${item.name} 校验失败（上游可能已更新，请同步更新哈希）`);
    fs.writeFileSync(target, data);
    console.log(`✓ ${item.name}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
