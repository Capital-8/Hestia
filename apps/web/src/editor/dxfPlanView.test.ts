import { describe, expect, it } from 'vitest';
import { ProjectStore, buildTemplate } from '@hestia/model';
import { buildDxfBatch, dxfBatchTargetsOf } from './dxfBatch.ts';
import type { DxfBatchOptions } from './dxfBatch.types.ts';
import { dxfBatchRenderers } from './dxfBatchRenderers.ts';
import { planDxf } from './dxfExport.ts';

/*
 * Plantas de disciplina no DXF e no lote (decisão 0060 §7, etapa 2.4). Projeto: o modelo de exemplo "house2" (lv_0
 * "Térreo" e lv_1). Referências LITERAIS: a planta padrão e o lote de antes foram lidos UMA vez do código anterior à
 * etapa (comprimento e FNV-1a do texto).
 */

const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

const OPCOES: DxfBatchOptions = { units: 'm', showRoofProjection: true, prefix: '', pattern: '', lang: 'pt' };

function projeto(): ProjectStore {
  return new ProjectStore(buildTemplate('house2'));
}

/** Planta de disciplina "Estrutura" no térreo, com escala 1:50 e as paredes ocultas (Hide in View da própria planta). */
function comEstrutura(s: ProjectStore): void {
  s.exec({ type: 'addPlanView', plan: { id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' } });
  s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50 } });
  s.exec({ type: 'updatePlanView', id: 'pv1', patch: { hidden: { categories: ['wall'] } } });
}

describe('DXF das plantas padrão: iguais às de antes', () => {
  it('planDxf da planta padrão e o lote de plantas não mudam', () => {
    const p = projeto().project;
    const terreo = planDxf(p, 'lv_0');
    expect([terreo.length, fnv(terreo)]).toEqual([164201, '1d4c1256']);
    const pav2 = planDxf(p, 'lv_1');
    expect([pav2.length, fnv(pav2)]).toEqual([4575, 'dff6b3af']);
    const alvos = dxfBatchTargetsOf(p).filter((t) => t.kind === 'plan').map((t) => t.key);
    expect(alvos).toEqual(['plan:lv_0', 'plan:lv_1']);
    const lote = buildDxfBatch(p, alvos, OPCOES, dxfBatchRenderers);
    expect(lote.files.map((f) => f.path)).toEqual(['PLANTAS/PLANTA-Terreo.dxf', 'PLANTAS/PLANTA-Pavimento-2.dxf', 'manifest.csv', 'LEIA-ME.txt']);
    expect(fnv(lote.manifest)).toBe('eb7e16e6');
    expect(lote.skipped).toEqual([]);
  });
});

describe('plantas de disciplina no DXF e no lote', () => {
  it('o lote lista a planta de disciplina com a chave pv: logo depois da padrão do nível', () => {
    const s = projeto();
    comEstrutura(s);
    expect(dxfBatchTargetsOf(s.project).filter((t) => t.kind === 'plan').map((t) => t.key)).toEqual(['plan:lv_0', 'pv:pv1', 'plan:lv_1']);
  });

  it('o lote usa a escala e o nome da planta de disciplina no arquivo e no manifest', () => {
    const s = projeto();
    comEstrutura(s);
    const lote = buildDxfBatch(s.project, ['pv:pv1', 'plan:lv_0'], OPCOES, dxfBatchRenderers);
    expect(lote.files.map((f) => f.path)).toEqual(['PLANTAS/PLANTA-Terreo.dxf', 'PLANTAS/PLANTA-Estrutura.dxf', 'manifest.csv', 'LEIA-ME.txt']);
    // A ordem do lote é a da lista de alvos (planta padrão do nível, depois a de disciplina), não a da seleção.
    const linhas = lote.manifest.split('\r\n');
    expect(linhas[1]!.startsWith('PLANTAS/PLANTA-Terreo.dxf;')).toBe(true);
    expect(linhas[1]!.endsWith(';Térreo;1:100;')).toBe(true);
    expect(linhas[2]!.startsWith('PLANTAS/PLANTA-Estrutura.dxf;')).toBe(true);
    expect(linhas[2]!.endsWith(';Estrutura;Térreo;1:50;')).toBe(true);
  });

  it('o DXF da planta de disciplina sai com a ocultação dela (paredes fora) e é menor que o da padrão', () => {
    const s = projeto();
    comEstrutura(s);
    const padrao = planDxf(s.project, 'lv_0');
    const estrutura = planDxf(s.project, 'lv_0', true, undefined, 'pt', 'pv1');
    expect(estrutura).not.toBe(padrao);
    expect(estrutura.length).toBeLessThan(padrao.length);
    expect(fnv(padrao)).toBe('1d4c1256');
  });

  it('anotações: a planta de disciplina sai só com as dela; a padrão só com as do nível', () => {
    const s = projeto();
    comEstrutura(s);
    s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 'tn', at: { x: 1, y: 1 }, text: 'NOTA NIVEL', height: 3, rotation: 0 } });
    s.exec({ type: 'addText', levelId: 'lv_0', planId: 'pv1', text: { id: 'tp', at: { x: 1, y: 2 }, text: 'NOTA ESTRUTURA', height: 3, rotation: 0 } });
    const padrao = planDxf(s.project, 'lv_0');
    const estrutura = planDxf(s.project, 'lv_0', true, undefined, 'pt', 'pv1');
    expect(padrao).toContain('NOTA NIVEL');
    expect(padrao).not.toContain('NOTA ESTRUTURA');
    expect(estrutura).toContain('NOTA ESTRUTURA');
    expect(estrutura).not.toContain('NOTA NIVEL');
  });

  it('planId que não resolve no nível sai como a planta padrão', () => {
    const s = projeto();
    expect(planDxf(s.project, 'lv_0', true, undefined, 'pt', 'pv_gone')).toBe(planDxf(s.project, 'lv_0'));
  });
});
