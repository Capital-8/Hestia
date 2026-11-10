#!/usr/bin/env node
/**
 * `npm run test:vistas-ouro` compara com o ouro gravado; `npm run test:vistas-ouro -- --gravar` regrava.
 * O vitest não repassa flags próprias ao teste, então a flag vira `VISTAS_OURO_GRAVAR=1` aqui.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const gravar = args.includes('--gravar');
const resto = args.filter((a) => a !== '--gravar');
const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.vistas-ouro.config.ts', ...resto], {
  stdio: 'inherit',
  env: { ...process.env, ...(gravar ? { VISTAS_OURO_GRAVAR: '1' } : {}) },
});
process.exit(r.status ?? 1);
