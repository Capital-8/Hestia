/**
 * Terreno, ficha U2, sobre o Rust REAL: a tabela "Terreno: corte e aterro" (T5 e T7) e o mapa de corte e aterro na planta. A tabela e o mapa só
 * organizam e pintam o que o kernel devolve; nenhum volume é calculado em TS. Roda só na suíte WASM
 * (`npx vitest run -c vitest.wasm.config.ts tests/kernel-terreno-tabela.wasm.test.ts`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultUnits } from '../packages/model/src/index.ts';
import { buildTerrenoSchedule, definirGerenciadorDoTerreno, definirMapaCorteAterro, projetoTerreno, resolveLevel, servicoTerreno } from '../packages/engine/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { buildPlanGeometry, type PlanInput } from '../packages/render/src/plan/build.ts';
import { COR_ATERRO, COR_CORTE } from '../packages/render/src/plan/terrenoMapa.ts';
import { LIGHT } from '../packages/render/src/plan/types.ts';
import { csvDoTerreno } from '../apps/web/src/ui/dialogs/TerrenoScheduleDialog.tsx';

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
  definirGerenciadorDoTerreno(() => ger);
});
afterAll(() => {
  definirMapaCorteAterro(false);
  definirGerenciadorDoTerreno(() => null);
});

const planta = (nome: 'T5' | 'T7') => {
  const p = projetoTerreno(nome);
  const input: PlanInput = {
    project: p, levelId: 'lv_0', resolved: resolveLevel(p, 'lv_0', new Map()), below: null, viewport: { cx: 10, cy: 10, zoom: 20, width: 800, height: 600 },
    theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false,
  };
  return buildPlanGeometry(input).fills.map((f) => f.color);
};

describe('tabela de corte e aterro com o kernel real', () => {
  it.skipIf(!bytes)('T5: corte entre 200 e 200,6, aterro 0, saldo = corte, totais no rodapé do CSV na unidade do projeto', () => {
    const p = projetoTerreno('T5');
    const s = buildTerrenoSchedule(p, 'pt');
    expect(s.pronto).toBe(true);
    expect(s.rows.map((r) => r.tipo)).toEqual(['regiao', 'terreno']);
    for (const r of s.rows) {
      expect(r.volumeCorte).toBeGreaterThan(200);
      expect(r.volumeCorte).toBeLessThan(200.6);
      expect(Math.abs(r.volumeAterro)).toBeLessThan(1e-9);
      expect(r.saldo).toBeCloseTo(r.volumeCorte - r.volumeAterro, 12);
    }
    expect(s.totais.volumeCorte).toBe(s.rows[1]!.volumeCorte);
    expect(s.totais.saldo).toBeCloseTo(s.totais.volumeCorte, 9);
    expect(s.totais.areaPlanta).toBeCloseTo(400, 6);
    const linhas = csvDoTerreno(s, defaultUnits('pt'), 'pt').trimEnd().split('\r\n');
    expect(linhas[0]).toContain('Corte (m³)');
    expect(linhas.at(-1)).toMatch(/^Total do projeto;;;400,00;[\d,]+;200,\d{3};0,000;200,\d{3}$/);
  });

  it.skipIf(!bytes)('T7: aterro entre 100 e 100,4, corte 0 e saldo negativo', () => {
    const s = buildTerrenoSchedule(projetoTerreno('T7'), 'pt');
    expect(s.pronto).toBe(true);
    for (const r of s.rows) {
      expect(r.volumeAterro).toBeGreaterThan(100);
      expect(r.volumeAterro).toBeLessThan(100.4);
      expect(Math.abs(r.volumeCorte)).toBeLessThan(1e-6);
      expect(r.saldo).toBeLessThan(0);
    }
    expect(s.totais.saldo).toBeLessThan(0);
  });
});

describe('mapa de corte e aterro com o kernel real', () => {
  it.skipIf(!bytes)('T5: só vermelho na planta; T7: só azul; desligado: nenhum dos dois', () => {
    definirMapaCorteAterro(true);
    const t5 = planta('T5');
    expect(t5.filter((c) => c === COR_CORTE)).toHaveLength(1);
    expect(t5).not.toContain(COR_ATERRO);
    const t7 = planta('T7');
    expect(t7.filter((c) => c === COR_ATERRO)).toHaveLength(1);
    expect(t7).not.toContain(COR_CORTE);
    definirMapaCorteAterro(false);
    expect(planta('T5')).not.toContain(COR_CORTE);
    expect(planta('T7')).not.toContain(COR_ATERRO);
  });

  it.skipIf(!bytes)('os triângulos do kernel: T5 só de corte, T7 só de aterro', () => {
    const t5 = servicoTerreno().mapaCorteAterro(projetoTerreno('T5'), 'lv_0')!;
    expect(t5.length).toBeGreaterThan(0);
    expect(t5.every((g) => g.tipo === 'corte')).toBe(true);
    const t7 = servicoTerreno().mapaCorteAterro(projetoTerreno('T7'), 'lv_0')!;
    expect(t7.length).toBeGreaterThan(0);
    expect(t7.every((g) => g.tipo === 'aterro')).toBe(true);
  });
});
