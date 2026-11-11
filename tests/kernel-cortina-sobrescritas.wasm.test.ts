/**
 * Parede cortina, fase 2 (decisão 0056, §4.3 a §5.2): do MODELO ao Rust REAL. A cortina de 6 m x 3 m do `projetoComCortina` recebe, por comando do modelo,
 * uma linha extra em U (x = 1 m), a remoção do segmento de baixo da linha gerada em x = 3 m (funde duas células numa região) e um painel sólido na
 * célula de cima à esquerda. Confere as instâncias de montante e de painel e a área de vidro e sólida que o `quant_cortina` devolve, contra a conta
 * feita à mão. Roda só em `npm run test:wasm`.
 *
 * Conta à mão (montantes de 50 mm: o de borda fica embutido em [0, L], então tira 50 mm do lado; o interior tira 25 mm; cada lado com montante
 * devolve 12 mm de encaixe à área bruta):
 * - grade U: x = 0, 1 (extra), 1,5, 3, 4,5, 6; grade V: z = 0, 1,5, 3. Montantes: 6 verticais x 2 fileiras, menos o segmento removido = 11;
 *   3 horizontais x 5 colunas = 15; total 26.
 * - painéis: 10 células, com a região de x 1,5 a 4,5 na fileira de baixo fundida = 9 painéis: 8 de vidro e 1 sólido.
 * - vidro bruto: fileira de baixo (0,949 + 0,474 + 2,974 + 1,449) x 1,449 e fileira de cima (0,474 + 1,474 + 1,474 + 1,449) x 1,449 = 15,528933 m²;
 *   vidro visível: (0,925 + 0,45 + 2,95 + 1,425) x 1,425 + (0,45 + 1,45 + 1,45 + 1,425) x 1,425 = 14,998125 m²;
 *   sólido: célula de x 0 a 1 e z 1,5 a 3, bruta 0,949 x 1,449 = 1,375101 m², visível 0,925 x 1,425 = 1,318125 m².
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore } from '@hestia/model';
import { ServicoCortina, PAPEL_QUANT_CORTINA, cortinaAvisosDeGeometria } from '../packages/engine/src/index.ts';
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
});

/** Projeto com as três sobrescritas, feitas pelos comandos do modelo (não à mão). */
function projetoSobrescrito() {
  const s = new ProjectStore(projetoComCortina());
  s.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 1 } });
  s.exec({ type: 'removeSegment', wallId: 'ct1', line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, k: 0 });
  s.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 1, panelTypeId: 'pnl_solido_alu_4' });
  return s.project;
}

describe('parede cortina, fase 2: sobrescritas do modelo no Rust real', () => {
  it.skipIf(!bytes)('uma linha extra, um segmento removido e um painel sólido: montantes, painéis e área de vidro e sólida batem com a conta', () => {
    const srv = new ServicoCortina(() => ger);
    const p = projetoSobrescrito();
    const m = srv.malha(p)!;
    const porPapel = (papel: number) => m.instancias.filter((g) => g.papel === papel).reduce((s, g) => s + g.n, 0);
    // 26 montantes (11 verticais + 15 horizontais), 8 painéis de vidro e 1 sólido; três protótipos: montante, vidro e sólido.
    expect(porPapel(0)).toBe(26);
    expect(porPapel(1)).toBe(8);
    expect(porPapel(2)).toBe(1);
    expect(m.protos.size).toBe(3);

    const q = srv.quantidades(p)!;
    const soma = (papel: number, campo: 'area' | 'areaLiquida' | 'n') => q.filter((l) => l.papel === papel).reduce((s, l) => s + l[campo], 0);
    expect(soma(PAPEL_QUANT_CORTINA.painelVidro, 'n')).toBe(8);
    expect(soma(PAPEL_QUANT_CORTINA.painelSolido, 'n')).toBe(1);
    expect(soma(PAPEL_QUANT_CORTINA.painelVidro, 'area')).toBeCloseTo(15.528933, 5);
    expect(soma(PAPEL_QUANT_CORTINA.painelVidro, 'areaLiquida')).toBeCloseTo(14.998125, 5);
    expect(soma(PAPEL_QUANT_CORTINA.painelSolido, 'area')).toBeCloseTo(1.375101, 5);
    expect(soma(PAPEL_QUANT_CORTINA.painelSolido, 'areaLiquida')).toBeCloseTo(1.318125, 5);
    srv.encerrar();
  });

  it.skipIf(!bytes)('a sobrescrita chega ao kernel: o remapeamento não gera órfã nem região recusada, e os avisos 7 a 10 não aparecem', () => {
    const srv = new ServicoCortina(() => ger);
    const p = projetoSobrescrito();
    const avisos = srv.avisos(p)!;
    expect(avisos.filter((a) => a.codigo >= 7 && a.codigo <= 10)).toEqual([]);
    expect(cortinaAvisosDeGeometria(avisos).filter((i) => i.code.startsWith('cortina-override') || i.code === 'cortina-celula-nao-retangular')).toEqual([]);
    srv.encerrar();
  });

  it.skipIf(!bytes)('trocar só o painel de uma célula refaz a malha (cache por assinatura); a parede sem sobrescrita segue com 22 montantes', () => {
    const srv = new ServicoCortina(() => ger);
    const s = new ProjectStore(projetoComCortina());
    const antes = srv.malha(s.project)!;
    expect(antes.instancias.find((g) => g.papel === 2)).toBeUndefined();
    s.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 1, panelTypeId: 'pnl_solido_alu_4' });
    const depois = srv.malha(s.project)!;
    expect(depois).not.toBe(antes);
    expect(depois.instancias.find((g) => g.papel === 2)!.n).toBe(1);
    expect(depois.instancias.filter((g) => g.papel === 0).reduce((t, g) => t + g.n, 0)).toBe(22);
    srv.encerrar();
  });
});
