import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeLevel, makeStair, type Stair, type StairLanding, type StairRun } from '@hestia/model';
import { generateFanRun, generateLShape, generateUShape, generateWinderL, type StairComponentSketch } from './stairGenerators.ts';
import { generateSpiralRun } from './stairSpiral.ts';
import { regenStairFree } from './stairFreeEdit.ts';
import { stairIssueList, stairIssuesOf, stairRiserEvennessIssue } from './stairChecks.ts';
import { resolveStairs } from './stairs.ts';

// Avisos de regra do tipo (espelho, piso, trecho sem patamar, modo fixo): um conjunto por forma de escada, com o caso conforme.

const curve = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
type Comps = Array<StairRun | StairLanding>;

const runN = (n: number, tread = 0.28): StairRun => ({
  id: 'r1',
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, (n - 1) * tread)],
  boundaryRight: [curve(1, 0, 1, (n - 1) * tread)],
  risers: Array.from({ length: n }, (_, i) => curve(0, i * tread, 1, i * tread)),
  path: [],
});
const toComps = (parts: StairComponentSketch[]): Comps =>
  parts.map((p, i) => (p.kind === 'run' ? { id: `c${i}`, kind: 'run', ...p.run } : { id: `c${i}`, kind: 'landing', ...p.landing }));
const turn = { start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left' as const, width: 1.2, tread: 0.28 };
const reta = (n: number): Comps => [runN(n)];
const lN = (a: number, b: number, landingDepth?: number): Comps =>
  toComps(generateLShape({ ...turn, risersFirst: a, risersSecond: b, ...(landingDepth ? { landingDepth } : {}) }));
const uN = (a: number, b: number, landingDepth?: number): Comps =>
  toComps(generateUShape({ ...turn, risersFirst: a, risersSecond: b, ...(landingDepth ? { landingDepth } : {}) }));
const winderN = (a: number, b: number): Comps =>
  toComps(generateWinderL({ ...turn, risersFirst: a, risersSecond: b })).map((x, i) => (i === 1 && x.kind === 'run' ? { ...x, generatedBy: 'winder' as const } : x));
const lequeN = (n: number): Comps => [
  { id: 'lq', kind: 'run', ...generateFanRun({ center: { x: 0, y: 0 }, innerRadius: 0.4, outerRadius: 1.4, startAngle: 0, endAngle: Math.PI, risers: n }), generatedBy: 'winder' },
];
/** Caracol: raios e varredura dão piso de ~0,30 m na linha de caminhada (raio médio 0,8 m). */
const caracolOk = (n: number): Comps => [
  { id: 'cr', kind: 'run', ...generateSpiralRun({ center: { x: 0, y: 0 }, rInner: 0.5, rOuter: 1.1, startAngle: 0, sweep: (n - 1) * 0.3766, risers: n }) },
];
/** Caracol apertado: piso de ~0,18 m na linha de caminhada. */
const caracolApertado = (n: number): Comps => [
  { id: 'cr', kind: 'run', ...generateSpiralRun({ center: { x: 0, y: 0 }, rInner: 0.1, rOuter: 0.9, startAngle: 0, sweep: Math.PI * 2, risers: n }) },
];

function storeWith(stair: Partial<Stair> & Pick<Stair, 'components'>, top: number): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: top }) });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_top', ...stair }) });
  return s;
}
const comTipo = (s: ProjectStore, patch: Record<string, number>) => {
  s.exec({ type: 'upsertStairType', stairType: { ...s.project.stairTypes[defaultStairTypeId]!, id: 'stt_x', ...patch } });
  s.exec({ type: 'updateElements', ids: ['st1'], patch: { typeId: 'stt_x' } });
};
/** Escada livre: trajeto reto de `len` m gerado pelo planejador. */
function livre(len: number, top: number, runTop = top): ProjectStore {
  const base = storeWith({ components: reta(2) }, top);
  const gen = regenStairFree(base.project.elements.st1 as Stair, base.project, { freePath: [{ x: 0, y: 0 }, { x: 0, y: len }], width: 1, fixed: 'auto' });
  if ('error' in gen) throw new Error(gen.error);
  return storeWith({ components: gen.components, freePath: gen.freePath }, runTop);
}
const list = (s: ProjectStore) => stairIssueList(s.project).filter((i) => i.stairId === 'st1');
const NOVOS = ['stair-riser-below-min', 'stair-riser-range-impossible', 'stair-riser-fixed', 'stair-tread-type-range', 'stair-flight-rise', 'stair-riser-uneven'];
const novos = (s: ProjectStore) => list(s).filter((i) => NOVOS.includes(i.code));
const has = (s: ProjectStore, code: string) => list(s).filter((i) => i.code === code);
const subida = (s: ProjectStore) => list(s).filter((i) => i.code === 'stair-flight-rise' || i.code === 'stair-landing-rise');
const piso = (s: ProjectStore) => list(s).filter((i) => i.code === 'stair-tread-type-range' || i.code === 'stair-tread-range');

// Conformes: espelho 0,16–0,18 m, piso 0,28–0,32 m, trecho <= 3,20 m.
const FORMAS: Array<[string, () => ProjectStore]> = [
  ['reta', () => storeWith({ components: reta(17) }, 2.88)],
  ['L', () => storeWith({ components: lN(9, 9) }, 3.06)],
  ['U', () => storeWith({ components: uN(9, 9) }, 3.06)],
  ['winder', () => storeWith({ components: winderN(6, 6) }, 2.2)],
  ['leque', () => storeWith({ components: lequeN(18) }, 3.06)],
  ['caracol', () => storeWith({ components: caracolOk(18) }, 3.06)],
  ['livre', () => livre(4.5, 2.72)],
];

describe('escada conforme: nenhum aviso novo', () => {
  for (const [nome, make] of FORMAS) {
    it(nome, () => {
      expect(novos(make())).toEqual([]);
    });
  }
});

describe('stair-riser-below-min (espelho abaixo do mínimo do tipo)', () => {
  const tipo = { minRiser: 0.175, maxRiser: 0.19 };
  for (const [nome, make] of FORMAS) {
    it(nome, () => {
      const s = make();
      comTipo(s, tipo);
      const w = has(s, 'stair-riser-below-min');
      expect(w).toHaveLength(1);
      expect(w[0]).toMatchObject({ severity: 'warning', stairId: 'st1' });
      expect(w[0]!.message).toMatch(/^Espelho de 0,\d{3} m abaixo do mínimo de 0,175 m do tipo \(NBR 9050\)\.$/);
    });
  }
  it('abaixo da norma fixa: só o aviso existente (stair-riser-range), sem duplicar', () => {
    const s = storeWith({ components: reta(20) }, 2.88);
    expect(has(s, 'stair-riser-range')).toHaveLength(1);
    expect(has(s, 'stair-riser-below-min')).toEqual([]);
  });
});

describe('stair-riser-range-impossible (nenhum N dá espelho na faixa)', () => {
  it('todas as formas: desnível pequeno com faixa estreita', () => {
    // H = 0,35: N=2 dá 0,175 (fora de 0,16 a 0,17) e N=3 dá 0,117.
    const formas: Comps[] = [reta(3), lequeN(3), caracolOk(3), lN(2, 2), uN(2, 2), winderN(2, 2), livre(0.6, 0.35).project.elements.st1 ? (livre(0.6, 0.35).project.elements.st1 as Stair).components : []];
    for (const comps of formas) {
      const s = storeWith({ components: comps }, 0.35);
      comTipo(s, { minRiser: 0.16, maxRiser: 0.17 });
      const w = has(s, 'stair-riser-range-impossible');
      expect(w).toHaveLength(1);
      expect(w[0]!.message).toContain('Nenhum nº de espelhos dá altura entre 0,160 e 0,170 m para o desnível de 0,350 m');
    }
  });
  it('com N possível: sem aviso', () => {
    expect(has(storeWith({ components: reta(17) }, 2.88), 'stair-riser-range-impossible')).toEqual([]);
  });
});

describe('stair-riser-fixed (modo fixo com espelho fora da faixa)', () => {
  const casos: Array<[string, Comps, number]> = [
    ['reta', reta(17), 3.2],
    ['L', lN(9, 9), 3.6],
    ['U', uN(9, 9), 3.6],
    ['winder', winderN(6, 6), 3.0],
    ['leque', lequeN(18), 3.4],
    ['caracol', caracolOk(18), 3.4],
  ];
  for (const [nome, comps, top] of casos) {
    it(nome, () => {
      const s = storeWith({ components: comps, riserMode: 'fixed' }, top);
      const w = has(s, 'stair-riser-fixed');
      expect(w).toHaveLength(1);
      expect(w[0]!.message).toMatch(/fora da faixa do tipo \(0,160 a 0,180 m\) com o modo de espelho fixo/);
      // O mesmo desnível no modo automático não avisa.
      expect(has(storeWith({ components: comps }, top), 'stair-riser-fixed')).toEqual([]);
    });
  }
  it('livre', () => {
    const base = livre(4.5, 2.72);
    const s = storeWith({ components: (base.project.elements.st1 as Stair).components, freePath: (base.project.elements.st1 as Stair).freePath, riserMode: 'fixed' }, 3.6);
    expect(has(s, 'stair-riser-fixed')).toHaveLength(1);
  });
  it('fixo com espelho dentro da faixa: sem aviso', () => {
    expect(has(storeWith({ components: reta(17), riserMode: 'fixed' }, 2.88), 'stair-riser-fixed')).toEqual([]);
  });
});

describe('stair-tread-type-range (piso na linha de caminhada fora do tipo)', () => {
  it('reta, L, U e winder: piso de 0,28 m contra mínimo do tipo de 0,30 m', () => {
    const casos: Array<[Comps, number]> = [[reta(17), 2.88], [lN(9, 9), 3.06], [uN(9, 9), 3.06], [winderN(6, 6), 2.2]];
    for (const [comps, top] of casos) {
      const s = storeWith({ components: comps }, top);
      comTipo(s, { minTread: 0.3, maxTread: 0.34 });
      const w = has(s, 'stair-tread-type-range');
      expect(w.length).toBeGreaterThan(0);
      expect(w[0]!.message).toContain('fora da faixa do tipo (0,30 a 0,34 m) (NBR 9050)');
      expect(w[0]!.componentIndex).toBeDefined();
    }
  });
  it('piso acima do máximo do tipo', () => {
    const s = storeWith({ components: reta(17) }, 2.88);
    comTipo(s, { minTread: 0.2, maxTread: 0.27 });
    const w = has(s, 'stair-tread-type-range');
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain('Piso de 0,280 m');
  });
  it('leque: faixa do tipo longe do piso avisa', () => {
    const s = storeWith({ components: lequeN(18) }, 3.06);
    comTipo(s, { minTread: 0.9, maxTread: 1.0 });
    expect(piso(s).length).toBeGreaterThan(0);
  });
  it('caracol apertado (piso ~0,18 m na caminhada) avisa; o conforme não', () => {
    expect(piso(storeWith({ components: caracolApertado(18) }, 3.06)).length).toBeGreaterThan(0);
    expect(piso(storeWith({ components: caracolOk(18) }, 3.06))).toEqual([]);
  });
  it('livre', () => {
    const s = livre(4.5, 2.88);
    comTipo(s, { minTread: 0.5, maxTread: 0.6 });
    expect(piso(s).length).toBeGreaterThan(0);
  });
});

describe('trecho contínuo > 3,20 m sem patamar (NBR 9050)', () => {
  it('reta, L, U, leque e caracol: aviso de subida, sem duplicar', () => {
    const casos: Array<[Comps, number]> = [[reta(20), 3.6], [lN(18, 2), 7.2], [uN(18, 2), 7.2], [lequeN(20), 3.6], [caracolOk(20), 3.6]];
    for (const [comps, top] of casos) {
      const s = storeWith({ components: comps }, top);
      expect(subida(s).length).toBeGreaterThan(0);
    }
    // Lance único: o aviso existente (stair-landing-rise) cobre; o novo não repete.
    expect(has(storeWith({ components: reta(20) }, 3.6), 'stair-flight-rise')).toEqual([]);
  });
  it('winder (reta + leque + reta emendados): o trecho todo conta e avisa com stair-flight-rise', () => {
    const s = storeWith({ components: winderN(9, 9) }, 3.6);
    const w = has(s, 'stair-flight-rise');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ severity: 'warning', stairId: 'st1', componentIndex: 0 });
    expect(w[0]!.message).toBe('Trecho contínuo sobe 3,60 m sem patamar; a NBR 9050 limita a 3,20 m entre patamares.');
  });
  it('com patamar entre os lances (L): cada trecho <= 3,20 m, sem aviso', () => {
    expect(subida(storeWith({ components: lN(9, 9) }, 6.0))).toEqual([]);
  });
  it('livre: trajeto longo sem patamar avisa', () => {
    const s = livre(9, 3.6);
    const temPatamar = (s.project.elements.st1 as Stair).components.some((c) => c.kind === 'landing');
    if (!temPatamar) expect(subida(s).length).toBeGreaterThan(0);
    else expect(subida(s)).toEqual([]);
  });
});

describe('patamar com menos de 1,20 m (stair-landing-length)', () => {
  it('L e U com patamar de 0,90 m avisam; com 1,20 m não', () => {
    // O gerador exige patamar >= largura do lance: lance de 0,90 m dá patamar de 0,90 m.
    for (const gen of [generateLShape, generateUShape]) {
      const estreito = toComps(gen({ ...turn, width: 0.9, risersFirst: 9, risersSecond: 9 }));
      expect(has(storeWith({ components: estreito }, 3.06), 'stair-landing-length').length).toBeGreaterThan(0);
    }
    for (const make of [lN, uN]) expect(has(storeWith({ components: make(9, 9, 1.2) }, 3.06), 'stair-landing-length')).toEqual([]);
  });
});

describe('stair-riser-uneven (espelhos desiguais entre lances)', () => {
  const rsOf = (comps: Comps, top: number) => resolveStairs(storeWith({ components: comps }, top).project).find((r) => r.id === 'st1')!;
  it('espelhos iguais (qualquer forma): sem aviso', () => {
    for (const [c, t] of [[lN(9, 9), 3.06], [uN(9, 9), 3.06], [winderN(6, 6), 2.2]] as Array<[Comps, number]>) {
      expect(stairRiserEvennessIssue(rsOf(c, t))).toBeNull();
    }
  });
  it('lance com espelho 8 mm mais alto: aviso com a variação', () => {
    const rs = rsOf(lN(9, 9), 3.06);
    const alt = { ...rs, risers: rs.risers.map((r) => (r.componentIndex === 2 ? { ...r, z1: r.z1 + 0.008 } : r)) };
    const w = stairRiserEvennessIssue(alt);
    expect(w).toMatchObject({ code: 'stair-riser-uneven', severity: 'warning', stairId: 'st1' });
    expect(w!.message).toContain('varia 8 mm (máximo 5 mm)');
  });
  it('variação de 4 mm: dentro da tolerância', () => {
    const rs = rsOf(lN(9, 9), 3.06);
    const alt = { ...rs, risers: rs.risers.map((r) => (r.componentIndex === 2 ? { ...r, z1: r.z1 + 0.004 } : r)) };
    expect(stairRiserEvennessIssue(alt)).toBeNull();
  });
});

describe('stairIssuesOf inclui os avisos novos', () => {
  it('mesmos códigos da lista', () => {
    const s = storeWith({ components: reta(17), riserMode: 'fixed' }, 3.2);
    const a = stairIssuesOf(s.project, 'st1').map((i) => i.code).sort();
    expect(a).toEqual(list(s).map((i) => i.code).sort());
    expect(a).toContain('stair-riser-fixed');
  });
});
