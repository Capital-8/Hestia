import { describe, expect, it } from 'vitest';
import { multiArea, multiPoints } from '@hestia/geom';
import { sectionOfRoofs } from './section.ts';
import { OCCLUSION_RANK, cotaKeys, visibleParts, type OcclusionItem } from './sectionOcclusion.ts';
import type { ResolvedRoof } from './roofs.ts';

/**
 * Reproduções (revisão de corte/elevação em telhados). `it.fails` = o comportamento CORRETO está escrito e hoje não vale;
 * quando o motor for corrigido, o teste passa a falhar como "inesperadamente passou" e deve virar `it`.
 */
const EAVE = 2.8;
const shed = (): ResolvedRoof => ({
  roofId: 's',
  typeId: 'rt_ceramica',
  levelId: 'lv_0',
  eaveZ: EAVE,
  joinedArea: 0,
  layers: [{ layerIndex: 0, materialId: 'mat_telha_ceramica', thickness: 0.02, below: 0 }],
  // 8 × 6, sobe em +y a 30 %: beiral em y = 0 (z 2,80), alto em y = 6 (z 4,60).
  planes: [{ polygon: [[[{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }]]], origin: { x: 0, y: 0 }, up: { x: 0, y: 1 }, percent: 30, z0: EAVE }],
  lines: [],
});

describe('item 1: elemento que sai da água é escondido pelo telhado inteiro (oclusão por ponto mais próximo)', () => {
  // Elevação vista de y = −2. A água vai de profundidade 2 (beiral) a 8 (alto). Uma chaminé a profundidade 4 (y = 2),
  // t de 3 a 4, nasce na água (z = 2,80 + 0,30 × 2 = 3,40) e sobe a 6,00: ela está NA FRENTE da parte alta da água.
  const roof = sectionOfRoofs([shed()], { a: { x: 0, y: -2 }, b: { x: 8, y: -2 }, depth: 9 });
  const chimney = [[[{ x: 3, y: 3.4 }, { x: 4, y: 3.4 }, { x: 4, y: 6 }, { x: 3, y: 6 }]]];
  const items: OcclusionItem[] = [
    ...roof.beyond.map((b) => ({ depth: b.depth, rank: OCCLUSION_RANK.beyond, polygons: b.polygons })),
    { depth: 4, rank: OCCLUSION_RANK.beyond, polygons: chimney },
  ];

  it('diagnóstico: a água tem profundidade 2 e cobre a faixa da chaminé até a cota do alto (4,60)', () => {
    expect(roof.beyond[0]!.depth).toBeCloseTo(2, 9);
    expect(Math.max(...multiPoints(roof.beyond[0]!.polygons).map((v) => v.y))).toBeCloseTo(4.6, 9);
  });

  it.fails('a chaminé deveria aparecer inteira (1 × 2,60 m²); hoje só sobra a parte acima de 4,60 (1 × 1,40)', () => {
    const vis = visibleParts(items);
    const chimneyVisible = multiArea(vis[items.length - 1]!);
    expect(chimneyVisible).toBeCloseTo(2.6, 3);
  });
});

describe('item 3 (REFUTADO na execução): a projeção do telhado já é recortada em [0, comprimento]', () => {
  // Corte curto (t de 0 a 4) sobre um telhado que vai de t = −2 a t = 6 (a linha começa em x = 2).
  const r = sectionOfRoofs([shed()], { a: { x: 2, y: -2 }, b: { x: 6, y: -2 }, depth: 9 });
  const xs = r.beyond.flatMap((b) => multiPoints(b.polygons).map((v) => v.x));

  it('diagnóstico: há projeção do telhado', () => {
    expect(xs.length).toBeGreaterThan(0);
  });

  it('todo ponto projetado está em [0, 4] (a laje de visão `slab` já recorta a água em t)', () => {
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(4 + 1e-9);
  });
});

describe('item 2: acabamentos do beiral (testeira, calha, forro) não aparecem no corte nem na elevação', () => {
  const comBeiral = (): ResolvedRoof => ({
    ...shed(),
    lines: [{ kind: 'eave', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }],
    eave: { fascia: true, fasciaHeight: 0.2, gutter: true, soffit: true },
  });

  it('diagnóstico: o corte transversal traz a camada do telhado', () => {
    const r = sectionOfRoofs([comBeiral()], { a: { x: 4, y: -1 }, b: { x: 4, y: 7 }, depth: 4 });
    expect(r.cut.length).toBeGreaterThan(0);
    expect(r.zMin).toBeCloseTo(EAVE - 0.02, 9);
  });

  // A testeira desce 0,20 m abaixo da face inferior do telhado no beiral (ver `RoofEave.fasciaHeight`).
  it.fails('o corte deveria ir até beiral − espessura − altura da testeira (2,58); hoje para em 2,78', () => {
    const r = sectionOfRoofs([comBeiral()], { a: { x: 4, y: -1 }, b: { x: 4, y: 7 }, depth: 4 });
    expect(r.zMin).toBeLessThanOrEqual(EAVE - 0.02 - 0.2 + 1e-9);
  });

  it.fails('a elevação deveria ter um item além do plano para a testeira (hoje só as camadas do telhado)', () => {
    const r = sectionOfRoofs([comBeiral()], { a: { x: 0, y: -2 }, b: { x: 8, y: -2 }, depth: 9 });
    expect(r.beyond.length).toBeGreaterThan(1);
  });
});

describe('item 4: a chave de cota do telhado é o topo do elemento inteiro, não o topo local (decisão 0023 §3)', () => {
  // Telhado em corte: faixa local de t 0..2 entre z 2,70 e 2,80 (beiral), mas a faixa de cotas do ELEMENTO vai a 5,00 (cumeeira
  // em outro trecho). Parede de t 0..2, z 0..4, que atravessa o telhado nesse trecho baixo: ali a parede é a mais alta.
  const faixa = (t0: number, t1: number, z0: number, z1: number) => [[[{ x: t0, y: z0 }, { x: t1, y: z0 }, { x: t1, y: z1 }, { x: t0, y: z1 }]]];
  const items: OcclusionItem[] = [
    { depth: 0, rank: OCCLUSION_RANK.cut, polygons: faixa(0, 2, 2.7, 2.8), cota: { bottom: 2.7, top: 5, wall: false } },
    { depth: 0, rank: OCCLUSION_RANK.cut, polygons: faixa(0, 2, 0, 4), cota: { bottom: 0, top: 4, wall: true } },
  ];

  it('diagnóstico: o telhado tem chave maior (5,00) que a da parede (4,00)', () => {
    const k = cotaKeys(items);
    expect(k[0]!).toBeGreaterThan(k[1]!);
  });

  // Discutível: se a regra atual é intencional, remova este teste e documente o caso como limitação conhecida.
  it.fails('a parede, mais alta no ponto, deveria ficar inteira (8 m²); hoje o telhado fura a parede (7,8 m²)', () => {
    const vis = visibleParts(items);
    expect(multiArea(vis[1]!)).toBeCloseTo(8, 6);
  });
});

describe('elevação de quatro águas: águas de perfil não desenham faixa própria (simetria esquerda/direita)', () => {
  it('a silhueta e os itens são simétricos: nada sobra de uma água lateral', async () => {
    const { ProjectStore, createEmptyProject, makeRoof } = await import('@hestia/model');
    const { computeSection } = await import('./section.ts');
    const st = new ProjectStore(createEmptyProject());
    // 8 × 6 com as quatro arestas a 30 %: as águas laterais ficam de perfil na elevação Sul.
    st.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }], heightOffset: 2.8, shape: 'edges', slopePercent: 30, edgeSlopes: [30, 30, 30, 30] } as never) });
    const r = computeSection(st.project, { a: { x: -3, y: -3 }, b: { x: 11, y: -3 }, depth: 12 });
    const byLayer = (i: number) => r.beyond.filter((b) => b.roofId === 'r' && b.layerIndex === i);
    // uma única peça por camada (a água da frente); as laterais, de perfil, ficam atrás dela
    for (const i of [0, 1, 2]) expect(byLayer(i)).toHaveLength(1);
  });
});

describe('frestas da união (linhas verticais sem sentido no telhado)', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  it('semFrestas tira furos de espessura nula ou de 1 cm e mantém vão de verdade', async () => {
    const { semFrestas } = await import('./section.ts');
    const m = [[sq(0, 0, 10, 4), sq(6.2, 2.78, 6.2, 2.9), sq(3, 1, 3.01, 3), sq(7, 1, 7.5, 3)]];
    const r = semFrestas(m);
    // fica o anel externo e o vão de 0,5 × 2 m; saem o furo degenerado (largura 0) e o de 1 cm
    expect(r[0]).toHaveLength(2);
    expect(r[0]![1]![0]!.x).toBeCloseTo(7, 9);
  });
});

describe('desenho do telhado de fora (roofDrawingsOf): tela e DXF usam a mesma geometria', () => {
  it('quatro águas vistas de frente: uma silhueta, nenhuma linha interna repetida e nada de camada de baixo sobre a face', async () => {
    const { ProjectStore, createEmptyProject, makeRoof } = await import('@hestia/model');
    const { computeSection, roofDrawingsOf } = await import('./section.ts');
    const st = new ProjectStore(createEmptyProject());
    st.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }], heightOffset: 2.8, shape: 'edges', slopePercent: 30, edgeSlopes: [30, 30, 30, 30] } as never) });
    const s = computeSection(st.project, { a: { x: -3, y: -3 }, b: { x: 11, y: -3 }, depth: 12 });
    const [rd] = roofDrawingsOf(s.beyond);
    expect(rd).toBeDefined();
    expect(rd!.silhouette.flat()).toHaveLength(1);
    // A face de cima fecha o trapézio inteiro; as camadas de baixo só ficam fora dela (faixa do beiral), sem área sobre a face.
    const top = rd!.fills.find((f) => f.top)!;
    const lower = rd!.fills.filter((f) => !f.top);
    expect(top.polygons.length).toBeGreaterThan(0);
    for (const f of lower) expect(f.polygons.flat().every((ring) => ring.every((v) => v.y <= 2.8 + 1e-6))).toBe(true);
    // Sem linhas internas coincidentes (a menos de 3 cm) entre si.
    const seg = rd!.segments;
    for (let i = 0; i < seg.length; i++)
      for (let j = i + 1; j < seg.length; j++) {
        const close = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 0.03;
        expect(close(seg[i]![0], seg[j]![0]) && close(seg[i]![1], seg[j]![1])).toBe(false);
      }
  });
});

describe('linhas do telhado pelas arestas 3D (modo edges3d) e reversão para os polígonos', () => {
  it('quatro águas vistas de frente: cumeeira, espigões e beiral da frente aparecem; as de trás, coincidentes, saem uma só vez; o modo antigo continua disponível', async () => {
    const { ProjectStore, createEmptyProject, makeRoof } = await import('@hestia/model');
    const { computeSection, roofDrawingsOf, setRoofLinesMode, getRoofLinesMode } = await import('./section.ts');
    const st = new ProjectStore(createEmptyProject());
    st.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }], heightOffset: 2.8, shape: 'edges', slopePercent: 30, edgeSlopes: [30, 30, 30, 30] } as never) });
    const s = computeSection(st.project, { a: { x: -3, y: -3 }, b: { x: 11, y: -3 }, depth: 30 });
    expect(getRoofLinesMode()).toBe('edges3d');
    const kinds = new Set((s.roofEdges ?? []).map((e) => e.kind));
    expect(kinds.has('hip')).toBe(true);
    expect(kinds.has('eave')).toBe(true);
    const novo = roofDrawingsOf(s.beyond, s.roofEdges)[0]!;
    // as linhas internas são as arestas 3D visíveis e nenhuma repete outra a menos de 3 cm
    for (let i = 0; i < novo.segments.length; i++)
      for (let j = i + 1; j < novo.segments.length; j++) {
        const close = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) < 0.03;
        expect(close(novo.segments[i]![0], novo.segments[j]![0]) && close(novo.segments[i]![1], novo.segments[j]![1])).toBe(false);
      }
    // reversão: o modo `polygons` não usa as arestas e devolve o desenho antigo, sem erro
    setRoofLinesMode('polygons');
    try {
      const antigo = roofDrawingsOf(s.beyond, s.roofEdges)[0]!;
      expect(antigo.silhouette.flat()).toHaveLength(1);
    } finally {
      setRoofLinesMode('edges3d');
    }
    expect(getRoofLinesMode()).toBe('edges3d');
  });
});
