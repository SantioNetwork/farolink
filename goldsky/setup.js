#!/usr/bin/env node
/**
 * FaroLink — Goldsky Pipeline Activation Guide + Preflight Check
 *
 * Run this script to verify prerequisites before activating live Goldsky data.
 * Usage: node goldsky/setup.js [--activate]
 *
 * With --activate flag: runs the actual goldsky CLI commands (requires API key).
 * Without: preflight check only.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'farolink-core', 'farolink-indexer', '.env') });

const ACTIVATE = process.argv.includes('--activate');
const DATABASE_URL = process.env.DATABASE_URL;
const GOLD_SKY_API_KEY = process.env.GOLD_SKY_API_KEY;

console.log('='.repeat(60));
console.log('FaroLink — Goldsky Integration Setup');
console.log('='.repeat(60));

// ── Step 1: Preflight checks ──────────────────────────────────────────────────
console.log('\n[1] Preflight Checks');

// Check database URL
if (DATABASE_URL && DATABASE_URL.startsWith('postgresql://')) {
  console.log('  ✅ DATABASE_URL configured (Neon PostgreSQL)');
} else {
  console.log('  ❌ DATABASE_URL missing in farolink-indexer/.env');
  process.exit(1);
}

// Check Goldsky API key
if (GOLD_SKY_API_KEY && GOLD_SKY_API_KEY.length > 10) {
  console.log('  ✅ GOLD_SKY_API_KEY configured');
} else {
  console.log('  ⚠️  GOLD_SKY_API_KEY is empty');
  console.log('     → Get your key at: https://app.goldsky.com/dashboard/api-keys');
  console.log('     → Add to farolink-core/farolink-indexer/.env:');
  console.log('       GOLD_SKY_API_KEY=your_key_here');
  if (!ACTIVATE) {
    console.log('\n  ℹ️  GOLDSKY ARCHITECTURE NOTE:');
    console.log('     The API key is ONLY needed during pipeline deployment (goldsky CLI).');
    console.log('     The indexer service does NOT need it at runtime — it just polls');
    console.log('     the postgres tables that Goldsky writes to automatically.');
  }
}

// Check goldsky CLI
let goldskyInstalled = false;
try {
  const r = spawnSync('goldsky', ['--version'], { encoding: 'utf-8', shell: true });
  if (r.status === 0) {
    goldskyInstalled = true;
    console.log('  ✅ Goldsky CLI installed:', r.stdout.trim());
  } else {
    throw new Error('not found');
  }
} catch {
  console.log('  ⚠️  Goldsky CLI not installed');
  console.log('     → Run: npm install -g @goldskycom/cli');
}

// Check pipeline files exist
const pipelineFiles = ['liquidity.pipeline.yaml', 'spn.pipeline.yaml', 'kyc.pipeline.yaml'];
const goldskyDir = path.join(__dirname);
let allPipelinesExist = true;
for (const f of pipelineFiles) {
  const exists = fs.existsSync(path.join(goldskyDir, f));
  console.log('  ' + (exists ? '✅' : '❌') + ' goldsky/' + f);
  if (!exists) allPipelinesExist = false;
}

// ── Step 2: Activation instructions ──────────────────────────────────────────
console.log('\n[2] Activation Steps');

const steps = [
  {
    title: 'Install Goldsky CLI',
    cmd: 'npm install -g @goldskycom/cli',
    skip: goldskyInstalled,
  },
  {
    title: 'Login with API key',
    cmd: 'goldsky login',
    notes: 'Paste your API key from https://app.goldsky.com/dashboard/api-keys',
  },
  {
    title: 'Register Neon DB as Goldsky secret',
    cmd: `goldsky secret create FAROLINK_PG --value "${DATABASE_URL ? DATABASE_URL.slice(0, 40) + '...' : 'YOUR_NEON_URL'}"`,
    notes: 'Goldsky Mirror will push data INTO this database',
  },
  {
    title: 'Deploy liquidity pipeline',
    cmd: 'goldsky pipeline apply --path goldsky/liquidity.pipeline.yaml',
  },
  {
    title: 'Deploy SPN (cross-chain messages) pipeline',
    cmd: 'goldsky pipeline apply --path goldsky/spn.pipeline.yaml',
  },
  {
    title: 'Deploy KYC/compliance pipeline',
    cmd: 'goldsky pipeline apply --path goldsky/kyc.pipeline.yaml',
  },
  {
    title: 'Monitor pipeline health',
    cmd: 'goldsky pipeline status farolink-liquidity',
    notes: 'Once running, the indexer GoldskyConsumer auto-picks up data via watermark polling',
  },
];

steps.forEach((step, i) => {
  const skipLabel = step.skip ? ' [ALREADY DONE]' : '';
  console.log(`\n  Step ${i + 1}: ${step.title}${skipLabel}`);
  console.log(`  $ ${step.cmd}`);
  if (step.notes) console.log(`  Note: ${step.notes}`);
});

// ── Step 3: Activate (if --activate flag) ────────────────────────────────────
if (ACTIVATE) {
  console.log('\n[3] Running activation...');
  if (!GOLD_SKY_API_KEY) {
    console.log('❌ Cannot activate: GOLD_SKY_API_KEY not set');
    process.exit(1);
  }
  if (!goldskyInstalled) {
    console.log('❌ Cannot activate: Goldsky CLI not installed');
    process.exit(1);
  }

  try {
    // Register the PG secret
    console.log('\nRegistering FAROLINK_PG secret...');
    execSync(`goldsky secret create FAROLINK_PG --value "${DATABASE_URL}"`, { stdio: 'inherit' });

    // Deploy pipelines
    for (const f of pipelineFiles) {
      console.log(`\nDeploying ${f}...`);
      execSync(`goldsky pipeline apply --path goldsky/${f}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    }
    console.log('\n✅ All pipelines deployed! Goldsky will begin syncing data in ~2 minutes.');
    console.log('   Monitor: goldsky pipeline list');
  } catch (e) {
    console.error('❌ Activation failed:', e.message);
    process.exit(1);
  }
} else {
  console.log('\n' + '─'.repeat(60));
  console.log('Run with --activate to deploy pipelines:');
  console.log('  node goldsky/setup.js --activate');
  console.log('─'.repeat(60));
}

console.log('\n[Runtime Note]');
console.log('  The indexer (port :3001) is ALREADY running GoldskyConsumer.');
console.log('  It polls goldsky_liquidity / goldsky_spn / goldsky_kyc tables');
console.log('  every 2 seconds. Once pipelines push data, it propagates to');
console.log('  Redis and the Router automatically — no restart needed.');
console.log('');
