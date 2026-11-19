import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeRoof, makeWall, type Project, type Roof, type Wall } from '@hestia/model';
import { quantifyLevel, resolveLevel, wallZRange } from './index.ts';

/**
 * Telhado de 8 x 10 m (x −1..7, y −1..9) com beiral em 3 m (heightOffset 3), 30 %, tipo rt_ceramica (espessura 0,095 m).
 * Parede de (0,0) a (6,0), 3 m de altura, sob o telhado. O eixo fica dentro do telhado, 1 m do beiral (y = −1).
 * Dir (1,0): cumeeira em y = 4 (meio da largura y −1..9), altura 3 + 0,3 × 5 = 4,50 m. Parede paralela à cumeeira:
 * em y = 0 a água está em 3 + 0,3 × 1 = 3,30 m, então a face inferior vale 3,30 − 0,095 = 3,205 m, reto ao longo de x.
 * Dir (0,1): cumeeira em x = 3, altura 3 + 0,3 × 4 = 4,20 m. Parede perpendicular (empena): face inferior 3,205 m nas
 * pontas (x = 0 e x = 6) e 4,20 − 0,095 = 4,105 m em x = 3, com perfil em V.
 */
const T_ROOF = 0.095;
const EAVE = 3;
const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function build(walls: Array<Omit<Wall, 'order'>>, roofs: Array<Partial<Roof>> = [{}]): Project {
  const s = new ProjectStore(createEmptyProject());
  roofs.forEach((r, i) =>
    s.exec({
      type: 'addRoof',
      roof: makeRoof({ id: `r${i + 1}`, typeId: 'rt_ceramica', levelId: 'lv_0', boundary: rect(-1, -1, 7, 9), shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 }, heightOffset: EAVE, ...r }),
    }),
  );
  for (const w of walls) s.exec({ type: 'addWall', wall: w });
  return s.project;
}

const wall = (extra: Partial<Wall> = {}): Omit<Wall, 'order'> =>
  makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3, attachTopToRoof: true, ...extra });

const zOf = (p: Project) => wallZRange(p, p.elements.w1 as Wall);
const wallThickness = (p: Project): number => p.wallTypes.wt_alv14!.layers.reduce((s, l) => s + l.thickness, 0);

describe('C1 · topo da parede sob telhado: parede paralela à cumeeira', () => {
  it('topo reto na face inferior do telhado: 3,205 m ao longo de toda a parede', () => {
    const p = build([wall({})], [{ dir: { x: 1, y: 0 } }]);
    const z = zOf(p);
    expect(z.z0).toBe(0);
    expect(z.height).toBeCloseTo(3 + 0.3 * 1 - T_ROOF, 9);
    expect(z.profile).toEqual([
      { t: 0, h: expect.closeTo(3.205, 9) },
      { t: 3, h: expect.closeTo(3.205, 9) },
      { t: 6, h: expect.closeTo(3.205, 9) },
    ]);
  });

  it('volume da parede = espessura × 6 m × altura média 3,205 m', () => {
    const p = build([wall({})], [{ dir: { x: 1, y: 0 } }]);
    const rw = resolveLevel(p, 'lv_0').walls.w1!;
    expect(rw.height).toBeCloseTo(3.205, 9);
    const vol = quantifyLevel(p, resolveLevel(p, 'lv_0')).walls.find((w) => w.wallId === 'w1')!.volume;
    expect(vol).toBeCloseTo(wallThickness(p) * 6 * 3.205, 6);
  });
});

describe('C1 · parede perpendicular à cumeeira (empena): topo em V', () => {
  const gable = (): Project => build([wall({})], [{ dir: { x: 0, y: 1 } }]);

  it('altura máxima de 4,105 m sob a cumeeira e 3,205 m nas pontas, com o perfil em V', () => {
    const z = zOf(gable());
    expect(z.z0).toBe(0);
    expect(z.height).toBeCloseTo(4.2 - T_ROOF, 9);
    const at = (t: number) => z.profile!.find((q) => Math.abs(q.t - t) < 1e-9)?.h;
    expect(at(0)).toBeCloseTo(3.205, 9);
    expect(at(3)).toBeCloseTo(4.105, 9);
    expect(at(6)).toBeCloseTo(3.205, 9);
    expect(at(1.5)).toBeCloseTo(3.655, 9);
  });

  it('volume = área × altura média: espessura × 6 × 3,655 m (média de V entre 3,205 e 4,105)', () => {
    const p = gable();
    const vol = quantifyLevel(p, resolveLevel(p, 'lv_0')).walls.find((w) => w.wallId === 'w1')!.volume;
    expect(vol).toBeCloseTo(wallThickness(p) * 6 * 3.655, 6);
  });

  it('o perfil resolvido vai para as faixas: a maior cota da parede no engine é 4,105 m', () => {
    const rw = resolveLevel(gable(), 'lv_0').walls.w1!;
    expect(rw.height).toBeCloseTo(4.105, 9);
    const topMax = Math.max(...rw.layers.flatMap((l) => l.bands.map((b) => b.z1)));
    expect(topMax).toBeCloseTo(4.105, 6);
  });
});

describe('C1 · quando o topo não se ajusta', () => {
  it('sem attachTopToRoof a parede mantém a altura do modelo', () => {
    expect(zOf(build([wall({ attachTopToRoof: false })], [{ dir: { x: 0, y: 1 } }]))).toEqual({ z0: 0, height: 3 });
  });

  it('parede fora do telhado mantém a altura normal', () => {
    const p = build([wall({ a: { x: 0, y: -5 }, b: { x: 6, y: -5 } })], [{ dir: { x: 0, y: 1 } }]);
    expect(zOf(p)).toEqual({ z0: 0, height: 3 });
  });

  it('eixo que sai do telhado: só o trecho coberto segue o telhado (sobe a 4,105 m na cumeeira); x de 7 a 10 fica em 3 m', () => {
    // Telhado de x −1 a 7: o eixo de x 0 a 10 está sob ele até x = 7. Depois, altura normal, com degrau em x = 7.
    const p = build([wall({ b: { x: 10, y: 0 } })], [{ dir: { x: 0, y: 1 } }]);
    const z = zOf(p);
    expect(z.profile).toBeDefined();
    expect(z.profile!.some((pt) => Math.abs(pt.t - 10) < 1e-6 && Math.abs(pt.h - 3) < 1e-6)).toBe(true);
    expect(z.height).toBeCloseTo(4.105, 6);
  });

  it('telhado de outro nível que cobre o eixo conta: a cobertura pode estar desenhada no nível de cima', () => {
    // Mesmo telhado do caso anterior, mas em lv_1 (cota 3): toda a face sobe 3 m. A cumeeira (x = 3) fica em
    // 3 + 3 + 0,3 × 4 = 7,20 m, face inferior 7,105 m. O nível do telhado não decide o anexo (decisão 0008, item 14).
    const p = build([wall({})], [{ dir: { x: 0, y: 1 }, levelId: 'lv_1' }]);
    const z = zOf(p);
    expect(z.height).toBeCloseTo(4.2 + 3 - T_ROOF, 9);
    expect(z.profile).toBeDefined();
  });

  it('face de telhado abaixo da base da parede não anexa (a parede não pode ficar sem altura)', () => {
    // Parede em lv_1 (base 3 m) sob um telhado de lv_0 com beiral em 0,5 m: a face fica abaixo da base.
    const p = build([wall({ levelId: 'lv_1', height: 2.8, attachTopToRoof: true })], [{ dir: { x: 0, y: 1 }, levelId: 'lv_0', heightOffset: 0.5 }]);
    expect(zOf(p)).toEqual({ z0: 3, height: 2.8 });
  });

  it('com topLevelId no nível do telhado, a face inferior desse telhado conta', () => {
    const p = build([wall({ topLevelId: 'lv_1', topOffset: 0 })], [{ dir: { x: 1, y: 0 }, levelId: 'lv_1', heightOffset: 0 }]);
    expect(zOf(p).height).toBeCloseTo(3.205, 9);
  });
});

describe('C1 · attachTopRoofFull: topo cortado em toda a espessura', () => {
  const half = (p: Project): number => wallThickness(p) / 2;

  it('parede paralela à cumeeira: o topo vale a face mais baixa (lado do beiral), sem furar a água', () => {
    const p = build([wall({ attachTopRoofFull: true })], [{ dir: { x: 1, y: 0 } }]);
    const z = zOf(p);
    // A água cai 0,30 por metro em direção ao beiral (y = −1): a face em y = −meia espessura é a mais baixa.
    expect(z.height).toBeCloseTo(3.205 - 0.3 * half(p), 9);
  });

  it('sem a marca, o eixo decide como antes (3,205)', () => {
    expect(zOf(build([wall({})], [{ dir: { x: 1, y: 0 } }])).height).toBeCloseTo(3.205, 9);
  });

  it('empena: perfil em V igual ao do eixo (as faces estão à mesma cota ao longo da cumeeira)', () => {
    const p = build([wall({ attachTopRoofFull: true })], [{ dir: { x: 0, y: 1 } }]);
    expect(zOf(p).height).toBeCloseTo(4.2 - T_ROOF, 9);
  });
});
