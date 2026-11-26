#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, 'build');
const DIST_DIR = path.join(ROOT, 'dist');
const VENDOR_DIR = path.join(ROOT, 'vendor');
const CORE_BUILD = 'alpha-smart-1348c4d';
const GEO_FILES = {
  'geoip.metadb': '2eb4749bec1e1b9c269a7997ae63ee0f673cf4288349c9ee73a4e369d4d2915a',
  'geosite.dat': 'ae35a23f40a8e0486f0ed1723780ba6805a9f917a51ff30441eb2c41f688244c',
  'Model.bin': '23633022a815fb34e510befe1c176ba50af3ced48f08b172454f4cd6b8327788',
};
const CORE_FILES = {
  x86: {
    file: `mihomo-linux-amd64-compatible-${CORE_BUILD}`,
    sha256: 'bf90fc608749991a00be389d62cc083485b02f659d558af10f81a9b42ed74765',
  },
  arm: {
    file: `mihomo-linux-arm64-${CORE_BUILD}`,
    sha256: 'e013cef25adfbc9774c66fefb3a8cbf29f558bcb989e840aa3ae4f58684cd122',
  },
};

function parseArgs(argv) {
  const options = { archs: ['x86', 'arm'], frontend: true, sign: false, fnpack: process.env.FNPACK_BIN || '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skip-frontend') options.frontend = false;
    else if (arg === '--sign') options.sign = true;
    else if (arg.startsWith('--arch=')) options.archs = arg.slice(7).split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg === '--arch') options.archs = String(argv[++index] || '').split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg.startsWith('--fnpack=')) options.fnpack = arg.slice(9);
    else if (arg === '--help') {
      console.log('Usage: node scripts/build.mjs [--arch=x86,arm] [--skip-frontend] [--sign] [--fnpack=/path/to/fnpack]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  for (const arch of options.archs) {
    if (!CORE_FILES[arch]) throw new Error(`Unknown architecture: ${arch}`);
  }
  return options;
}

function sha256(file) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function findFnpack(explicit) {
  const candidates = [explicit, process.env.FNPACK_BIN, 'fnpack', path.join(ROOT, 'tools', 'fnpack')].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      try {
        const resolved = execFileSync('which', [candidate], { encoding: 'utf8' }).trim();
        if (resolved) return resolved;
      } catch {
        // Keep looking.
      }
    }
  }
  throw new Error('找不到 fnpack，请先安装并加入 PATH，或传 --fnpack=/path/to/fnpack');
}

function run(command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', cwd: ROOT, ...options });
}

function copyDir(source, target) {
  fs.cpSync(source, target, {
    recursive: true,
    dereference: false,
    filter(sourcePath) {
      const name = path.basename(sourcePath);
      return name !== '.DS_Store' && name !== '.git' && name !== 'node_modules';
    },
  });
}

function ensureBackendDeps() {
  const modules = path.join(ROOT, 'backend', 'node_modules', 'express');
  if (!fs.existsSync(modules)) {
    run('npm', ['--prefix', 'backend', 'install', '--omit=dev', '--no-audit', '--no-fund']);
  }
}

function stage(arch) {
  const stageDir = path.join(BUILD_DIR, `momo-${arch}`);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  copyDir(path.join(ROOT, 'packaging'), stageDir);

  const manifestPath = path.join(stageDir, 'manifest');
  const manifest = fs.readFileSync(manifestPath, 'utf8').replaceAll('@PLATFORM@', arch);
  fs.writeFileSync(manifestPath, manifest);

  const serverDir = path.join(stageDir, 'app', 'server');
  fs.mkdirSync(serverDir, { recursive: true });
  fs.cpSync(path.join(ROOT, 'backend', 'src'), path.join(serverDir, 'src'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'backend', 'package.json'), path.join(serverDir, 'package.json'));
  fs.cpSync(path.join(ROOT, 'backend', 'node_modules'), path.join(serverDir, 'node_modules'), {
    recursive: true,
    dereference: false,
  });
  fs.rmSync(path.join(serverDir, 'node_modules', '.bin'), { recursive: true, force: true });

  const webSource = path.join(ROOT, 'frontend', 'dist');
  if (!fs.existsSync(path.join(webSource, 'index.html'))) {
    throw new Error('前端尚未构建，请先运行 npm run build:frontend 或去掉 --skip-frontend');
  }
  fs.cpSync(webSource, path.join(stageDir, 'app', 'web'), { recursive: true });

  const coreDir = path.join(stageDir, 'app', 'core');
  fs.mkdirSync(coreDir, { recursive: true });
  const core = CORE_FILES[arch];
  const coreSource = path.join(VENDOR_DIR, core.file);
  if (!fs.existsSync(coreSource)) throw new Error(`缺少内核文件：${coreSource}`);
  const actualHash = sha256(coreSource);
  if (actualHash !== core.sha256) throw new Error(`内核校验失败：${core.file}\n期望 ${core.sha256}\n实际 ${actualHash}`);
  fs.copyFileSync(coreSource, path.join(coreDir, 'mihomo'));
  fs.chmodSync(path.join(coreDir, 'mihomo'), 0o755);
  for (const [file, expected] of Object.entries(GEO_FILES)) {
    const source = path.join(VENDOR_DIR, file);
    if (!fs.existsSync(source)) throw new Error(`缺少地理数据库：${source}`);
    if (sha256(source) !== expected) throw new Error(`地理数据库校验失败：${file}`);
    fs.copyFileSync(source, path.join(coreDir, file));
  }

  for (const entry of fs.readdirSync(path.join(stageDir, 'cmd'))) {
    fs.chmodSync(path.join(stageDir, 'cmd', entry), 0o755);
  }
  return stageDir;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureBackendDeps();
  if (options.frontend) run('npm', ['--prefix', 'frontend', 'run', 'build']);
  const fnpack = findFnpack(options.fnpack);
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const outputs = [];

  for (const arch of options.archs) {
    const stageDir = stage(arch);
    run(fnpack, ['build', ...(options.sign ? [] : ['--nosign'])], { cwd: stageDir });
    const generated = fs.readdirSync(stageDir).filter((name) => name.endsWith('.fpk'));
    if (generated.length !== 1) throw new Error(`${stageDir} 中没有生成唯一的 .fpk 文件`);
    const source = path.join(stageDir, generated[0]);
    const version = fs.readFileSync(path.join(stageDir, 'manifest'), 'utf8').match(/^version=(.+)$/m)?.[1] || '0.0.0';
    const target = path.join(DIST_DIR, `momo_${version}_${arch}.fpk`);
    fs.rmSync(target, { force: true });
    fs.renameSync(source, target);
    const size = fs.statSync(target).size;
    outputs.push({ arch, file: path.relative(ROOT, target), size });
    console.log(`\n✓ ${path.relative(ROOT, target)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  }

  const sums = outputs.map((output) => `${sha256(path.join(ROOT, output.file))}  ${path.basename(output.file)}`).join('\n');
  fs.writeFileSync(path.join(DIST_DIR, 'SHA256SUMS'), `${sums}\n`);
  console.log(`\n${sums}\n`);
}

main();
