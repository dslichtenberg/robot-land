#!/usr/bin/env node
// Validate the plain embedded GLBs and regenerate manifest.json + validation-v2.json.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync('python3', [path.join(root, 'tools/check_v2_models.py')], {cwd: root, encoding: 'utf8'});
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
const findings = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/validation-v2.json'), 'utf8'));
process.exit(findings.some(f => f.severity === 'error') ? 1 : 0);
