import { describe, expect, it } from 'vitest';
import { intersection, multiArea } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeSlab, makeWall, type Layer, type LayerTermino, type Project } from '@hestia/model';
import { camada, projetoComPerfil, projetoComTopoAnexado, projetoComTopoNoTelhado, TIPOS_DE_PAREDE } from '../../../tests/termino-camada-casos.ts';
import { resolveFloors } from './floors.ts';
import { bandKey, junctionLevelTs } from './junctionLevel.ts';
import { projectIssues } from './projectIssues.ts';
import { resolveLevelTs } from './resolve.ts';
import { resolveSlabs } from './slabs.ts';
import { wallsOfLevel } from './terminoBlock.ts';
import { bordaDaCamada, type CamadaDeBusca } from './terminoCamada.ts';
import { avisosTerminoCamada } from './terminoCamadaAvisos.ts';
import { trechosReais } from './terminoBlock.ts';

/** Camadas de parede como a busca as vê, a partir de uma lista (função, espessura). */
const camadasDe = (l: ReadonlyArray<readonly [string, number]>): { camadas: CamadaDeBusca[]; total: number } => {
  let d = 0;
  const camadas = l.map(([funcao, e]) => {
    const c = { funcao, de: d, ate: d + e };
    d += e;
    return c;
  });
  return { camadas, total: d };
};

const DOIS = camadasDe([['finish2', 0.01], ['substrate', 0.02], ['structure', 0.1], ['substrate', 0.02], ['finish1', 0.01]]);
const UM = camadasDe([['finish2', 0.01], ['structure', 0.1], ['substrate', 0.02], ['finish1', 0.01]]);

describe('bordaDaCamada (decisão 0054): a camada da parede, o lado, a face e o deslocamento', () => {
  const b = (c: { camadas: CamadaDeBusca[]; total: number }, funcao: string, lado: 'proximo' | 'distante', face: 'proxima' | 'meio' | 'distante', cm: number, ext: boolean) =>
    bordaDaCamada(c.camadas, c.total, { funcao: funcao as never, lado, face, cm }, ext ? 'ext' : 'int');

  it('estrutura: as três faces, com a laje do lado externo e do lado interno', () => {
    expect(b(DOIS, 'structure', 'proximo', 'proxima', 0, true).borda).toBeCloseTo(0.03, 12);
    expect(b(DOIS, 'structure', 'proximo', 'meio', 0, true).borda).toBeCloseTo(0.08, 12);
    expect(b(DOIS, 'structure', 'proximo', 'distante', 0, true).borda).toBeCloseTo(0.13, 12);
    // laje no lado interno: a face próxima é a de profundidade maior
    expect(b(DOIS, 'structure', 'proximo', 'proxima', 0, false).borda).toBeCloseTo(0.13, 12);
    expect(b(DOIS, 'structure', 'proximo', 'distante', 0, false).borda).toBeCloseTo(0.03, 12);
  });

  it('o deslocamento avança para dentro da parede (positivo) ou recua (negativo), conforme o lado da laje', () => {
    expect(b(DOIS, 'structure', 'proximo', 'proxima', 2, true).borda).toBeCloseTo(0.05, 12);
    expect(b(DOIS, 'structure', 'proximo', 'proxima', -2, true).borda).toBeCloseTo(0.01, 12);
    expect(b(DOIS, 'structure', 'proximo', 'proxima', 2, false).borda).toBeCloseTo(0.11, 12);
    expect(b(DOIS, 'structure', 'proximo', 'proxima', -2, false).borda).toBeCloseTo(0.15, 12);
  });

  it('lado: proximo é o lado da laje e distante o oposto; o substrato do outro lado é outra camada', () => {
    // laje no lado externo: substrato proximo = o de profundidade 0,01 a 0,03; distante = o de 0,13 a 0,15
    expect(b(DOIS, 'substrate', 'proximo', 'proxima', 0, true)).toEqual({ borda: 0.01, aviso: false });
    expect(b(DOIS, 'substrate', 'distante', 'proxima', 0, true).borda).toBeCloseTo(0.13, 12);
    expect(b(DOIS, 'substrate', 'distante', 'proxima', 0, true).aviso).toBe(false);
    // laje no lado interno: o proximo é o de 0,13 a 0,15, pela face voltada para a laje (0,15)
    expect(b(DOIS, 'substrate', 'proximo', 'proxima', 0, false).borda).toBeCloseTo(0.15, 12);
  });

  it('substrato só de um lado: a busca no lado sem substrato cai na camada seguinte e avisa', () => {
    // UM: substrato só na metade interna. Laje externa, proximo = metade externa, sem substrato
    const r = b(UM, 'substrate', 'proximo', 'proxima', 0, true);
    expect(r.aviso).toBe(true);
    expect(r.borda).toBeCloseTo(0.11, 12);
    // distante = a metade interna, onde ele está: sem aviso
    expect(b(UM, 'substrate', 'distante', 'proxima', 0, true)).toEqual({ borda: 0.11, aviso: false });
  });

  it('parede sem a função pedida em lugar nenhum: vale a primeira camada do lado pedido, com aviso', () => {
    const r = b(UM, 'thermal', 'proximo', 'proxima', 0, true);
    expect(r.aviso).toBe(true);
    expect(r.borda).toBeCloseTo(0, 12);
  });

  it('eixo: o centro da espessura total, mais o deslocamento, sem aviso', () => {
    expect(b(DOIS, 'eixo', 'proximo', 'proxima', 0, true)).toEqual({ borda: 0.08, aviso: false });
    expect(b(DOIS, 'eixo', 'distante', 'distante', 3, true).borda).toBeCloseTo(0.11, 12);
    expect(b(DOIS, 'eixo', 'proximo', 'meio', 3, false).borda).toBeCloseTo(0.05, 12);
  });

  it('a camada do meio da espessura conta nas duas metades', () => {
    const tres = camadasDe([['finish1', 0.02], ['structure', 0.1], ['finish2', 0.02]]);
    expect(b(tres, 'structure', 'proximo', 'meio', 0, true).aviso).toBe(false);
    expect(b(tres, 'structure', 'distante', 'meio', 0, true).aviso).toBe(false);
  });
});

/** Um cômodo de 4 x 3 m (eixos), quatro paredes do tipo dado, e uma laje vinculada de uma camada de estrutura com a regra dada. */
function comodo(tipoParede: string, regra: LayerTermino): Project {
  const base = createEmptyProject();
  const s = new ProjectStore(base);
  const t = base.wallTypes['wt_alv14']!;
  s.exec({ type: 'upsertWallType', wallType: { ...t, id: tipoParede, name: tipoParede, code: tipoParede, layers: TIPOS_DE_PAREDE[tipoParede]! } });
  const camadas: Layer[] = [{ function: 'structure', materialId: 'mat_concreto', thickness: 0.1, wraps: false, termino: regra }];
  s.exec({ type: 'upsertSlabType', slabType: { id: 'ls_um', name: 'um', code: 'um', description: '', cost: 0, layers: camadas } });
  const R = [[0, 0], [4, 0], [4, 3], [0, 3]] as const;
  R.forEach(([x, y], i) => {
    const [x2, y2] = R[(i + 1) % 4]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: tipoParede, levelId: 'lv_0', a: { x, y }, b: { x: x2, y: y2 }, height: 2.8, joinStart: { kind: 'miter', flip: false }, joinEnd: { kind: 'miter', flip: false } }) });
  });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'lj', typeId: 'ls_um', levelId: 'lv_0', heightOffset: 0.2, boundary: R.map(([x, y]) => ({ x, y })), outlineSource: { mode: 'walls-finish', seed: { x: 2, y: 1.5 }, linked: true } }) });
  return s.project;
}

const area = (p: Project): number => multiArea(resolveSlabs(p, 'lv_0')[0]!.layers[0]!.polygon);

describe('laje vinculada com término por camada da parede (decisão 0054): áreas exatas', () => {
  // wt_t_dois: 16 cm no total, as paredes centradas nos eixos, circuito de acabamento 3,84 x 2,84 m
  it('sem deslocamento, a camada avança até a face próxima, a do meio e a distante da estrutura (3 cm, 8 cm e 13 cm)', () => {
    expect(area(comodo('wt_t_dois', camada('structure', 'proximo', 'proxima')))).toBeCloseTo(3.9 * 2.9, 6);
    expect(area(comodo('wt_t_dois', camada('structure', 'proximo', 'meio')))).toBeCloseTo(4 * 3, 6);
    expect(area(comodo('wt_t_dois', camada('structure', 'proximo', 'distante')))).toBeCloseTo(4.1 * 3.1, 6);
  });

  it('o eixo é a linha de centro da espessura: 4 x 3 m, mais ou menos o deslocamento', () => {
    expect(area(comodo('wt_t_dois', camada('eixo', 'proximo', 'proxima')))).toBeCloseTo(4 * 3, 6);
    expect(area(comodo('wt_t_dois', camada('eixo', 'proximo', 'proxima', 2)))).toBeCloseTo(4.04 * 3.04, 6);
    expect(area(comodo('wt_t_dois', camada('eixo', 'proximo', 'proxima', -2)))).toBeCloseTo(3.96 * 2.96, 6);
  });

  it('recuo: -1 cm a partir da face próxima da estrutura (3 cm): avança 2 cm', () => {
    expect(area(comodo('wt_t_dois', camada('structure', 'proximo', 'proxima', -1)))).toBeCloseTo(3.88 * 2.88, 6);
  });

  it('recuo além da face: a camada para antes da parede (-2 cm a partir da face externa)', () => {
    expect(area(comodo('wt_t_dois', camada('finish2', 'proximo', 'proxima', -2)))).toBeCloseTo(3.8 * 2.8, 6);
  });

  it('parede sem substrato: cai na primeira camada do lado (a estrutura) com aviso, nos quatro lados', () => {
    const p = comodo('wt_t_sem', camada('substrate', 'proximo', 'proxima'));
    expect(area(p)).toBeCloseTo(3.86 * 2.86, 6);
    const avisos = avisosTerminoCamada(p);
    expect(avisos).toHaveLength(4);
    expect(avisos.every((a) => a.code === 'termino-camada-sem-funcao' && a.elementId === 'lj' && a.ids?.[0] === 'lj' && /^w[0-3]$/.test(a.ids?.[1] ?? ''))).toBe(true);
    expect(projectIssues(p).filter((a) => a.code === 'termino-camada-sem-funcao')).toHaveLength(4);
  });

  it('substrato só de um lado: avisa quando o lado pedido é o que não tem', () => {
    const procurado = [avisosTerminoCamada(comodo('wt_t_um', camada('substrate', 'distante', 'proxima'))).length, avisosTerminoCamada(comodo('wt_t_um', camada('substrate', 'proximo', 'proxima'))).length];
    // a laje do cômodo fica de um mesmo lado de todas as paredes: ou o lado próximo ou o distante tem o substrato, e o outro avisa nas quatro
    expect(procurado.sort()).toEqual([0, 4]);
  });

  it('as variantes antigas seguem iguais (face, núcleo)', () => {
    expect(area(comodo('wt_t_dois', 'face'))).toBeCloseTo(3.84 * 2.84, 6);
    expect(area(comodo('wt_t_dois', 'nucleo'))).toBeCloseTo(3.9 * 2.9, 6);
  });
});

describe('a camada vence a parede onde se cruzam (junção) e o volume não se duplica', () => {
  it('as camadas da parede perdem a faixa que a camada da laje ocupa', () => {
    const p = comodo('wt_t_dois', camada('structure', 'proximo', 'distante'));
    const laje = resolveSlabs(p, 'lv_0')[0]!.layers[0]!;
    const jl = junctionLevelTs(p, 'lv_0');
    const rws = Object.values(resolveLevelTs(p, 'lv_0').walls);
    let sobreposicao = 0;
    let volumeParede = 0;
    let volumeBruto = 0;
    for (const rw of rws) {
      for (const l of rw.layers) {
        l.bands.forEach((band, bi) => {
          const partes = jl.walls.get(rw.wallId)?.bands.get(bandKey(l.layerIndex, bi)) ?? [{ poly: band.poly, z0: rw.baseZ + band.z0, z1: rw.baseZ + band.z1 }];
          volumeBruto += multiArea(band.poly) * (band.z1 - band.z0);
          for (const part of partes) {
            volumeParede += multiArea(part.poly) * (part.z1 - part.z0);
            const z = Math.min(part.z1, laje.z1) - Math.max(part.z0, laje.z0);
            if (z > 1e-6) sobreposicao += multiArea(intersection(part.poly, laje.polygon)) * z;
          }
        });
      }
    }
    expect(sobreposicao, 'volume comum entre as camadas da parede e a da laje').toBeLessThan(1e-9);
    // a parede perdeu exatamente o que a laje ocupa dela (a faixa entre a face de acabamento e a borda, na altura da camada)
    const ocupado = multiArea(laje.polygon) - 3.84 * 2.84;
    expect(ocupado).toBeGreaterThan(0.5);
    expect(volumeBruto - volumeParede).toBeCloseTo(ocupado * (laje.z1 - laje.z0), 5);
  });
});

describe('parede com topo anexado e com perfil: só bloqueia a camada onde existe (decisão 0054)', () => {
  it('topo anexado abaixo da laje de cima: o topo real é a face inferior da laje e a camada acima dele fica inteira', () => {
    const p = projetoComTopoAnexado();
    const rws = wallsOfLevel(p, 'lv_0');
    // laje do nível 1: topo em 3 m, camadas 5 + 5 + 10 cm: face inferior em 2,8 m; o topo NOMINAL da parede é 3 m (a altura do modelo é 2,8 mais o anexo)
    for (const rw of rws) {
      expect(rw.baseZ + rw.height).toBeCloseTo(2.8, 6);
      expect(rw.nominalZ1).toBeGreaterThan(rw.baseZ + rw.height + 0.05);
    }
    const laje = resolveSlabs(p, 'lv_1')[0]!;
    // camada de cima (2,95 a 3 m) e a seguinte (2,9 a 2,95 m), ambas 'face', acima do topo real: sem recorte de parede
    expect(multiArea(laje.layers[0]!.polygon)).toBeCloseTo(multiArea(laje.polygon), 6);
    expect(multiArea(laje.layers[1]!.polygon)).toBeCloseTo(multiArea(laje.polygon), 6);
  });

  it('topo no telhado real abaixo da laje: as camadas de cima da laje, acima do topo da parede, ficam inteiras', () => {
    const p = projetoComTopoNoTelhado();
    const rws = wallsOfLevel(p, 'lv_0');
    for (const rw of rws) expect(rw.baseZ + rw.height).toBeLessThan(2.85);
    const laje = resolveSlabs(p, 'lv_1')[0]!;
    expect(multiArea(laje.layers[0]!.polygon)).toBeCloseTo(multiArea(laje.polygon), 6);
    expect(multiArea(laje.layers[1]!.polygon)).toBeCloseTo(multiArea(laje.polygon), 6);
  });

  it('perfil em rampa: a parede só toca a camada nos trechos em que o topo a alcança', () => {
    const p = projetoComPerfil();
    const rw = wallsOfLevel(p, 'lv_0')[0]!;
    // topo de 3 m (t = 0) a 0,1 m (t = 4): a camada que vai de 1,4 a 1,5 m é tocada até onde o topo vale 1,399 m
    const t = trechosReais(p, rw, 1.4, 1.5)!;
    expect(t).toHaveLength(1);
    expect(t[0]![0]).toBeCloseTo(0, 9);
    expect(t[0]![1]).toBeCloseTo(((3 - 1.399) * 4) / 2.9, 6);
    // uma faixa que a parede não alcança em lugar nenhum não tem trecho
    expect(trechosReais(p, rw, 3.5, 3.6)).toEqual([]);
    // uma faixa que a parede inteira alcança tem a parede inteira (null)
    expect(trechosReais(p, rw, 0.05, 0.09)).toBeNull();
    // o piso (topo em 1,5 m, camada de 1,45 a 1,5 m) só é cortado pela parede nos trechos em que ela chega a 1,449 m
    const piso = resolveFloors(p, 'lv_0')[0]!;
    const cheia = multiArea(piso.polygon);
    const cortada = multiArea(piso.layers[0]!.polygon);
    const lenCortado = ((3 - 1.449) * 4) / 2.9;
    expect(cheia - cortada).toBeCloseTo(0.184 * lenCortado, 2);
  });
});
