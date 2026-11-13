/**
 * Parede cortina na exportação (decisão 0056, fase 6) sobre o Rust REAL: a malha e os quantitativos do kernel viram `IFCCURTAINWALL` com
 * `IFCMEMBER`, `IFCPLATE` e `IFCMAPPEDITEM`, e a planta vira as camadas `CORTINA-*` do DXF. Sem kernel, a mesma cortina sai como `IFCWALL` com
 * aviso. Usa a fixture do teste de integração (6 m x 3 m, 4 x 2 células, 22 montantes e 8 painéis de vidro). Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { definirGerenciadorDaCortina, servicoCortina } from '../packages/engine/src/index.ts';
import { projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { ifcGeometryOf, projectIfcComAvisos } from '../apps/web/src/editor/ifcExport.ts';
import { planDxf } from '../apps/web/src/editor/dxfExport.ts';

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

afterAll(() => {
  servicoCortina().encerrar();
  definirGerenciadorDaCortina(() => null);
});

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const DATA = new Date('2026-01-01T00:00:00Z');

describe('cortina do kernel na exportação IFC', () => {
  it.skipIf(!bytes)('a geometria do kernel entra por protótipo e instância: 2 protótipos, 30 peças, quantitativos do motor', () => {
    definirGerenciadorDaCortina(() => ger);
    const p = projetoComCortina();
    const geo = ifcGeometryOf(p);
    expect(geo.curtains).toBeDefined();
    expect(geo.curtains!.prototypes).toHaveLength(2);
    expect(geo.curtains!.walls).toHaveLength(1);
    const cortina = geo.curtains!.walls[0]!;
    expect(cortina.wallId).toBe('ct1');
    expect(cortina.instances).toHaveLength(30);
    // A cortina não cai em `walls`: a geometria dela é a do kernel.
    expect(geo.walls.some((w) => w.wallId === 'ct1')).toBe(false);
    // Quantitativos vêm do motor (quant_cortina), não de uma soma no TS.
    const quant = servicoCortina().quantidades(p)!.filter((q) => q.wallId === 'ct1');
    const vidro = quant.filter((q) => q.papel === 10).reduce((s, q) => s + q.areaLiquida, 0);
    expect(cortina.quantities.glassArea).toBeCloseTo(vidro, 6);
    expect(cortina.quantities.length).toBeCloseTo(6, 6);
    expect(cortina.quantities.grossArea).toBeCloseTo(18, 6);
  });

  it.skipIf(!bytes)('a matriz do kernel é a da peça: a coluna Z de um montante vertical é o comprimento do segmento (3 m / 2 fileiras = 1,5 m)', () => {
    definirGerenciadorDaCortina(() => ger);
    const cortina = ifcGeometryOf(projetoComCortina()).curtains!.walls[0]!;
    // Montante vertical: a coluna 2 (o eixo Z do protótipo, de z em [0, 1]) aponta para cima com o comprimento do segmento, uma peça por fileira
    // de células (5 linhas verticais x 2 fileiras). Os horizontais têm a componente Z dessa coluna nula (também medem 1,5 m, mas deitados).
    const verticais = cortina.instances.filter((i) => Math.abs(i.matrix[10]! - 1.5) < 1e-4);
    expect(verticais).toHaveLength(10);
  });

  it.skipIf(!bytes)('o texto IFC tem 22 montantes, 8 painéis de vidro (CURTAIN_PANEL), 1 cortina e os mapas por protótipo, sem aviso', () => {
    definirGerenciadorDaCortina(() => ger);
    const { texto, avisos } = projectIfcComAvisos(projetoComCortina(), DATA, 'pt');
    expect(count(texto, 'IFCCURTAINWALL')).toBe(1);
    expect(count(texto, 'IFCMEMBER')).toBe(22);
    expect(count(texto, 'IFCPLATE')).toBe(8);
    expect(count(texto, 'IFCREPRESENTATIONMAP')).toBe(2);
    expect(count(texto, 'IFCMAPPEDITEM')).toBe(30);
    // A parede comum da fixture (w1) segue como IFCWALL; a cortina não.
    expect(count(texto, 'IFCWALL')).toBe(1);
    expect(avisos).toEqual([]);
  });

  it.skipIf(!bytes)('sem kernel, a mesma cortina sai como IFCWALL e o aviso aparece', () => {
    definirGerenciadorDaCortina(() => null);
    const { texto, avisos } = projectIfcComAvisos(projetoComCortina(), DATA, 'pt');
    expect(count(texto, 'IFCCURTAINWALL')).toBe(0);
    expect(count(texto, 'IFCWALL')).toBe(2);
    expect(avisos).toHaveLength(1);
  });
});

describe('cortina do kernel no DXF', () => {
  it.skipIf(!bytes)('a planta de nível médio tem as camadas CORTINA-MONTANTE e CORTINA-VIDRO, e a ESQUADRIA registrada', () => {
    definirGerenciadorDaCortina(() => ger);
    const txt = planDxf(projetoComCortina(), 'lv_0');
    expect(txt).toContain('AC1015');
    expect(txt).toContain('CORTINA-MONTANTE');
    expect(txt).toContain('CORTINA-VIDRO');
    expect(txt).toContain('CORTINA-ESQUADRIA');
  });

  it.skipIf(!bytes)('sem kernel, a planta não tem camada de cortina', () => {
    definirGerenciadorDaCortina(() => null);
    const txt = planDxf(projetoComCortina(), 'lv_0');
    expect(txt).not.toContain('CORTINA-');
  });
});
