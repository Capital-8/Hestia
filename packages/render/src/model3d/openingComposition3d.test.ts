import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildOpeningModel, frameOfWall, openingGeometry, type OpeningGeometry, type OpeningModel } from '@hestia/engine';
import { compositionSpan, createEmptyProject, makeWall, ProjectStore, view3dOf, type CasingSpec, type CellNode, type CompositionNode, type Opening, type OpeningComposition, type OpeningType, type Project, type SplitNode } from '@hestia/model';
import { caixasEPrismasDaAbertura } from './aberturas3d.ts';
import { openingPieces, pecasDoModelo, type OpeningPiece } from './openingParts.ts';
import { montar, segmentos } from './fixturesInstanciada3d.ts';
import { comprimentoDescoberto } from './metricasInstanciada3d.ts';
import { pickElement } from './pick3d.ts';

/*
 * Composição de esquadrias no 3D (F5b): os exemplos 3 e 4 do aceite (docs/aberturas/F1-spec-composicao.md §1) desenhados
 * pelo caminho de geometria e pelo de caixas. Papéis e materiais, picking pelo id da abertura, ocultar por categoria,
 * abrir vãos (só a folha se move) e silhueta por estilo de linha.
 */

const TOL = 1e-4;
const BAT = { presetId: 'prf_mad_batente_5x9' };
const DIV = { presetId: 'prf_mad_divisor_5x9' };
const CASING: CasingSpec = { faces: 'both', width: 0.07, thickness: 0.015, setback: 0 };

const leafC = (id: string): CellNode => ({ kind: 'cell', id, content: { kind: 'leaf', family: 'door_swing', plan: 'swing', leaves: 1, options: {} } });
const glassC = (id: string): CellNode => ({ kind: 'cell', id, content: { kind: 'glass', glass: { kind: 'clear', thickness: 0.012, mounting: 'rebate' } } });
const fixo = (value: number, node: CompositionNode) => ({ size: { mode: 'fixed' as const, value }, node });
const fill = (node: CompositionNode) => ({ size: { mode: 'fill' as const }, node });
const split = (id: string, axis: 'cols' | 'rows', children: SplitNode['children']): SplitNode => ({ kind: 'split', id, axis, divider: DIV, children });
const comp = (layout: CompositionNode, over: Partial<OpeningComposition> = {}): OpeningComposition => ({
  version: 1,
  nominal: { ref: 'leaf', width: 0.9, height: 2.1, gap: { w: 0.08, h: 0.05 } },
  frame: { style: 'rebate', profile: BAT, depthMode: 'core' },
  layout,
  casing: CASING,
  ...over,
});

const COLS3 = (): SplitNode => split('cols', 'cols', [fixo(0.4, glassC('lat-e')), fill(leafC('folha')), fixo(0.4, glassC('lat-d'))]);
/** Ex. 3: porta 90 com duas laterais de 40 (sem bandeira). */
const EX3 = comp(COLS3());
/** Ex. 4: porta 90 com laterais e bandeira; travessa interna contínua. */
const EX4 = comp(split('rows', 'rows', [fill(COLS3()), fixo(0.4, glassC('band'))]));

interface Cena {
  p: Project;
  o: Opening;
  t: OpeningType;
  f: NonNullable<ReturnType<typeof frameOfWall>>;
  g: OpeningGeometry;
  model: OpeningModel;
}

/** Parede de 4 m com um vão no meio (offset 2) e a composição no tipo `ot_x`. `view` troca campos da vista 3D. */
function cena(layout: CompositionNode, over: Partial<OpeningComposition> = {}, view: Partial<ReturnType<typeof view3dOf>> = {}): Cena {
  const s = new ProjectStore(createEmptyProject());
  const base = s.project.openingTypes['ot_p90']!;
  // O vão do tipo acompanha a composição (o app grava a mesma medida no tipo): é ela que corta a parede.
  const c = comp(layout, over);
  const vao = compositionSpan(c);
  s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_x', width: vao.width, height: vao.height, composition: c } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: base.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  const p: Project = { ...s.project, view3d: { ...view3dOf(s.project), ...view } };
  const o = p.elements.v as Opening;
  const f = frameOfWall(p, 'w')!;
  const g = openingGeometry(p, o, f);
  return { p, o, t: p.openingTypes.ot_x!, f, g, model: buildOpeningModel(p, o, g, f) };
}

/** Peças do vão, com o id da peça do modelo (mesma ordem: a vista 'view' não filtra nada). */
function pecasComId(c: Cena, open = false): Array<{ id: string; piece: OpeningPiece }> {
  const pecas = pecasDoModelo(c.p, c.t, c.model, open);
  expect(pecas).toHaveLength(c.model.parts.length);
  return pecas.map((piece, i) => ({ id: c.model.parts[i]!.id, piece }));
}

const contagem = (ps: OpeningPiece[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of ps) out[x.role] = (out[x.role] ?? 0) + 1;
  return out;
};

/** Ponto do vão em coordenadas do mundo: `t` ao longo da parede e `z` acima do piso. */
const noVao = (c: Cena, t: number, z: number): THREE.Vector3 => new THREE.Vector3(c.g.center.x + c.g.u.x * t, c.g.center.y + c.g.u.y * t, z);

/** Câmera de frente para o ponto do vão (3 m do lado de fora da parede), olhando o centro da tela. */
function camaraPara(alvo: THREE.Vector3): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(35, 1.5, 0.1, 500);
  cam.up.set(0, 0, 1);
  cam.position.set(alvo.x, alvo.y - 3, alvo.z);
  cam.lookAt(alvo);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** Sobreposições da vista padrão com a categoria `kind` oculta. */
function sem(kind: 'door' | 'window'): ReturnType<typeof view3dOf>['overrides'] {
  const base = view3dOf(createEmptyProject());
  return { ...base.overrides, [kind]: { ...base.overrides[kind], visible: false } };
}

describe('composição no 3D: papéis e materiais das peças', () => {
  it('Ex. 3 e Ex. 4: contagem de peças por papel (fechada), com as peças novas no lugar', () => {
    const c3 = cena(EX3.layout);
    const ex3 = contagem(openingPieces(c3.p, c3.o, c3.g, c3.f, 2.8, false));
    expect(ex3.mullion).toBe(2);
    expect(ex3.transom ?? 0).toBe(0);
    expect(ex3.jamb).toBe(2);
    expect(ex3.head).toBe(1);
    expect(ex3.glass).toBe(2);
    expect(ex3.leaf).toBe(1);
    const c4 = cena(EX4.layout);
    const ex4 = contagem(openingPieces(c4.p, c4.o, c4.g, c4.f, 2.8, false));
    expect(ex4.mullion).toBe(2);
    expect(ex4.transom).toBe(1);
    expect(ex4.glass).toBe(3);
    expect(ex4.leaf).toBe(1);
  });

  it('material por papel: montantes, travessas e baguetes no batente; vidro no de vidro; folha no batente', () => {
    const c = cena(EX4.layout, {});
    for (const { id, piece } of pecasComId(c)) {
      if (piece.role === 'mullion' || piece.role === 'transom' || piece.role === 'jamb' || piece.role === 'head' || piece.role === 'leaf') {
        expect(piece.materialId, id).toBe(c.t.frameMaterialId);
      }
      if (piece.role === 'glass') expect(piece.materialId, id).toBe(c.t.glassMaterialId);
    }
    // Vidro de célula: `glass-<cellId>`, um por célula de vidro (laterais e bandeira).
    expect(pecasComId(c).filter((x) => x.piece.role === 'glass').map((x) => x.id).sort()).toEqual(['glass-band', 'glass-lat-d', 'glass-lat-e']);
    expect(pecasComId(c).filter((x) => x.piece.role === 'mullion').map((x) => x.id)).toEqual(['mullion-0', 'mullion-1']);
    expect(pecasComId(c).filter((x) => x.piece.role === 'transom').map((x) => x.id)).toEqual(['transom-0']);
  });

  it('baguete (bead): com perfil de rebaixo e vidro encaixado, a baguete é do batente e some no nível esquemático', () => {
    const c = cena(EX3.layout, { frame: { style: 'rebate', profile: { presetId: 'prf_mad_marco_3x7' }, depthMode: 'core' } });
    const beads = pecasComId(c).filter((x) => x.piece.role === 'bead');
    expect(beads.length).toBeGreaterThan(0);
    for (const { piece } of beads) expect(piece.materialId).toBe(c.t.frameMaterialId);
    // Nível esquemático: a baguete some (como o montante de vidro), e os montantes e travessas ficam.
    const esquematico: Project = { ...c.p, openingTypes: { ...c.p.openingTypes, ot_x: { ...c.t, detail3d: 'schematic' } } };
    const pc = openingPieces(esquematico, c.o, c.g, c.f, 2.8, false);
    expect(pc.some((x) => x.role === 'bead')).toBe(false);
    expect(pc.filter((x) => x.role === 'mullion')).toHaveLength(2);
    expect(pc.filter((x) => x.role === 'glass')).toHaveLength(2);
  });

  it('no caminho de caixas, o material de cada peça nova é o do batente ou o do vidro (caixa ou prisma)', () => {
    const c = cena(EX4.layout, {});
    const view = view3dOf(c.p);
    const a = caixasEPrismasDaAbertura(c.p, c.o, c.f, 0, 2.8, view)!;
    const ids = [...a.caixas.map((x) => x.materialId), ...a.prismas.map((x) => x.materialId)];
    expect(new Set(ids)).toEqual(new Set([c.t.frameMaterialId, c.t.glassMaterialId, 'mat_aco']));
    // Os montantes e a travessa (perfil em L) vão como prismas; o vidro como caixa.
    expect(a.prismas.filter((x) => x.materialId === c.t.frameMaterialId).length).toBeGreaterThanOrEqual(3);
    expect(a.caixas.filter((x) => x.materialId === c.t.glassMaterialId)).toHaveLength(3);
  });
});

describe('composição no 3D: picking e ocultar por categoria', () => {
  const alvos = (c: Cena): Array<[string, THREE.Vector3]> => [
    ['mullion-0', noVao(c, -0.465, 1.05)],
    ['mullion-1', noVao(c, 0.465, 1.05)],
    ['transom-0', noVao(c, 0, 2.125)],
  ];

  for (const [nome, layout] of [['Ex. 3', EX3.layout], ['Ex. 4', EX4.layout]] as Array<[string, CompositionNode]>) {
    it(`${nome}: clicar em montante ou travessa seleciona a abertura, nos dois caminhos`, { timeout: 60000 }, () => {
      const c = cena(layout);
      for (const instanciar of [false, true]) {
        const ms = montar(c.p, instanciar);
        for (const [peca, alvo] of alvos(c)) {
          if (nome === 'Ex. 3' && peca === 'transom-0') continue;
          const hit = pickElement(ms.scene, camaraPara(alvo), { x: 0, y: 0 });
          expect(hit, `${peca} instanciar=${instanciar}`).not.toBeNull();
          expect(hit!.id).toBe('v');
          expect(hit!.kind).toBe('door');
        }
      }
    });
  }

  it('ocultar portas tira todas as peças da composição (inclusive montantes, travessa e vidro), nos dois caminhos', { timeout: 60000 }, () => {
    const c = cena(EX4.layout, {}, { overrides: sem('door') });
    const visivel = cena(EX4.layout);
    const conta = (ms: ReturnType<typeof montar>): number => {
      let n = 0;
      ms.scene.traverse((o) => {
        if (o.userData.kind === 'door' || o.userData.elementId === 'v') n++;
      });
      return n;
    };
    for (const instanciar of [false, true]) {
      // Controle: com a categoria visível, a composição aparece (senão o zero abaixo não prova nada).
      expect(conta(montar(visivel.p, instanciar)), `controle instanciar=${instanciar}`).toBeGreaterThan(0);
      const ms = montar(c.p, instanciar);
      const portas = conta(ms);
      expect(portas, `instanciar=${instanciar}`).toBe(0);
      for (const [, alvo] of alvos(c)) expect(pickElement(ms.scene, camaraPara(alvo), { x: 0, y: 0 })).toBeNull();
    }
  });

  it('ocultar janelas não esconde a porta da composição', () => {
    const c = cena(EX3.layout, {}, { overrides: sem('window') });
    const hit = pickElement(montar(c.p, true).scene, camaraPara(noVao(c, -0.465, 1.05)), { x: 0, y: 0 });
    expect(hit?.id).toBe('v');
  });
});

describe('composição no 3D: abrir vãos', () => {
  it('Ex. 4 aberta: só a folha (e as ferragens dela) muda; montantes, travessa, vidros e batente ficam no lugar', () => {
    const c = cena(EX4.layout);
    const fechada = pecasComId(c, false);
    const aberta = pecasComId(c, true);
    expect(aberta).toHaveLength(fechada.length);
    const movidas = aberta.filter((x) => x.piece.hinge || x.piece.slide).map((x) => x.id);
    expect(movidas).toContain('leaf-folha');
    for (const id of movidas) expect(id, id).toMatch(/folha/);
    // Peças fixas (as que não estão entre as movidas): mesma caixa nos dois estados e sem dobradiça nem deslocamento.
    const fixasA = aberta.filter((x) => !movidas.includes(x.id));
    const fixasF = fechada.filter((x) => !movidas.includes(x.id));
    expect(fixasA.map((x) => x.id)).toEqual(fixasF.map((x) => x.id));
    for (const [i, a] of fixasA.entries()) {
      const b = fixasF[i]!.piece;
      expect(a.piece.hinge ?? a.piece.slide, a.id).toBeUndefined();
      expect(a.piece.role, a.id).toBe(b.role);
      for (const k of ['x', 'y', 'z', 'w', 'd', 'h'] as const) expect(a.piece[k], `${a.id}.${k}`).toBeCloseTo(b[k], 9);
    }
    // Dobradiças ficam no batente (não giram); folha e ferragens da folha giram.
    for (const x of fixasA) expect(['mullion', 'transom', 'glass', 'jamb', 'head', 'casing', 'hinge'], x.id).toContain(x.piece.role);
    // A folha gira 90° (o ângulo do tipo) no lado do movimento.
    const folha = aberta.find((x) => x.id === 'leaf-folha')!.piece;
    expect(Math.abs(folha.hinge!.angle)).toBeCloseTo(Math.PI / 2, 9);
    expect(folha.hinge!.axis).toBe('z');
  });

  it('Ex. 4 com "Abrir vãos" no 3D: os caminhos de geometria e de caixas mantêm a mesma cena', { timeout: 120000 }, () => {
    const c = cena(EX4.layout, {}, { openOpenings: true });
    const sRef = segmentos(montar(c.p, false, 'hiddenLine'));
    const sNova = segmentos(montar(c.p, true, 'hiddenLine'));
    const total = sRef.reduce((s, x) => s + Math.hypot(x[3]! - x[0]!, x[4]! - x[1]!, x[5]! - x[2]!), 0);
    expect(comprimentoDescoberto(sRef, sNova, TOL)).toBeLessThan(1e-6);
    expect(comprimentoDescoberto(sNova, sRef, TOL) / total).toBeLessThan(0.01);
  });
});

describe('composição no 3D: estilos de linha', () => {
  for (const [nome, layout] of [['Ex. 3', EX3.layout], ['Ex. 4', EX4.layout]] as Array<[string, CompositionNode]>) {
    it(`${nome}: a silhueta confere nos dois caminhos em linha oculta; no realista, as peças novas não trazem arestas`, { timeout: 120000 }, () => {
      const p = cena(layout).p;
      const comprimento = (ss: number[][]): number => ss.reduce((t, x) => t + Math.hypot(x[3]! - x[0]!, x[4]! - x[1]!, x[5]! - x[2]!), 0);
      const sRef = segmentos(montar(p, false, 'hiddenLine'));
      const sNova = segmentos(montar(p, true, 'hiddenLine'));
      expect(comprimentoDescoberto(sRef, sNova, TOL)).toBeLessThan(1e-6);
      expect(comprimentoDescoberto(sNova, sRef, TOL) / comprimento(sRef)).toBeLessThan(0.01);
      // Realista: a cena com caixas não desenha as arestas dos montantes e da travessa (perfil em L), como o batente.
      const rRef = segmentos(montar(p, false, 'realistic'));
      const rNova = segmentos(montar(p, true, 'realistic'));
      expect(comprimentoDescoberto(rRef, rNova, TOL)).toBeLessThan(1e-6);
      expect(comprimentoDescoberto(rNova, rRef, TOL)).toBeLessThan(1e-6);
    });
  }
});

describe('folha com material próprio (leafMaterialId): papel leaf no modelo, no 3D e nas caixas', () => {
  /** Mesma cena (Ex. 4: folha, laterais de vidro e bandeira), com o tipo `ot_x` levando folha de alumínio. */
  const comFolhaDeAluminio = (c: Cena): Project => ({ ...c.p, openingTypes: { ...c.p.openingTypes, ot_x: { ...c.t, leafMaterialId: 'mat_aluminio' } } });

  it('modelo montado: a folha é do papel leaf (material leaf) e o batente do papel frame', () => {
    const c = cena(EX4.layout);
    const folhas = c.model.parts.filter((x) => x.role === 'leaf' || x.role === 'leafPanel');
    expect(folhas.length).toBeGreaterThan(0);
    for (const x of folhas) expect(x.material, x.id).toBe('leaf');
    for (const x of c.model.parts.filter((y) => y.role === 'jamb')) expect(x.material, x.id).toBe('frame');
  });

  it('3D: folha de alumínio e batente de madeira geram materiais diferentes; vidro segue no seu material', () => {
    const c = cena(EX4.layout);
    const pecas = openingPieces(comFolhaDeAluminio(c), c.o, c.g, c.f, 2.8, false);
    const folhas = pecas.filter((x) => x.role === 'leaf' || x.role === 'leafPanel');
    expect(folhas.length).toBeGreaterThan(0);
    for (const x of folhas) expect(x.materialId).toBe('mat_aluminio');
    for (const x of pecas.filter((y) => y.role === 'jamb' || y.role === 'head' || y.role === 'mullion')) expect(x.materialId).toBe(c.t.frameMaterialId);
    for (const x of pecas.filter((y) => y.role === 'glass')) expect(x.materialId).toBe(c.t.glassMaterialId);
  });

  it('caixas e prismas: a folha sai em alumínio e o batente em madeira', () => {
    const c = cena(EX4.layout);
    const p = comFolhaDeAluminio(c);
    const a = caixasEPrismasDaAbertura(p, c.o, c.f, 0, 2.8, view3dOf(p))!;
    const ids = new Set([...a.caixas.map((x) => x.materialId), ...a.prismas.map((x) => x.materialId)]);
    expect(ids.has('mat_aluminio')).toBe(true);
    expect(ids.has(c.t.frameMaterialId)).toBe(true);
  });

  it('sem leafMaterialId (ou com o do batente), a folha segue o batente: nada muda (regressão)', () => {
    const c = cena(EX4.layout);
    const semCampo = openingPieces(c.p, c.o, c.g, c.f, 2.8, false).map((x) => x.materialId);
    const igualAoBatente = openingPieces({ ...c.p, openingTypes: { ...c.p.openingTypes, ot_x: { ...c.t, leafMaterialId: c.t.frameMaterialId } } }, c.o, c.g, c.f, 2.8, false).map((x) => x.materialId);
    expect(igualAoBatente).toEqual(semCampo);
    expect(semCampo.filter((id) => id === c.t.frameMaterialId).length).toBeGreaterThanOrEqual(5);
  });
});
