import { describe, expect, it } from 'vitest';
import { closeGaps, multiArea, union } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type OpeningType, type Wall } from '@hestia/model';
import { buildFrame, computeEnds, endPartners, joinStatus, quantifyLevel, resolveLevel } from './index.ts';

const T14 = 0.184;
const CORE14 = 0.14;

const wall = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<Wall> = {}): Omit<Wall, 'order'> =>
  makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by }, ...extra });

function setup(walls: Array<Omit<Wall, 'order'>>) {
  const s = new ProjectStore(createEmptyProject());
  for (const w of walls) s.exec({ type: 'addWall', wall: w });
  return s;
}

const silhouetteArea = (s: ProjectStore) => {
  const r = resolveLevel(s.project, 'lv_0');
  return multiArea(union(...r.clusters.map((c) => c.silhouette)));
};

const coreArea = (s: ProjectStore, matId = 'mat_bloco14') => {
  const r = resolveLevel(s.project, 'lv_0');
  return multiArea(union(...r.clusters.flatMap((c) => c.regions.filter((x) => x.materialId === matId).map((x) => x.polygons))));
};

describe('parede isolada', () => {
  it('área total e do núcleo', () => {
    const s = setup([wall('a', 0, 0, 4, 0)]);
    expect(silhouetteArea(s)).toBeCloseTo(4 * T14, 6);
    expect(coreArea(s)).toBeCloseTo(4 * CORE14, 6);
  });
  it('linha de localização desloca a parede inteira', () => {
    const s = setup([wall('a', 0, 0, 4, 0, { locationLine: 'finishExterior' })]);
    const r = resolveLevel(s.project, 'lv_0');
    const ys = r.walls.a!.layers.flatMap((l) => l.cut.flatMap((p) => p[0]!.map((v) => v.y)));
    expect(Math.max(...ys)).toBeCloseTo(0, 6); // face externa (esquerda) sobre a linha
    expect(Math.min(...ys)).toBeCloseTo(-T14, 6);
  });
  it('flipped inverte o lado externo', () => {
    const s = setup([wall('a', 0, 0, 4, 0, { locationLine: 'finishExterior', flipped: true })]);
    const r = resolveLevel(s.project, 'lv_0');
    const ys = r.walls.a!.layers.flatMap((l) => l.cut.flatMap((p) => p[0]!.map((v) => v.y)));
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(T14, 6);
  });
});

describe('junção em L', () => {
  const s = setup([wall('a', 0, 0, 4, 0), wall('b', 0, 0, 0, 3)]);
  const miter = setup([
    wall('a', 0, 0, 4, 0, { joinStart: { kind: 'miter', flip: false } }),
    wall('b', 0, 0, 0, 3, { joinStart: { kind: 'miter', flip: false } }),
  ]);
  it('silhueta é a união dos dois retângulos, sem furo nem sobra', () => {
    const expected = T14 * (4 + T14 / 2) + T14 * (3 + T14 / 2) - T14 * T14;
    expect(silhouetteArea(s)).toBeCloseTo(expected, 6);
  });
  it('núcleos se unem num só polígono (mesma prioridade e material)', () => {
    const r = resolveLevel(s.project, 'lv_0');
    const core = r.clusters[0]!.regions.find((x) => x.materialId === 'mat_bloco14')!;
    expect(core.polygons).toHaveLength(1);
  });
  it('acabamento externo contorna o canto sem ser cortado pela estrutura', () => {
    // Com esquadria, a tinta de cada lado forma um L contínuo.
    const r = resolveLevel(miter.project, 'lv_0');
    const tinta = r.clusters[0]!.regions.find((x) => x.materialId === 'mat_tinta')!;
    // externa + interna: dois L (um por lado) → 2 polígonos disjuntos
    expect(tinta.polygons).toHaveLength(2);
  });
  it('não há sobreposição entre camadas de materiais diferentes', () => {
    const r = resolveLevel(s.project, 'lv_0');
    const total = multiArea(union(...r.clusters.map((c) => c.silhouette)));
    const sum = Object.values(r.walls).flatMap((w) => w.layers).reduce((acc, l) => acc + multiArea(l.cut), 0);
    expect(sum).toBeCloseTo(total, 6);
  });
});

describe('junção em T', () => {
  const s = setup([wall('through', -3, 0, 3, 0), wall('branch', 0, 0, 0, 3)]);
  it('o ramal termina no centro da parede passante, sem atravessá-la', () => {
    const r = resolveLevel(s.project, 'lv_0');
    const ys = r.walls.branch!.layers.flatMap((l) => l.fragment.flatMap((p) => p[0]!.map((v) => v.y)));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-9);
  });
  it('não aparece estrutura do ramal do outro lado da parede passante', () => {
    const r = resolveLevel(s.project, 'lv_0');
    const ys = r.clusters[0]!.silhouette.flatMap((p) => p[0]!.map((v) => v.y));
    expect(Math.min(...ys)).toBeCloseTo(-T14 / 2, 6);
  });
  it('estrutura do ramal funde com a da parede passante', () => {
    const r = resolveLevel(s.project, 'lv_0');
    const core = r.clusters[0]!.regions.find((x) => x.materialId === 'mat_bloco14')!;
    expect(core.polygons).toHaveLength(1);
    const expected = 6 * CORE14 + (3 - CORE14 / 2) * CORE14;
    expect(multiArea(core.polygons)).toBeCloseTo(expected, 6);
  });
});

describe('cruzamento em X e continuação', () => {
  it('X funde a estrutura sem duplicar área', () => {
    const s = setup([wall('h', -2, 0, 2, 0), wall('v', 0, -2, 0, 2)]);
    const expected = 4 * CORE14 * 2 - CORE14 * CORE14;
    expect(coreArea(s)).toBeCloseTo(expected, 6);
  });
  it('duas paredes colineares formam uma só parede contínua', () => {
    const s = setup([wall('a', 0, 0, 2, 0), wall('b', 2, 0, 5, 0)]);
    expect(silhouetteArea(s)).toBeCloseTo(5 * T14, 6);
  });
  it('tipos diferentes: a estrutura de maior prioridade corta o acabamento do vizinho', () => {
    const s = setup([wall('a', 0, 0, 4, 0), wall('b', 2, -2, 2, 0, { typeId: 'wt_alv9' })]);
    const r = resolveLevel(s.project, 'lv_0');
    expect(Object.keys(r.walls)).toHaveLength(2);
    const sum = Object.values(r.walls).flatMap((w) => w.layers).reduce((acc, l) => acc + multiArea(l.cut), 0);
    expect(sum).toBeCloseTo(multiArea(union(...r.clusters.map((c) => c.silhouette))), 6);
  });
});

describe('aberturas', () => {
  const build = () => {
    const s = setup([wall('a', 0, 0, 4, 0)]);
    s.exec({ type: 'addOpening', opening: { id: 'd', kind: 'door', typeId: 'ot_p80', hostId: 'a', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    s.exec({ type: 'addOpening', opening: { id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'a', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    return s;
  };
  it('recorta todas as camadas em planta', () => {
    const s = build();
    // Tipo com batente e `closure: inherit`: o acabamento encosta no batente, sem retorno (decisão 0035 §2).
    expect(silhouetteArea(s)).toBeCloseTo((4 - 0.8 - 1.2) * T14, 5);
  });
  it('3D: faixas verticais — o vão só fura a altura que atravessa', () => {
    const s = build();
    const rw = resolveLevel(s.project, 'lv_0').walls.a!;
    const core = rw.layers.find((l) => l.materialId === 'mat_bloco14')!;
    const at = (z: number) => core.bands.find((b) => z > b.z0 && z < b.z1)!;
    const holeAt = (z: number, x: number) => at(z).poly.some((p) => p[0]!.some((v) => Math.abs(v.x - x) < 1e-6));
    // Janela (centro x=3, vão 1,2 m, peitoril 1,1 m, altura 1,2 m): parede cheia até 1,1 m e acima de 2,3 m.
    expect(at(0.5).poly.length).toBeGreaterThan(0);
    expect(at(1.7)).toBeDefined();
    expect(holeAt(1.7, 2.4) || holeAt(1.7, 3.6)).toBe(true); // bordas do vão aparecem a 1,7 m
    expect(holeAt(0.5, 3.6)).toBe(false); // abaixo do peitoril não há borda de vão em x=3,6
    const total = core.bands.reduce((a, b) => a + (b.z1 - b.z0), 0);
    expect(total).toBeCloseTo(2.8, 6); // cobre toda a altura, sem faixas faltando
  });
  it('quantitativos: volume do bloco e área líquida', () => {
    const s = build();
    const q = quantifyLevel(s.project, resolveLevel(s.project, 'lv_0'));
    const w = q.walls[0]!;
    expect(w.grossFaceArea).toBeCloseTo(4 * 2.8, 6);
    expect(w.openingsArea).toBeCloseTo(0.8 * 2.1 + 1.2 * 1.2, 6);
    // volume do bloco = (comprimento líquido do vão cheio) + peças
    const expected = CORE14 * (4 * 2.8 - 0.8 * 2.1 - 1.2 * 1.2);
    expect(q.volumeByMaterial.mat_bloco14).toBeCloseTo(expected, 6);
  });
});

describe('cache', () => {
  it('resultado idêntico em chamadas repetidas e muda ao mover', () => {
    const s = setup([wall('a', 0, 0, 4, 0), wall('b', 0, 0, 0, 3)]);
    const r1 = resolveLevel(s.project, 'lv_0');
    const r2 = resolveLevel(s.project, 'lv_0');
    expect(r2.clusters[0]!.silhouette).toBe(r1.clusters[0]!.silhouette);
    s.exec({ type: 'setWallEnds', id: 'b', b: { x: 0, y: 5 } });
    expect(multiArea(resolveLevel(s.project, 'lv_0').clusters[0]!.silhouette)).toBeGreaterThan(multiArea(r1.clusters[0]!.silhouette));
  });
});

describe('modelos iniciais', () => {
  it.each(['house2', 'studio'] as const)('%s resolve, tem aberturas e nenhuma sobreposição de camadas', async (id) => {
    const { buildTemplate } = await import('@hestia/model');
    const p = buildTemplate(id);
    const r = resolveLevel(p, 'lv_0');
    expect(Object.keys(r.walls).length).toBeGreaterThan(5);
    const layers = Object.values(r.walls).flatMap((w) => w.layers);
    const sum = layers.reduce((a, l) => a + multiArea(l.cut), 0);
    const sil = multiArea(union(...r.clusters.map((c) => c.silhouette)));
    expect(sum).toBeCloseTo(sil, 5);
    const q = quantifyLevel(p, r);
    expect(q.walls.every((w) => w.netFaceArea > 0)).toBe(true);
  });
});

describe('tipos de junção', () => {
  const frames = (s: ProjectStore) => {
    const ps = s.project;
    return Object.values(ps.elements).filter((e) => e.kind === 'wall').map((w) => buildFrame(w as Wall, ps.wallTypes[(w as Wall).typeId]!)!);
  };
  const lShape = (cfg?: { kind: 'butt' | 'miter'; flip: boolean }) =>
    setup([
      wall('a', 0, 0, 4, 0, cfg ? { joinStart: cfg } : {}),
      wall('b', 0, 0, 0, 3, cfg ? { joinStart: cfg } : {}),
    ]);
  /** Degraus do pareamento por face (encosto): corte de cada faixa de espessura. */
  const stepsOf = (e: { hi: { kind: string; runs?: Array<{ s: number; t: number }> } }) => {
    if (e.hi.kind !== 'steps') throw new Error(`esperava corte em degraus, veio ${e.hi.kind}`);
    return e.hi.runs!;
  };
  /** Corte da faixa de espessura que começa em `s`. */
  const cutAt = (e: { hi: { kind: string; runs?: Array<{ s: number; t: number }> } }, s: number): number => {
    let t = stepsOf(e)[0]!.t;
    for (const r of stepsOf(e)) if (r.s <= s + 1e-9) t = r.t;
    return t;
  };

  it('o padrão é encosto pareado: a mais antiga fica com o canto e a outra para nas faces das camadas dela', () => {
    const ends = computeEnds(frames(lShape()));
    // A dominante fica com as células do canto: o núcleo dela começa no próprio plano.
    expect(cutAt(ends.get('a')!.a, -CORE14 / 2)).toBeCloseTo(-CORE14 / 2, 6);
    // O seguidor para nas faces da dominante: núcleo na face do núcleo, tinta na face externa.
    expect(cutAt(ends.get('b')!.a, -CORE14 / 2)).toBeCloseTo(CORE14 / 2, 6);
    expect(cutAt(ends.get('b')!.a, -T14 / 2)).toBeCloseTo(T14 / 2, 6);
    // Do outro lado ele se recolhe sob o canto, para não entrar no núcleo da dominante.
    expect(cutAt(ends.get('b')!.a, CORE14 / 2)).toBeCloseTo(-CORE14 / 2, 6);
  });
  it('inverter a ordem troca quem fica com o canto', () => {
    const ends = computeEnds(frames(lShape({ kind: 'butt', flip: true })));
    expect(cutAt(ends.get('b')!.a, -CORE14 / 2)).toBeCloseTo(-CORE14 / 2, 6);
    expect(cutAt(ends.get('a')!.a, -CORE14 / 2)).toBeCloseTo(CORE14 / 2, 6);
  });
  it('esquadria usa corte em ângulo', () => {
    const ends = computeEnds(frames(lShape({ kind: 'miter', flip: false })));
    expect(ends.get('a')!.a.hi.kind).toBe('miter');
  });
  it('a silhueta externa é a mesma nos dois tipos (só a divisão interna muda)', () => {
    const areas = (['butt', 'miter'] as const).map((kind) => silhouetteArea(lShape({ kind, flip: false })));
    for (const a of areas) expect(a).toBeCloseTo(7 * T14, 6);
  });
  it('encosto: cada núcleo para na face do núcleo do vizinho e nenhuma ponta fica exposta na face externa', () => {
    const s = lShape({ kind: 'butt', flip: false });
    const r = resolveLevel(s.project, 'lv_0');
    const lead = r.walls.a!.layers.find((l) => l.materialId === 'mat_bloco14')!;
    const xs = lead.fragment.flatMap((p) => p[0]!.map((v) => v.x));
    // O núcleo da dominante fica com o canto, mas para na própria face (antes ia até a face externa -T14/2 e
    // aparecia na quina): nas duas pontas o acabamento dela cobre a faixa de -T14/2 a -CORE14/2.
    expect(Math.min(...xs)).toBeCloseTo(-CORE14 / 2, 6);
    const follower = r.walls.b!.layers.find((l) => l.materialId === 'mat_bloco14')!;
    const ys = follower.fragment.flatMap((p) => p[0]!.map((v) => v.y));
    expect(Math.min(...ys)).toBeCloseTo(CORE14 / 2, 6);
  });
  it('encontra as extremidades parceiras', () => {
    const p = endPartners(frames(lShape()), 'a', 'a');
    expect(p).toEqual([{ wallId: 'b', end: 'a' }]);
  });
});

describe('situação da extremidade', () => {
  const fr = (s: ProjectStore) => Object.values(s.project.elements).filter((e) => e.kind === 'wall').map((w) => buildFrame(w as Wall, s.project.wallTypes[(w as Wall).typeId]!)!);
  it('livre, par, T e não unir', () => {
    const s = setup([wall('a', 0, 0, 4, 0), wall('b', 0, 0, 0, 3), wall('t', 2, 0, 2, -3), wall('z', 9, 9, 12, 9, { noJoinStart: true })]);
    const f = fr(s);
    expect(joinStatus(f, 'a', 'a').kind).toBe('pair');
    expect(joinStatus(f, 'a', 'b').kind).toBe('free');
    expect(joinStatus(f, 't', 'a').kind).toBe('tee');
    expect(joinStatus(f, 'z', 'a').kind).toBe('disallowed');
  });
});

describe('nós de três ou mais paredes', () => {
  const deg = (d: number) => (d * Math.PI) / 180;
  const star = (n: number, angles?: number[]) => {
    const ang = angles ?? Array.from({ length: n }, (_, i) => (360 / n) * i + 10);
    return setup(ang.map((a, i) => wall(`s${i}`, 0, 0, 3 * Math.cos(deg(a)), 3 * Math.sin(deg(a)))));
  };
  const check = (s: ProjectStore) => {
    const r = resolveLevel(s.project, 'lv_0');
    const sil = union(...r.clusters.map((c) => c.silhouette));
    const sum = Object.values(r.walls).flatMap((w) => w.layers).reduce((a, l) => a + multiArea(l.cut), 0);
    expect(sum).toBeCloseTo(multiArea(sil), 3); // o fechamento de frestas altera a silhueta em < 1e-4 m²
    expect(sil).toHaveLength(1);
    expect(sil[0]).toHaveLength(1); // sem furos
    return { r, area: multiArea(sil) };
  };
  it('Y de três paredes iguais: sem sobreposição, sem furo e simétrico', () => {
    // Simetria por material, não por parede: no empate de prioridade o pintor dá a faixa sobreposta à parede mais antiga.
    const porMaterial = (r: ReturnType<typeof resolveLevel>) => {
      const m = new Map<string, number>();
      for (const w of Object.values(r.walls)) for (const l of w.layers) m.set(l.materialId, (m.get(l.materialId) ?? 0) + multiArea(l.cut));
      return m;
    };
    // Y e suas duas rotações de 120° (mesmas paredes, ângulos trocados).
    const [ref, ...outras] = [[10, 130, 250], [130, 250, 10], [250, 10, 130]].map((ang) => porMaterial(check(star(3, ang)).r));
    for (const m of outras) {
      for (const k of new Set([...ref!.keys(), ...m.keys()])) expect(Math.abs((ref!.get(k) ?? 0) - (m.get(k) ?? 0))).toBeLessThan(1e-5);
    }
  });
  it('a estrutura de um Y é um único polígono (funde)', () => {
    const { r } = check(star(3));
    const core = r.clusters[0]!.regions.find((x) => x.materialId === 'mat_bloco14')!;
    expect(core.polygons).toHaveLength(1);
  });
  it('estrela de quatro paredes diagonais', () => {
    check(star(4));
  });
  it('três paredes sem simetria, incluindo ângulos agudos', () => {
    check(star(3, [0, 40, 200]));
  });
  it('par colinear + ramal terminando no mesmo ponto vira T', () => {
    const s = setup([wall('a', -3, 0, 0, 0), wall('c', 0, 0, 3, 0), wall('b', 0, 0, 0, 3)]);
    const expected = 6 * T14 + (3 - T14 / 2) * T14;
    expect(silhouetteArea(s)).toBeCloseTo(expected, 5);
  });
});

describe('paredes diferentes na mesma junção', () => {
  const mk = (typeB: string, kind: 'butt' | 'miter' = 'miter', extraB: Partial<Wall> = {}) =>
    setup([
      wall('a', 0, 0, 4, 0, { joinStart: { kind, flip: false } }),
      wall('b', 0, 0, 0, 3, { typeId: typeB, joinStart: { kind, flip: false }, ...extraB }),
    ]);
  const noOverlap = (s: ProjectStore) => {
    const r = resolveLevel(s.project, 'lv_0');
    const sum = Object.values(r.walls).flatMap((w) => w.layers).reduce((a, l) => a + multiArea(l.cut), 0);
    expect(sum).toBeCloseTo(multiArea(union(...r.clusters.map((c) => c.silhouette))), 3);
    return r;
  };
  it.each(['wt_alv9', 'wt_ext19', 'wt_dry', 'wt_conc15'])('esquadria entre alvenaria 14 e %s: sem sobreposição e estruturas se encontram', (type) => {
    const r = noOverlap(mk(type));
    const structures = r.clusters[0]!.regions.filter((g) => ['mat_bloco14', 'mat_bloco9', 'mat_bloco19', 'mat_perfil', 'mat_concreto'].includes(g.materialId));
    // As duas estruturas se tocam: o conjunto das estruturas forma uma só mancha conexa.
    expect(multiArea(union(...structures.map((g) => g.polygons)))).toBeGreaterThan(0);
    expect(closeGaps(union(...structures.map((g) => g.polygons)))).toHaveLength(1);
  });
  it('encosto com tipos diferentes não gera sobreposição', () => {
    noOverlap(mk('wt_dry', 'butt'));
    noOverlap(mk('wt_ext19', 'butt'));
  });
  it('drywall encostando em alvenaria: a alvenaria (núcleo maior) domina mesmo sendo a mais nova', () => {
    // drywall criado primeiro (ordem menor), alvenaria depois, T: a estrutura de bloco não é cortada pelo perfil.
    const s = setup([wall('d', -3, 0, 3, 0, { typeId: 'wt_dry' }), wall('m', 0, 0, 0, 3)]);
    const r = resolveLevel(s.project, 'lv_0');
    const bloco = r.walls.m!.layers.find((l) => l.materialId === 'mat_bloco14')!;
    expect(multiArea(bloco.cut)).toBeGreaterThan(CORE14 * 2.9 - 1e-6); // o bloco inteiro, sem recorte do perfil
  });
  it('alturas diferentes: a parede baixa não corta a alta acima dela', () => {
    const s = setup([wall('alta', -3, 0, 3, 0, { height: 3 }), wall('baixa', 0, 0, 0, 3, { height: 1 })]);
    const r = resolveLevel(s.project, 'lv_0');
    const alta = r.walls.alta!.layers.find((l) => l.materialId === 'mat_tinta')!; // acabamento da parede alta
    const high = alta.bands.find((b) => b.z0 >= 1 - 1e-6)!;
    const low = alta.bands.find((b) => b.z1 <= 1 + 1e-6)!;
    expect(multiArea(high.poly)).toBeGreaterThan(multiArea(low.poly) - 1e-9); // acima de 1 m nada foi cortado
    expect(r.walls.alta!.layers.every((l) => l.bands.reduce((a, b) => a + (b.z1 - b.z0), 0) <= 3 + 1e-9)).toBe(true);
  });
  it('locationLine diferentes entre as paredes não gera sobreposição', () => {
    noOverlap(mk('wt_alv9', 'butt', { locationLine: 'finishExterior' }));
    noOverlap(mk('wt_alv9', 'miter', { locationLine: 'coreInterior', flipped: true }));
  });
});

describe('paredes em arco', () => {
  const arcWall = (id: string, ax: number, ay: number, bx: number, by: number, sag: number, extra: Partial<Wall> = {}) =>
    wall(id, ax, ay, bx, by, { sag, ...extra });
  it('a área da parede é o comprimento do eixo vezes a espessura', () => {
    const s = setup([arcWall('c', 0, 0, 4, 0, 1)]);
    const len = 2.5 * 2 * Math.asin(0.8);
    expect(silhouetteArea(s)).toBeCloseTo(len * T14, 2);
    expect(coreArea(s)).toBeCloseTo(len * CORE14, 2);
  });
  it('o eixo coincide com as extremidades e a camada externa fica à esquerda', () => {
    const s = setup([arcWall('c', 0, 0, 4, 0, 1, { locationLine: 'finishExterior' })]);
    const r = resolveLevel(s.project, 'lv_0');
    const pts = r.walls.c!.layers.flatMap((l) => l.cut.flatMap((p) => p[0]!));
    // finishExterior: a face externa (esquerda) está sobre o eixo; a parede fica do lado do centro.
    const maxY = Math.max(...pts.map((v) => v.y));
    expect(maxY).toBeCloseTo(1, 2);
  });
  it('arco para o outro lado (flecha negativa) espelha o resultado', () => {
    const a = setup([arcWall('c', 0, 0, 4, 0, 1)]);
    const b = setup([arcWall('c', 0, 0, 4, 0, -1)]);
    // A simetria é exata na geometria das camadas (mesma grade de amostragem, só espelhada): cada camada de `a` tem a área da camada
    // espelhada de `b` (a ordem das camadas é invertida) a 1e-9. A silhueta passa por `closeGaps` (Clipper, grade de 1 µm): o ruído de
    // arredondamento de ~100 vértices é de ~1e-6 m², por isso a silhueta só vale a 5e-6 (o passo do arco novo muda onde o arredondamento cai).
    const camadas = (s: ProjectStore) => resolveLevel(s.project, 'lv_0').walls.c!.layers.map((l) => multiArea(l.cut));
    const ca = camadas(a), cb = [...camadas(b)].reverse();
    ca.forEach((v, i) => expect(v).toBeCloseTo(cb[i]!, 9));
    expect(silhouetteArea(a)).toBeCloseTo(silhouetteArea(b), 5);
  });
  it('canto entre reta e arco: sem sobreposição em encosto e esquadria', () => {
    for (const kind of ['butt', 'miter'] as const) {
      const s = setup([
        wall('r', -3, 0, 0, 0, { joinEnd: { kind, flip: false } }),
        arcWall('c', 0, 0, 3, 0, 0.8, { joinStart: { kind, flip: false } }),
      ]);
      const r = resolveLevel(s.project, 'lv_0');
      const sum = Object.values(r.walls).flatMap((w) => w.layers).reduce((a, l) => a + multiArea(l.cut), 0);
      expect(sum).toBeCloseTo(multiArea(union(...r.clusters.map((c) => c.silhouette))), 3);
      expect(r.clusters).toHaveLength(1);
    }
  });
  it('T de uma reta num arco: o ramal termina na linha de centro do arco', () => {
    const arc = arcWall('c', -2, 0, 2, 0, 1); // r=2,5 centro (0,-1,5)
    const s = setup([arc, wall('b', 0, 0.5, 0, 3)]);
    const f = buildFrame(s.project.elements.c as Wall, s.project.wallTypes.wt_alv14!)!;
    const ends = computeEnds([f, buildFrame(s.project.elements.b as Wall, s.project.wallTypes.wt_alv14!)!]);
    // o ramal parte do ponto (0,0.5) sobre a flecha do arco (apex em y=1): termina no apex, em y=1
    const e = ends.get('b')!.a;
    expect(e.hi.kind).toBe('flat');
  });
  it('porta em parede curva recorta a faixa do vão', () => {
    const s = setup([arcWall('c', 0, 0, 4, 0, 1)]);
    const before = silhouetteArea(s);
    s.exec({ type: 'addOpening', opening: { id: 'd', kind: 'door', typeId: 'ot_p80', hostId: 'c', offset: 2.3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    expect(before - silhouetteArea(s)).toBeCloseTo(0.8 * T14, 2); // vão; o acabamento encosta no batente
  });
  it('quantitativo usa o comprimento do arco', () => {
    const s = setup([arcWall('c', 0, 0, 4, 0, 1)]);
    const q = quantifyLevel(s.project, resolveLevel(s.project, 'lv_0'));
    expect(q.walls[0]!.length).toBeCloseTo(2.5 * 2 * Math.asin(0.8), 6);
  });
  it('espelhar inverte a flecha e a mesma parede copiada tem área idêntica', () => {
    const s = setup([arcWall('c', 0, 0, 4, 0, 1)]);
    s.exec({ type: 'transform', ids: ['c'], transform: { kind: 'mirror', a: { x: 0, y: 2 }, b: { x: 1, y: 2 } }, copy: { idMap: { c: 'c2' } } });
    expect((s.project.elements.c2 as Wall).sag).toBeCloseTo(-1);
    const r = resolveLevel(s.project, 'lv_0');
    const area = (id: string) => r.walls[id]!.layers.reduce((a, l) => a + multiArea(l.cut), 0);
    expect(area('c2')).toBeCloseTo(area('c'), 6);
  });
});

describe('tolerância de junção', () => {
  it('extremidades afastadas só se unem se a tolerância do projeto alcançar a distância', () => {
    const build = (tol: number) => {
      const s = setup([wall('a', 0, 0, 4, 0), wall('b', 4.03, 0.03, 4.03, 3)]);
      s.exec({ type: 'setSettings', patch: { joinTolerance: tol } });
      return s;
    };
    const kind = (s: ProjectStore) => joinStatus(frames2(s), 'a', 'b', s.project.settings.joinTolerance).kind;
    const frames2 = (s: ProjectStore) => Object.values(s.project.elements).filter((e) => e.kind === 'wall').map((w) => buildFrame(w as Wall, s.project.wallTypes[(w as Wall).typeId]!)!);
    expect(kind(build(0.02))).toBe('free');
    expect(kind(build(0.05))).toBe('pair');
  });
});

describe('retorno de acabamento (wrapping)', () => {
  const withWindow = (wt: Partial<{ wrapInserts: 'none' | 'interior' | 'exterior' | 'both'; wrapEnds: 'none' | 'interior' | 'exterior' | 'both' }>, closure?: 'inherit' | 'none' | 'interior' | 'exterior' | 'both', extra: Partial<OpeningType> = {}) => {
    const s = setup([wall('a', 0, 0, 4, 0)]);
    s.exec({ type: 'upsertWallType', wallType: { ...s.project.wallTypes.wt_alv14!, ...wt } });
    if (closure || Object.keys(extra).length) s.exec({ type: 'upsertOpeningType', openingType: { ...s.project.openingTypes.ot_j120!, ...(closure ? { closure } : {}), ...extra } });
    s.exec({ type: 'addOpening', opening: { id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'a', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    return s;
  };
  const base = (4 - 1.2) * T14;
  it('sem retorno o vão é só um recorte', () => {
    expect(silhouetteArea(withWindow({ wrapInserts: 'none' }))).toBeCloseTo(base, 5);
  });
  it('tipo com batente: `inherit` encosta no batente e não cria retorno', () => {
    expect(silhouetteArea(withWindow({ wrapInserts: 'both' }))).toBeCloseTo(base, 5);
    expect(silhouetteArea(withWindow({ wrapInserts: 'exterior' }))).toBeCloseTo(base, 5);
    expect(silhouetteArea(withWindow({ wrapInserts: 'interior' }))).toBeCloseTo(base, 5);
  });
  it('o fechamento explícito é recortado pelo batente; sem batente vale o da parede', () => {
    expect(silhouetteArea(withWindow({ wrapInserts: 'both' }, 'none'))).toBeCloseTo(base, 5);
    // Batente no núcleo (0,14 m de 0,184 m): o batente recorta o fechamento só no núcleo. Sobram 4 faixas
    // de reboco (2,2 cm × 2,2 cm) entre a face da parede e o núcleo nas ombreiras (medido: 1,936e-3 m²), e não
    // dependem da largura nem da altura do vão. Com o batente faceado (padrão) não sobra retorno.
    expect(silhouetteArea(withWindow({ wrapInserts: 'none' }, 'both', { frameDepthMode: 'core' }))).toBeCloseTo(base + 4 * 0.022 * 0.022, 6);
    expect(silhouetteArea(withWindow({ wrapInserts: 'none' }, 'both'))).toBeCloseTo(base, 6);
    // Vão livre (sem batente) mantém o retorno da parede.
    const vao = setup([wall('a', 0, 0, 4, 0)]);
    vao.exec({ type: 'upsertWallType', wallType: { ...vao.project.wallTypes.wt_alv14!, wrapInserts: 'both' } });
    vao.exec({ type: 'addOpening', opening: { id: 'v', kind: 'window', typeId: 'ot_jv120', hostId: 'a', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    expect(silhouetteArea(vao)).toBeCloseTo((4 - 1.2) * T14 + 4 * 0.022 * (T14 / 2), 5);
  });
  it('3D: o retorno só existe na altura do vão (vão livre)', () => {
    const s = setup([wall('a', 0, 0, 4, 0)]);
    s.exec({ type: 'upsertWallType', wallType: { ...s.project.wallTypes.wt_alv14!, wrapInserts: 'both' } });
    s.exec({ type: 'addOpening', opening: { id: 'v', kind: 'window', typeId: 'ot_jv120', hostId: 'a', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const layers = resolveLevel(s.project, 'lv_0').walls.a!.layers;
    const reboco = layers.find((l) => l.layerIndex === 1)!; // reboco externo (2 cm), envolve
    const area = (z: number) => multiArea(reboco.bands.find((b) => z > b.z0 && z < b.z1)!.poly);
    expect(reboco.bands).toHaveLength(3); // abaixo do peitoril, no vão, acima da verga
    const lost = 1.2 * 0.02; // área da camada removida pelo vão de 1,2 m
    const kept = 2 * 0.02 * (T14 / 2); // retorno desta camada (dois cantos) até a metade da espessura
    expect(area(0.5) - area(1.7)).toBeCloseTo(lost - kept, 5);
    expect(area(0.5)).toBeCloseTo(area(2.5), 9);
  });
  it('extremidades livres: os acabamentos contornam a ponta', () => {
    const s = setup([wall('a', 0, 0, 4, 0)]);
    s.exec({ type: 'upsertWallType', wallType: { ...s.project.wallTypes.wt_alv14!, wrapEnds: 'both' } });
    expect(silhouetteArea(s)).toBeCloseTo(4 * T14 + 2 * 0.022 * T14, 5);
  });
  it('extremidade ligada a outra parede não recebe retorno', () => {
    const s = setup([wall('a', 0, 0, 4, 0), wall('b', 4, 0, 4, 3)]);
    for (const id of ['wt_alv14']) s.exec({ type: 'upsertWallType', wallType: { ...s.project.wallTypes[id]!, wrapEnds: 'both' } });
    const free = silhouetteArea(s);
    const noWrap = setup([wall('a', 0, 0, 4, 0), wall('b', 4, 0, 4, 3)]);
    // só as duas pontas livres (a em x=0 e b em y=3) ganham retorno
    expect(free).toBeCloseTo(silhouetteArea(noWrap) + 2 * 0.022 * T14, 5);
  });
});

describe('prioridade por camada (substituição)', () => {
  it('uma camada com prioridade 1 atravessa a estrutura da parede que cruza', () => {
    // Dois tipos iguais cruzando em X. Sem substituição, o bloco de 'h' (mais antigo) vence a tinta de 'v'.
    const plain = setup([wall('h', -2, 0, 2, 0), wall('v', 0, -2, 0, 2)]);
    const baseCore = coreArea(plain);
    // Tipo variante: a tinta externa e interna de 'v' passam a ter prioridade 0 (mais forte que a estrutura).
    const s = setup([wall('h', -2, 0, 2, 0), wall('v', 0, -2, 0, 2, { typeId: 'wt_forte' })]);
    const base = s.project.wallTypes.wt_alv14!;
    s.exec({ type: 'upsertWallType', wallType: { ...base, id: 'wt_forte', name: 'forte', layers: base.layers.map((l) => (l.function === 'finish2' ? { ...l, priority: 0 } : l)) } });
    s.exec({ type: 'updateElements', ids: ['v'], patch: { typeId: 'wt_forte' } });
    expect(coreArea(s)).toBeLessThan(baseCore - 1e-6); // a tinta de v cortou o bloco de h no cruzamento
  });
});

describe('faixas verticais (rodapé, barra de azulejo)', () => {
  const withStrips = (strips: Array<{ side: 'exterior' | 'interior'; material: string; t: number; z0: number; z1: number }>, walls: Array<Omit<Wall, 'order'>> = [wall('a', 0, 0, 4, 0)]) => {
    const s = setup(walls);
    const base = s.project.wallTypes.wt_alv14!;
    s.exec({ type: 'upsertWallType', wallType: { ...base, strips: strips.map((x, i) => ({ id: `st${i}`, name: `f${i}`, side: x.side, materialId: x.material, thickness: x.t, z0: x.z0, z1: x.z1 })) } });
    return s;
  };
  const vol = (s: ProjectStore, mat: string) => quantifyLevel(s.project, resolveLevel(s.project, 'lv_0')).volumeByMaterial[mat] ?? 0;
  it('rodapé baixo não aparece em planta mas existe no 3D e nos quantitativos', () => {
    const s = withStrips([{ side: 'interior', material: 'mat_madeira', t: 0.02, z0: 0, z1: 0.1 }]);
    expect(silhouetteArea(s)).toBeCloseTo(4 * T14, 6);
    expect(vol(s, 'mat_madeira')).toBeCloseTo(4 * 0.02 * 0.1, 6);
  });
  it('barra de azulejo alta aparece em planta fora da face externa', () => {
    const s = withStrips([{ side: 'exterior', material: 'mat_ceramica', t: 0.01, z0: 0, z1: 1.5 }]);
    expect(silhouetteArea(s)).toBeCloseTo(4 * (T14 + 0.01), 6);
    expect(vol(s, 'mat_ceramica')).toBeCloseTo(4 * 0.01 * 1.5, 6);
    const r = resolveLevel(s.project, 'lv_0');
    const ys = r.walls.a!.layers.filter((l) => l.layerIndex < 0).flatMap((l) => l.cut.flatMap((p) => p[0]!.map((v) => v.y)));
    expect(Math.max(...ys)).toBeCloseTo(T14 / 2 + 0.01, 6); // exterior à esquerda (y>0)
  });
  it('a faixa é cortada pela porta (mesma altura) e pelo trecho do vão acima do peitoril', () => {
    const s = withStrips([{ side: 'exterior', material: 'mat_ceramica', t: 0.01, z0: 0, z1: 1.5 }]);
    s.exec({ type: 'addOpening', opening: { id: 'd', kind: 'door', typeId: 'ot_p80', hostId: 'a', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    s.exec({ type: 'addOpening', opening: { id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'a', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const expected = 4 * 0.01 * 1.5 - 0.8 * 0.01 * 1.5 - 1.2 * 0.01 * (1.5 - 1.1);
    expect(vol(s, 'mat_ceramica')).toBeCloseTo(expected, 6);
  });
  it('em um canto, as faixas das duas paredes não se sobrepõem', () => {
    const s = withStrips([{ side: 'exterior', material: 'mat_ceramica', t: 0.01, z0: 0, z1: 1.5 }], [wall('a', 0, 0, 4, 0), wall('b', 4, 0, 4, 3)]);
    const r = resolveLevel(s.project, 'lv_0');
    const sum = Object.values(r.walls).flatMap((w) => w.layers).reduce((a, l) => a + multiArea(l.cut), 0);
    expect(sum).toBeCloseTo(multiArea(union(...r.clusters.map((c) => c.silhouette))), 3);
  });
  it('altura da faixa limitada pela parede', () => {
    const s = withStrips([{ side: 'interior', material: 'mat_madeira', t: 0.02, z0: 2.5, z1: 5 }]);
    expect(vol(s, 'mat_madeira')).toBeCloseTo(4 * 0.02 * 0.3, 6);
  });
});
