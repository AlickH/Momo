#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor');
const BUILD = 'alpha-smart-1348c4d';
const RELEASE = 'Prerelease-Alpha';

const BINARIES = [
  {
    name: `mihomo-darwin-arm64-${BUILD}`,
    url: `https://github.com/vernesong/mihomo/releases/download/${RELEASE}/mihomo-darwin-arm64-${BUILD}.gz`,
    gzSha256: '7b6640b583a25eb33e3c3581b59e59b421b99295b4f8531c1e18a95ec8b3d0be',
    sha256: '09c79cfbe6e1d77b4da0b203391f179e4219b747588207bbdb0df692724550b4',
  },
  {
    name: `mihomo-linux-amd64-compatible-${BUILD}`,
    url: `https://github.com/vernesong/mihomo/releases/download/${RELEASE}/mihomo-linux-amd64-compatible-${BUILD}.gz`,
    gzSha256: '766747fdbab1dad40f9a8f22dee6a89cf6ebcd50c35b0e31659d174c9e3f5aaf',
    sha256: 'bf90fc608749991a00be389d62cc083485b02f659d558af10f81a9b42ed74765',
  },
  {
    name: `mihomo-linux-arm64-${BUILD}`,
    url: `https://github.com/vernesong/mihomo/releases/download/${RELEASE}/mihomo-linux-arm64-${BUILD}.gz`,
    gzSha256: 'dcad18c01c007ad0e1f74fc05f2a044689ecd0944d7ec838bed466f22922851b',
    sha256: 'e013cef25adfbc9774c66fefb3a8cbf29f558bcb989e840aa3ae4f58684cd122',
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
  {
    name: 'Model.bin',
    url: 'https://github.com/vernesong/mihomo/releases/download/LightGBM-Model/Model.bin',
    sha256: '23633022a815fb34e510befe1c176ba50af3ced48f08b172454f4cd6b8327788',
  },
  {
    name: 'ASN.mmdb',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb',
    sha256: 'ba7c4964c71b51d28dc23eefd5e4376801bf90472d26f766648aae003af9388e',
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
