/**
 * Massa conceitual, ficha D1 (docs/massa/PLANO.md, A.7 e A.10): os pisos gerados pela massa com o kernel REAL. M3 (torre torcida, 30 m) em três
 * níveis dá três pisos de área 64 (1e-3); a pétala M5 (12 cópias) dá um piso por cópia quando elas não se tocam. O serviço é o `ServicoMassa`
 * do motor sobre o `GerenciadorKernelV2` real, como em `kernel-massa-motor.wasm.test.ts`. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, comandoDerivarPisos, floorArea, isFloor, type Floor, type Project } from '@hestia/model';
import { ServicoMassa, derivarContornosPisosDaMassa } from '../packages/engine/src/index.ts';
import { projetoComMassas } from '../packages/engine/src/fixtureMassa.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const srv = (): ServicoMassa => new ServicoMassa(() => ger);

const pisosDo = (p: Project): Floor[] => Object.values(p.elements).filter(isFloor);

describe('massa D1: pisos gerados sobre o kernel real', () => {
  it.skipIf(!bytes)('M3 torre torcida em 3 níveis: 3 pisos, cada um com área 64 (1e-3), e um desfazer tira os três', () => {
    const p = projetoComMassas();
    const niveis = ['lv_2', 'lv_4', 'lv_6'];
    const d = derivarContornosPisosDaMassa(p, 'm3', niveis, undefined, srv());
    expect(d).not.toBeNull();
    expect(d!.semFatia).toEqual([]);
    const typeId = Object.keys(p.floorTypes)[0]!;
    const contornos = d!.porNivel.flatMap((n) =>
      n.poligonos.map((poli, k) => ({ id: `f_${n.nivelId}_${k}`, nivelId: n.nivelId, boundary: poli[0]!, holes: poli.slice(1) })),
    );
    expect(contornos).toHaveLength(3);
    const store = new ProjectStore(p);
    store.exec(comandoDerivarPisos(store.project, { massaId: 'm3', tipo: 'piso', typeId, contornos }));
    const fs = pisosDo(store.project);
    expect(fs).toHaveLength(3);
    for (const f of fs) expect(Math.abs(floorArea(f) - 64)).toBeLessThan(1e-3);
    store.undo();
    expect(pisosDo(store.project)).toHaveLength(0);
  });

  it.skipIf(!bytes)('M5 pétala (12 cópias) em 6 e 9 m: as cópias não se tocam, então dá 12 contornos por nível', () => {
    const p = projetoComMassas();
    const d = derivarContornosPisosDaMassa(p, 'm5p', ['lv_2', 'lv_3'], undefined, srv());
    expect(d).not.toBeNull();
    expect(d!.porNivel.map((n) => n.nivelId)).toEqual(['lv_2', 'lv_3']);
    for (const n of d!.porNivel) {
      expect(n.poligonos).toHaveLength(12);
      for (const poli of n.poligonos) expect(poli).toHaveLength(1);
    }
  });
});
