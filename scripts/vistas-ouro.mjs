#!/usr/bin/env node
/**
 * `npm run test:vistas-ouro` compara com o ouro gravado; `npm run test:vistas-ouro -- --gravar` regrava;
 * `npm run test:vistas-ouro -- --auditar` roda a auditoria da etapa 2a-1 (classifica as diferenças contra o ouro de `vistas/base`).
 * O vitest não repassa flags próprias ao teste, então as flags viram variáveis de ambiente aqui.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const gravar = args.includes('--gravar');
const auditar = args.includes('--auditar');
const resto = args.filter((a) => a !== '--gravar' && a !== '--auditar');
const r = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.vistas-ouro.config.ts', ...(auditar ? ['tests/vistas-ouro/auditoria.spec.ts'] : []), ...resto], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...(gravar ? { VISTAS_OURO_GRAVAR: '1' } : {}), ...(auditar ? { VISTAS_OURO_AUDITAR: '1' } : {}) },
});
process.exit(r.status ?? 1);
