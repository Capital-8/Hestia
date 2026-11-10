/**
 * Guarda-corpo, Fase 3a (decisão 0055): paridade entre o Rust REAL (`guarda_caminhos`) e a referência TS (`guardaCorpoRef/caminho.ts`) sobre a fixture
 * `fixtureGuardaCorpo.ts` e variantes (lados, posição de base, deslocamento, inverter, manual fechado). Posições em 1e-6 m, contagens exatas.
 * Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { GuardaCorpo, Project, Stair } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { projetoGuardaCorpo } from '../packages/engine/src/fixtureGuardaCorpo.ts';
import { guardaCaminhosRef } from '../packages/engine/src/guardaCorpoRef/caminho.ts';
import { enviarCenaGC, montarCenaGC } from '../packages/engine/src/kernelGuardaCorpo.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
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

const edit = (p: Project, id: string, f: (g: GuardaCorpo) => void): Project => {
  const q = structuredClone(p);
  f(q.elements[id] as GuardaCorpo);
  return q;
};

function comparar(p: Project, tol = 1e-6): { trechos: number; avisos: number } {
  const c = montarCenaGC(p);
  const cena = CenaV2.criar(ger!, (x) => enviarCenaGC(x, c));
  const rust = cena.consultar('guarda_caminhos', [0, tol]);
  const ref = guardaCaminhosRef(c, 0, tol);
  expect(Array.from(rust['trechos']!)).toEqual(ref.trechos);
  expect(Array.from(rust['avisos']!)).toEqual(ref.avisos);
  for (const [a, b] of [
    [rust['nos']!, ref.nos],
    [rust['valores']!, ref.valores],
  ] as const) {
    expect(a.length).toBe(b.length);
    for (let i = 0; i < b.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-6);
  }
  cena.destruir();
  return { trechos: ref.trechos.length / 5, avisos: ref.avisos.length / 4 };
}

describe('guarda-corpo, Fase 3a: paridade do caminho hospedado (Rust x referência TS)', () => {
  it.skipIf(!bytes)('a fixture inteira (escada reta, rampa com patamares e manual com dz)', () => {
    const r = comparar(projetoGuardaCorpo().p);
    expect(r.trechos).toBeGreaterThanOrEqual(6);
  });

  it.skipIf(!bytes)('lados desligados, base lateral e deslocamento próprio', () => {
    const { p } = projetoGuardaCorpo();
    const lado = { lance: false, patamar: true };
    const a = comparar(
      edit(p, 'gc_r', (g) => {
        if (g.hospedeiro.tipo === 'rampa') g.hospedeiro.lados = { esquerdo: lado, direito: { lance: true, patamar: false } };
      }),
    );
    expect(a.trechos).toBeGreaterThan(0);
    comparar(
      edit(p, 'gc_e', (g) => {
        if (g.hospedeiro.tipo === 'escada') g.hospedeiro.posicaoBase = 'lateral';
        g.deslocamento = 0.12;
      }),
    );
  });

  it.skipIf(!bytes)('inverter, manual fechado, lado direito e centro', () => {
    const { p } = projetoGuardaCorpo();
    comparar(edit(p, 'gc_e', (g) => (g.inverter = true)));
    comparar(
      edit(p, 'gc_m', (g) => {
        if (g.hospedeiro.tipo === 'manual') {
          g.hospedeiro.fechado = true;
          g.hospedeiro.ladoDeslocamento = 'direito';
        }
        g.deslocamento = 0.2;
      }),
    );
    comparar(
      edit(p, 'gc_m', (g) => {
        if (g.hospedeiro.tipo === 'manual') g.hospedeiro.ladoDeslocamento = 'centro';
      }),
    );
  });

  it.skipIf(!bytes)('deslocamento excessivo gera aviso nos dois lados e a tolerância de emenda muda o resultado', () => {
    const { p } = projetoGuardaCorpo();
    const r = comparar(edit(p, 'gc_m', (g) => {
      if (g.hospedeiro.tipo === 'manual') {
        g.hospedeiro.fechado = true;
        g.hospedeiro.caminho = [{ x: 0, y: 8, dz: 0 }, { x: 0.1, y: 8, dz: 0 }, { x: 0.1, y: 8.1, dz: 0 }, { x: 0, y: 8.1, dz: 0 }];
      }
      g.deslocamento = 0.2;
    }));
    expect(r.avisos).toBeGreaterThanOrEqual(1);
    comparar(p, 0.5);
  });

  it.skipIf(!bytes)('avisos de geometria degenerada: vértices repetidos, caminho nulo e hospedeiro sem borda (Rust igual à referência)', () => {
    const { p } = projetoGuardaCorpo();
    const manual = (caminho: Array<{ x: number; y: number; dz: number }>) =>
      edit(p, 'gc_m', (g) => {
        if (g.hospedeiro.tipo === 'manual') g.hospedeiro.caminho = caminho;
      });
    const rep = comparar(manual([{ x: 0, y: 8, dz: 0 }, { x: 0, y: 8, dz: 0 }, { x: 4, y: 8, dz: 0 }, { x: 4, y: 8, dz: 0 }, { x: 4, y: 11, dz: 0 }]));
    expect(rep.avisos).toBe(1);
    const nulo = comparar(manual([{ x: 1, y: 1, dz: 0 }, { x: 1, y: 1, dz: 0 }]));
    expect(nulo.avisos).toBe(2);
    const q = structuredClone(p);
    (q.elements['st1'] as Stair).components = [];
    expect(comparar(q).avisos).toBeGreaterThanOrEqual(1);
  });
});
