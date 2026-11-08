/**
 * Tempo das quantidades (Rust contra o TypeScript) nas sementes 1 a 5 do estresse B1. Não afirma nada sobre o tempo: imprime a mediana de
 * várias rodadas por semente, para acompanhar a otimização. Roda em `npm run test:wasm` (ou isolado) com `KERNEL_WASM_PATH` apontando o wasm.
 */
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { migrateProject, type Project } from '@hestia/model';
import { beforeAll, describe, it } from 'vitest';
import { quantifyCeilings, quantifyCeilingsTs } from '../packages/engine/src/ceilingQuantities.ts';
import { quantifyFloors, quantifyFloorsTs } from '../packages/engine/src/floorQuantities.ts';
import { instalarDespachoKernel, removerDespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { quantifyLevel, quantifyLevelTs } from '../packages/engine/src/quantities.ts';
import { resolveLevelTs } from '../packages/engine/src/resolve.ts';
import { quantifySlabs, quantifySlabsTs } from '../packages/engine/src/slabQuantities.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
beforeAll(async () => {
  if (bytes) ger = await GerenciadorKernelV2.dosBytes(bytes).catch(() => null);
});

const mediana = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
const RODADAS = 3;

describe.skipIf(!bytes || !process.env['KERNEL_TEMPO'])('tempo das quantidades', () => {
  for (const semente of (process.env['SEMENTES'] ?? '1,2,3,4,5').split(',').map(Number)) {
    it(`semente ${semente}`, () => {
      if (!ger) return;
      const novo = (): Project => migrateProject(JSON.parse(JSON.stringify(projetoDeEstresseB1(semente, { paredesB2: true, anexos: true }))));
      const base = novo();
      const ids = base.levels.map((l) => l.id);
      const medir = (p: Project, rust: boolean): number => {
        const t = performance.now();
        for (const id of ids) {
          if (rust) {
            quantifyLevel(p, resolveLevelTs(p, id));
            quantifyFloors(p, id);
            quantifySlabs(p, id);
            quantifyCeilings(p, id);
          } else {
            quantifyLevelTs(p, resolveLevelTs(p, id));
            quantifyFloorsTs(p, id);
            quantifySlabsTs(p, id);
            quantifyCeilingsTs(p, id);
          }
        }
        return performance.now() - t;
      };
      const ts: number[] = [];
      const rs: number[] = [];
      for (let i = 0; i < RODADAS + 1; i++) {
        removerDespachoKernel();
        const a = novo();
        ts.push(medir(a, false));
        instalarDespachoKernel({ gerenciador: () => ger, config: () => ({ fatiaA: false, fatiaB: true, sombra: false }) });
        const b = novo();
        rs.push(medir(b, true));
      }
      removerDespachoKernel();
      ts.shift();
      rs.shift();
      // eslint-disable-next-line no-console
      console.log(`[TEMPO] semente ${semente}: ${ids.length} níveis, TS ${mediana(ts).toFixed(1)} ms, Rust ${mediana(rs).toFixed(1)} ms, razão ${(mediana(rs) / mediana(ts)).toFixed(2)}`);
    }, 600_000);
  }
});
