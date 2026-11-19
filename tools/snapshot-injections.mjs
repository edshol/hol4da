#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * Snapshot the LIVE /injections.json into Git so every change to authored JS
 * is kept as a readable diff (who published is in the EDS publish log / document history).
 *
 * Usage: LIVE_ORIGIN=https://main--<site>--<org>.aem.live node tools/snapshot-injections.mjs
 * Output: injections-history/injections.json and injections-history/scripts/<ID>.js
 */
import {
  mkdir, readdir, rm, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

const origin = process.env.LIVE_ORIGIN;
if (!origin) {
  console.error('LIVE_ORIGIN is required');
  process.exit(1);
}

const OUT = 'injections-history';
const SCRIPTS = join(OUT, 'scripts');
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const HEADER_KEYS = ['ID', 'Enabled', 'Path', 'Exclude', 'Device', 'Timing', 'Start', 'End', 'Owner', 'Ticket', 'Note'];

const resp = await fetch(new URL('/injections.json', origin));
if (!resp.ok) {
  console.error(`fetch failed: ${resp.status}`);
  process.exit(1);
}
const json = await resp.json();
const rows = (json.scripts?.data || json.data || [])
  .map((row) => ({ ...row, id: `${row.ID || ''}`.trim() }))
  .filter((row) => SAFE_ID.test(row.id));

await mkdir(SCRIPTS, { recursive: true });
await writeFile(join(OUT, 'injections.json'), `${JSON.stringify(json, null, 2)}\n`);

await Promise.all(rows.map((row) => {
  const header = HEADER_KEYS
    .filter((k) => row[k])
    .map((k) => ` * ${k}: ${`${row[k]}`.replace(/\*\//g, '* /')}`)
    .join('\n');
  return writeFile(join(SCRIPTS, `${row.id}.js`), `/*\n${header}\n */\n${row.Script || ''}\n`);
}));

const keep = new Set(rows.map((row) => `${row.id}.js`));
const stale = (await readdir(SCRIPTS)).filter((file) => !keep.has(file));
await Promise.all(stale.map((file) => rm(join(SCRIPTS, file))));
console.log(`snapshot: ${keep.size} injection(s), removed ${stale.length}`);
