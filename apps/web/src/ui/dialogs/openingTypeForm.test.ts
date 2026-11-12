import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, ProjectStore, buildTemplate, createEmptyProject, makeWall, type Opening, type OpeningType } from '@hestia/model';
import { buildOpeningSchedule, frameOfWall, openingGeometry, type OpeningGeometry, type OpeningScheduleRow } from '@hestia/engine';
import { openingPieces, type OpeningPiece } from '@hestia/render';
import {
  alternarAcabamento,
  alternarSidelight,
  alternarTransom,
  applyFamily,
  applyVariant,
  defaultTransomHeight,
  familyOptionsFor,
  leavesChoicesFor,
  leavesLabel,
  newOpeningTypeFromFamily,
  openingVariants,
} from './openingTypeForm.ts';

const store = (): ProjectStore => new ProjectStore(buildTemplate('house2'));

describe('famílias de abertura no formulário', () => {
  it('oferece só as famílias do tipo, na ordem da interface', () => {
    expect(familyOptionsFor('door').map((f) => f.id)).toEqual(['door_swing', 'door_double', 'door_sliding', 'door_pivot', 'door_dblact', 'door_pocket', 'door_bifold', 'door_accordion', 'door_garage', 'door_void']);
    expect(familyOptionsFor('window').map((f) => f.id)).toEqual(['window_fixed', 'window_hinged', 'window_tilt', 'window_casement', 'window_sliding', 'window_hung', 'window_pivot', 'window_louver', 'window_void']);
  });

  it('rótulo de folhas e opções aceitas pela família (janela de correr: 2 a 4)', () => {
    expect(leavesLabel(0)).toBe('Vão livre (sem folha)');
    expect(leavesLabel(1)).toBe('1 folha');
    expect(leavesLabel(2)).toBe('2 folhas');
    expect(leavesLabel(3)).toBe('3 folhas');
    const correr = familyOptionsFor('window').find((f) => f.id === 'window_sliding')!;
    expect(leavesChoicesFor(correr).map((o) => o.value)).toEqual([2, 3, 4]);
    const fixa = familyOptionsFor('window').find((f) => f.id === 'window_fixed')!;
    expect(leavesChoicesFor(fixa)).toHaveLength(1);
  });

  it('escolher a família grava o símbolo e a 1ª contagem de folhas aceita', () => {
    const base = newOpeningTypeFromFamily(familyOptionsFor('door').find((f) => f.id === 'door_swing')!);
    const correr = familyOptionsFor('door').find((f) => f.id === 'door_sliding')!;
    const next = applyFamily(base, correr);
    expect(next.plan).toBe('sliding');
    expect(next.leaves).toBe(2);
  });
});

const familia = (kind: 'door' | 'window', id: string): ReturnType<typeof familyOptionsFor>[number] =>
  familyOptionsFor(kind).find((f) => f.id === id)!;

describe('campos v2 ao trocar de família', () => {
  it('preserva leafStyle e grid válidos para a nova família', () => {
    const base: OpeningType = {
      ...newOpeningTypeFromFamily(familia('window', 'window_fixed')),
      leafStyle: 'glass',
      grid: { cols: 2, rows: 3 },
    };
    const next = applyFamily(base, familia('window', 'window_sliding'));
    expect(next.plan).toBe('sliding');
    expect(next.leafStyle).toBe('glass');
    expect(next.grid).toEqual({ cols: 2, rows: 3 });
  });

  it('redefine o leafStyle inválido e remove o grid ao ir para porta', () => {
    const janela: OpeningType = {
      ...newOpeningTypeFromFamily(familia('window', 'window_fixed')),
      leafStyle: 'panel',
      grid: { cols: 2, rows: 2 },
    };
    const fixa = applyFamily(janela, familia('window', 'window_casement'));
    expect(fixa.leafStyle).toBe('glass');
    const porta = applyFamily(fixa, familia('door', 'door_swing'));
    expect(porta.leafStyle).toBe('glass');
    expect('grid' in porta).toBe(false);
  });
});

describe('tipo novo com padrões v2 coerentes', () => {
  it('porta de giro: folha lisa, maçaneta de haste e sem grid', () => {
    const t = newOpeningTypeFromFamily(familia('door', 'door_swing'));
    expect(t.leafStyle).toBe('flush');
    expect(t.handle).toBe('lever');
    expect(t.frameStyle).toBe('rebate');
    expect(t.angle2d).toBe(90);
    expect(t.angle3d).toBe(90);
    expect('grid' in t).toBe(false);
  });

  it('janela de correr: vidro, grid 1 × 1 e maçaneta nenhuma; maxim-ar abre 30°', () => {
    const t = newOpeningTypeFromFamily(familia('window', 'window_sliding'));
    expect(t.leafStyle).toBe('glass');
    expect(t.handle).toBe('none');
    expect(t.grid).toEqual({ cols: 1, rows: 1 });
    expect(t.angle3d).toBe(90);
    expect(newOpeningTypeFromFamily(familia('window', 'window_casement')).angle3d).toBe(30);
  });
});

describe('bandeiras e variantes do formulário', () => {
  const base = newOpeningTypeFromFamily(familia('window', 'window_fixed'));

  it('ligar a bandeira grava altura padrão fixa; desligar tira o campo', () => {
    const ligada = alternarTransom({ ...base, height: 2.2 }, true);
    expect(ligada.transom).toEqual({ height: 0.4, fixed: true });
    expect(defaultTransomHeight(0.9)).toBe(0.3);
    const desligada = alternarTransom(ligada, false);
    expect('transom' in desligada).toBe(false);
  });

  it('ligar e desligar bandeiras laterais mantém a largura e remove o campo sem lados', () => {
    const esquerda = alternarSidelight(base, 'left', true);
    expect(esquerda.sidelights).toEqual({ left: true, right: false, width: 0.3 });
    const duas = alternarSidelight(esquerda, 'right', true);
    expect(duas.sidelights).toEqual({ left: true, right: true, width: 0.3 });
    expect('sidelights' in alternarSidelight(duas, 'left', false)).toBe(true);
    expect('sidelights' in alternarSidelight(alternarSidelight(duas, 'left', false), 'right', false)).toBe(false);
  });

  it('variante de janela grava o grid e a de porta grava o estilo', () => {
    expect(openingVariants('door').map((v) => v.id)).toContain('veneziana');
    const janela = applyVariant(base, openingVariants('window').find((v) => v.id === '2x2')!);
    expect(janela.leafStyle).toBe('glass');
    expect(janela.grid).toEqual({ cols: 2, rows: 2 });
    expect(janela.frameMaterialId).toBe('mat_aluminio');
    const porta = applyVariant(newOpeningTypeFromFamily(familia('door', 'door_swing')), openingVariants('door').find((v) => v.id === 'painel')!);
    expect(porta.leafStyle).toBe('panel');
    expect(porta.frameMaterialId).toBe('mat_madeira');
  });

  it('variante de porta muda o layout e mantém o material de alumínio (batente, folha e vidro)', () => {
    const aluminio = { ...newOpeningTypeFromFamily(familia('door', 'door_swing')), frameMaterialId: 'mat_aluminio', leafMaterialId: 'mat_pvc', glassMaterialId: 'mat_vidro' };
    for (const v of openingVariants('door')) {
      const r = applyVariant(aluminio, v);
      expect(r.frameMaterialId, v.id).toBe('mat_aluminio');
      expect(r.leafMaterialId, v.id).toBe('mat_pvc');
      expect(r.glassMaterialId, v.id).toBe('mat_vidro');
    }
    const painel = applyVariant(aluminio, openingVariants('door').find((v) => v.id === 'painel')!);
    expect(painel.leafStyle).toBe('panel');
    expect(painel.frameMaterialId).toBe('mat_aluminio');
  });

  it('nenhuma variante (porta ou janela) troca o material do tipo', () => {
    const pvc = { ...base, frameMaterialId: 'mat_pvc' };
    for (const v of [...openingVariants('door'), ...openingVariants('window')]) {
      expect(applyVariant(pvc, v).frameMaterialId, v.id).toBe('mat_pvc');
    }
    const tresPorUm = applyVariant(base, openingVariants('window').find((v) => v.id === '3x1')!);
    expect(tresPorUm.frameMaterialId).toBe('mat_aluminio');
  });
});

describe('tipo novo pelo comando', () => {
  it('cria um tipo da família escolhida e o comando aceita', () => {
    const s = store();
    const t = newOpeningTypeFromFamily(familyOptionsFor('door').find((f) => f.id === 'door_pivot')!);
    s.exec({ type: 'upsertOpeningType', openingType: t });
    const saved = s.project.openingTypes[t.id];
    expect(saved?.plan).toBe('pivot');
    expect(saved?.leaves).toBe(1);
    expect(saved?.name).toBe('Nova porta');
  });

  it('o comando recusa combinação fora das famílias', () => {
    const s = store();
    const base = newOpeningTypeFromFamily(familyOptionsFor('window')[0]!);
    const bad: OpeningType = { ...base, plan: 'fixed', leaves: 3 };
    expect(() => s.exec({ type: 'upsertOpeningType', openingType: bad })).toThrow('Combinação inválida');
    expect(s.project.openingTypes[bad.id]).toBeUndefined();
  });
});

/** Cena de uma janela (ot_j120) numa parede de 4 m: a peça 3D do vão e a linha do quadro, como o app as calcula. */
function cenaJanela(t: OpeningType): { g: OpeningGeometry; pecas: OpeningPiece[]; linha: OpeningScheduleRow } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertOpeningType', openingType: t });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: 'window', typeId: t.id, hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  const p = s.project;
  const o = p.elements.v as Opening;
  const f = frameOfWall(p, 'w')!;
  const g = openingGeometry(p, o, f);
  return { g, pecas: openingPieces(p, o, g, f, 2.8, false), linha: buildOpeningSchedule(p).rows[0]! };
}

const perto = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

describe('alternar acabamento (ligar grava o padrão, desligar tira o campo)', () => {
  const base = DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_j120')!;

  it('ligar grava o padrão sem mexer no resto do tipo; desligar tira a chave', () => {
    const ligado = alternarAcabamento(base, 'lintel', true);
    expect(ligado.lintel).toEqual({ over: 0.3, height: 0.2 });
    expect(ligado.width).toBe(base.width);
    expect(base.lintel).toBeUndefined();
    const desligado = alternarAcabamento(ligado, 'lintel', false);
    expect('lintel' in desligado).toBe(false);
  });
});

describe('campos de acabamento: cada um muda a peça no 3D e o quadro', () => {
  const base = DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_j120')!;
  const W = base.width;
  const sem = cenaJanela(base);

  it('folga do vão: o vão bruto cresce no quadro e no corte da parede; a esquadria não muda', () => {
    const c = cenaJanela({ ...base, roughOversize: { w: 0.02, h: 0.01 } });
    expect(c.g.roughWidth).toBeCloseTo(W + 0.02, 9);
    expect(c.g.width).toBe(W);
    expect(c.linha.roughWidth).toBeCloseTo(W + 0.02, 9);
    expect(c.linha.roughHeight).toBeCloseTo(base.height + 0.01, 9);
    expect(c.pecas).toHaveLength(sem.pecas.length);
  });

  it('alizar: largura e espessura viram as peças em volta do vão (8 a mais na janela)', () => {
    const c = cenaJanela({ ...alternarAcabamento(base, 'casing', true), casing: { width: 0.08, thickness: 0.02 } });
    expect(c.pecas.length - sem.pecas.length).toBe(8);
    // A peça da cabeça tem o vão mais 2 × (alizar de 8 cm − batente de 5 cm) = W + 0,06: o alizar sobrepõe 5 cm do batente
    // (medido em 1,26 m para vão de 1,2 m). Ponto a confirmar com o dono (silhueta única por face).
    expect(c.pecas.some((x) => perto(x.w, W + 0.06) && perto(x.d, 0.02))).toBe(true);
    expect(sem.pecas.some((x) => perto(x.d, 0.02))).toBe(false);
  });

  it('soleira saliente: projeção e espessura viram o peitoril além das duas faces da parede', () => {
    const c = cenaJanela({ ...base, sillBoard: { projection: 0.04, thickness: 0.03 } });
    expect(c.pecas.length - sem.pecas.length).toBe(1);
    expect(c.pecas.some((x) => perto(x.w, W + 0.06) && perto(x.d, c.g.thickness + 0.08) && perto(x.h, 0.03))).toBe(true);
  });

  it('verga: transpasse e altura viram a peça sobre o vão e o comprimento total no quadro', () => {
    const c = cenaJanela({ ...base, lintel: { over: 0.25, height: 0.15 } });
    expect(c.pecas.length - sem.pecas.length).toBe(1);
    expect(c.pecas.some((x) => perto(x.w, W + 0.5) && perto(x.h, 0.15))).toBe(true);
    expect(c.linha.lintel?.over).toBeCloseTo(0.25, 9);
    expect(c.linha.lintelLength).toBeCloseTo(W + 0.5, 9);
  });

  it('contraverga: transpasse e altura viram a peça sob o vão e entram no quadro', () => {
    const c = cenaJanela({ ...base, sillBeam: { over: 0.1, height: 0.12 } });
    expect(c.pecas.length - sem.pecas.length).toBe(1);
    expect(c.pecas.some((x) => perto(x.w, W + 0.2) && perto(x.h, 0.12))).toBe(true);
    expect(c.linha.sillBeam?.height).toBeCloseTo(0.12, 9);
  });

  it('desligar a verga tira a peça e a coluna do quadro volta ao padrão (sem verga)', () => {
    const c = cenaJanela(alternarAcabamento(alternarAcabamento(base, 'lintel', true), 'lintel', false));
    expect(c.pecas).toHaveLength(sem.pecas.length);
    expect(c.linha.lintel).toBeNull();
  });

  it('a validação do modelo recusa folga negativa com a mensagem que o diálogo mostra', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_x', roughOversize: { w: -0.01, h: 0 } } })).toThrow(
      'Folga do vão, largura: use um valor de 0 a 20 cm.',
    );
    expect(s.project.openingTypes['ot_x']).toBeUndefined();
  });
});
