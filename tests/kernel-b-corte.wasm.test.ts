/**
 * Regressão: o corte (vista de seção) não pode sair vazio com o Rust ligado (fatias A e B, como em produção). Compara com o TS puro:
 * as mesmas áreas de corte, e não vazio. Roda em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { multiArea } from '@hestia/geom';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { computeSection } from '../packages/engine/src/section.ts';
import { iniciarDespachoKernel, removerDespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
afterEach(() => undefined);
afterAll(() => removerDespachoKernel());

const area = (r: ReturnType<typeof computeSection>): number => multiArea(r.silhouette);
const LINHAS = {
  transversal: { a: { x: 6, y: -1 }, b: { x: 6, y: 13 }, depth: 6 },
  longitudinal: { a: { x: -1, y: 6 }, b: { x: 13, y: 6 }, depth: 6 },
  pelaParede: { a: { x: -1, y: 0 }, b: { x: 13, y: 0 }, depth: 6 },
};

describe.skipIf(!bytes)('corte com o Rust ligado', () => {
  for (const [nome, linha] of Object.entries(LINHAS)) {
    it(`corte ${nome}: não vazio e igual ao do TS`, async () => {
      const p = syntheticProject(2);
      const ts = computeSection(p, linha);
      expect(ts.cut.length).toBeGreaterThan(0);
      await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => bytes!); // o caminho de produção (v1 exigido)
      const rust = computeSection(p, linha);
      expect(rust.cut.length).toBe(ts.cut.length);
      expect(area(rust)).toBeGreaterThan(0);
      expect(area(rust)).toBeCloseTo(area(ts), 4);
      expect(rust.beyond.length).toBe(ts.beyond.length);
    });
  }
});

describe.skipIf(!bytes)('corte com o Rust ligado: exemplos do app', () => {
  for (const modelo of ['house2', 'house-premium', 'predio10'] as const) {
    it(`${modelo}: corte pelo meio do projeto não sai vazio`, async () => {
      const { buildTemplate } = await import('@hestia/model');
      await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => bytes!);
      const p = buildTemplate(modelo);
      const xs = Object.values(p.elements).flatMap((e) => ('a' in e ? [(e as { a: { x: number; y: number } }).a, (e as { b: { x: number; y: number } }).b] : []));
      const x0 = Math.min(...xs.map((v) => v.x));
      const x1 = Math.max(...xs.map((v) => v.x));
      const y0 = Math.min(...xs.map((v) => v.y));
      const y1 = Math.max(...xs.map((v) => v.y));
      const r = computeSection(p, { a: { x: (x0 + x1) / 2, y: y0 - 1 }, b: { x: (x0 + x1) / 2, y: y1 + 1 }, depth: y1 - y0 + 2 });
      expect(r.cut.length).toBeGreaterThan(0);
      expect(area(r)).toBeGreaterThan(0);
      const r2 = computeSection(p, { a: { x: x0 - 1, y: (y0 + y1) / 2 }, b: { x: x1 + 1, y: (y0 + y1) / 2 }, depth: x1 - x0 + 2 });
      expect(r2.cut.length).toBeGreaterThan(0);
    });
  }
});
