/**
 * Parede cortina, fase 2: subelementos (Tab, clique e destaque) lidos da grade do Rust REAL (consulta 100). A cortina `ct1` do `projetoComCortina` tem
 * grade 4 x 2 (três linhas U geradas, uma V gerada); com uma linha extra em U (x = 1 m), a lista ganha a extra como `{ added }`. Roda só em
 * `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore } from '@hestia/model';
import { definirGerenciadorDaCortina, proximoSubelemento, subelementosDaCortina } from '../packages/engine/src/index.ts';
import { projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
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
  if (ger) definirGerenciadorDaCortina(() => ger);
});

afterAll(() => {
  definirGerenciadorDaCortina(() => null);
});

describe('parede cortina, fase 2: subelementos no Rust real', () => {
  it.skipIf(!bytes)('grade 4 x 2: 4 linhas internas, 22 segmentos (bordas inclusas) e 8 células; o Tab dá a volta completa', () => {
    const par = subelementosDaCortina(new ProjectStore(projetoComCortina()).project, 'ct1');
    expect(par).not.toBeNull();
    const kinds = par!.itens.map((it) => it.sub.kind);
    expect(kinds.filter((k) => k === 'line')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'segment')).toHaveLength(22);
    expect(kinds.filter((k) => k === 'cell')).toHaveLength(8);
    expect(par!.L).toBeCloseTo(6, 9);
    expect(par!.H).toBeCloseTo(3, 9);
    // Volta ao início depois de percorrer todos os itens e a própria parede.
    let atual = null;
    for (let k = 0; k < par!.itens.length; k++) atual = proximoSubelemento(par!, atual);
    expect(proximoSubelemento(par!, atual)).toBeNull();
  });

  it.skipIf(!bytes)('linha gerada tem índice entre as geradas; a linha extra vira { added } com a posição da extra', () => {
    const s = new ProjectStore(projetoComCortina());
    s.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 1 } });
    const par = subelementosDaCortina(s.project, 'ct1');
    expect(par).not.toBeNull();
    const linhas = par!.itens.filter((it) => it.sub.kind === 'line');
    expect(linhas).toHaveLength(5);
    const extra = linhas.find((it) => it.sub.kind === 'line' && 'added' in it.sub.line);
    expect(extra?.sub.kind === 'line' && extra.sub.line).toEqual({ added: 'x1' });
    expect(extra?.geo).toEqual({ kind: 'line', axis: 'u', pos: 1 });
    // As geradas são 1, 2, 3 e a V; a extra não conta no índice (o modelo chama de `n` as geradas + 1).
    const geradasU = linhas.flatMap((it) => (it.sub.kind === 'line' && 'axis' in it.sub.line && it.sub.line.axis === 'u' ? [it.sub.line] : []));
    expect(geradasU.map((r) => r.index)).toEqual([1, 2, 3]);
    expect(geradasU.every((r) => r.n === 4)).toBe(true);
  });
});
