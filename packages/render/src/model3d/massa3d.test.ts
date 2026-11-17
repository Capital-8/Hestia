import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, servicoMassa, type MalhaMassaProjeto } from '@hestia/engine';
import { massaM1, massaM2, massaM3 } from '@hestia/engine/src/fixtureMassa.ts';
import { ProjectStore, createEmptyProject, defaultOverrides, makeLevel, view3dOf, type Id, type Mass, type Project } from '@hestia/model';
import { ModelScene } from './scene3d.ts';
import { caixaDaSelecao } from './selecao3d.ts';
import { CacheDeMassas3d, contornoDaBase, montarLoteDeMassas, pecaDaMassa } from './massa3d.ts';
import { chavesDeMassaCor, chavesDeMassaGeometria } from './chaveNivel3d.ts';
import { Materiais3D } from './materiais3d.ts';
import { COR_NEUTRA_MASSA, OPACIDADE_MASSA, ORDEM_MASSA, materialDaMassa } from './massaGrupo3d.ts';

/** Índices dos 12 triângulos de uma caixa (vértices 0-3 em baixo, 4-7 em cima; anti-horário visto de fora). */
const TRI_CAIXA = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];

interface CaixaSimulada {
  massaId: Id;
  copia?: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/**
 * Malha no formato do kernel (`MalhaMassaProjeto`), simulada: uma caixa de 12 triângulos por (massa, cópia). Os testes da TS não rodam o kernel
 * (ele tem a própria suíte WASM); o que se testa aqui é o que a cena faz com a malha que chega.
 */
function malhaSimulada(caixas: CaixaSimulada[]): MalhaMassaProjeto {
  const verts: number[] = [];
  const idx: number[] = [];
  const grupos: MalhaMassaProjeto['grupos'] = [];
  for (const c of caixas) {
    const base = verts.length / 3;
    const pts = [
      [c.x0, c.y0, c.z0], [c.x1, c.y0, c.z0], [c.x1, c.y1, c.z0], [c.x0, c.y1, c.z0],
      [c.x0, c.y0, c.z1], [c.x1, c.y0, c.z1], [c.x1, c.y1, c.z1], [c.x0, c.y1, c.z1],
    ];
    for (const q of pts) verts.push(...q);
    const primeiro = idx.length;
    for (const t of TRI_CAIXA) idx.push(base + t);
    grupos.push({ massaId: c.massaId, copia: c.copia ?? 0, papel: 0, primeiro, n: TRI_CAIXA.length });
  }
  return { grupos, vertices: Float64Array.from(verts), indices: Uint32Array.from(idx) };
}

/** M1 (caixa 10 × 6 × 9) e M3 (duas cópias de uma caixa de 2 × 2 × 30 em x = 20 e x = 30): as malhas simuladas das massas de referência. */
const MALHA_M1_M3 = (): MalhaMassaProjeto =>
  malhaSimulada([
    { massaId: 'm1', x0: 0, x1: 10, y0: -3, y1: 3, z0: 0, z1: 9 },
    { massaId: 'm3', copia: 0, x0: 20, x1: 22, y0: 0, y1: 2, z0: 0, z1: 30 },
    { massaId: 'm3', copia: 1, x0: 30, x1: 32, y0: 0, y1: 2, z0: 0, z1: 30 },
  ]);

/** Projeto (nível `lv_0`) com as massas dadas, na ordem de criação. */
function projetoCom(...massas: Mass[]): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  for (const m of massas) s.exec({ type: 'addMass', mass: m });
  return s;
}

/** Kernel "ligado" para a cena: `pronto` verdadeiro e a malha devolvida pela função dada. */
function kernelFalso(malha: () => MalhaMassaProjeto | null): void {
  vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(true);
  vi.spyOn(servicoMassa(), 'malha').mockImplementation(() => malha());
}

function cena(p: Project): ModelScene {
  const ms = new ModelScene({ instanciar: false });
  ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false });
  return ms;
}

/** Malhas de massa da cena (não as linhas da reserva). */
function malhasDeMassa(ms: ModelScene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  ms.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.kind === 'mass') out.push(o);
  });
  return out;
}

/** Linhas da reserva (contorno da base sem kernel). */
function reservas(ms: ModelScene): THREE.LineSegments[] {
  const out: THREE.LineSegments[] = [];
  ms.scene.traverse((o) => {
    if (o instanceof THREE.LineSegments && o.userData.reserva === true) out.push(o);
  });
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('peça e lote da massa (decisão 0016: uma faixa por massa)', () => {
  it('ElementRange por massa: M1 e M3 (duas cópias) têm faixas que cobrem só os triângulos delas e a soma bate com o total', () => {
    const cache = new CacheDeMassas3d();
    const pecas = cache.pecas(MALHA_M1_M3(), [
      { id: 'm1', assinatura: 'a1' },
      { id: 'm3', assinatura: 'a3' },
    ]);
    const lote = montarLoteDeMassas(pecas);
    expect(lote.faixas.map((f) => [f.id, f.start, f.count])).toEqual([
      ['m1', 0, 36],
      ['m3', 36, 72],
    ]);
    expect(lote.faixas.reduce((s, f) => s + f.count, 0)).toBe(lote.indices.length);
    // Cada triângulo de uma faixa cai na caixa da massa dela (x de M1 em [0, 10]; x de M3 em [20, 32]).
    const xDoTriangulo = (k: number): number => lote.positions[3 * lote.indices[k]!]!;
    for (let k = 0; k < 36; k++) expect(xDoTriangulo(k)).toBeGreaterThanOrEqual(0);
    for (let k = 0; k < 36; k++) expect(xDoTriangulo(k)).toBeLessThanOrEqual(10);
    for (let k = 36; k < lote.indices.length; k++) expect(xDoTriangulo(k)).toBeGreaterThanOrEqual(20);
  });

  it('a normal de cada vértice da peça tem comprimento 1 e triângulo degenerado não entra', () => {
    const malha = malhaSimulada([{ massaId: 'm1', x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 }]);
    const peca = pecaDaMassa(malha, 'm1', 'a');
    expect(peca.n).toBe(36);
    for (let i = 0; i < peca.n; i++) {
      const len = Math.hypot(peca.normals[3 * i]!, peca.normals[3 * i + 1]!, peca.normals[3 * i + 2]!);
      expect(len).toBeCloseTo(1, 6);
    }
    const degenerada = { ...malha, indices: Uint32Array.from([0, 0, 0]), grupos: [{ massaId: 'm1', copia: 0, papel: 0, primeiro: 0, n: 3 }] };
    expect(pecaDaMassa(degenerada, 'm1', 'a').n).toBe(0);
  });
});

describe('atualização só da massa editada (A.8 item 4)', () => {
  it('editar M1 reconstrói só a peça dela: M3 vem do cache (contador de peças construídas)', () => {
    const cache = new CacheDeMassas3d();
    const malha = MALHA_M1_M3();
    cache.pecas(malha, [{ id: 'm1', assinatura: 'a1' }, { id: 'm3', assinatura: 'a3' }]);
    expect(cache.construidas).toBe(2);
    cache.pecas(malha, [{ id: 'm1', assinatura: 'a1-nova' }, { id: 'm3', assinatura: 'a3' }]);
    expect(cache.construidas).toBe(3);
    cache.pecas(malha, [{ id: 'm1', assinatura: 'a1-nova' }, { id: 'm3', assinatura: 'a3' }]);
    expect(cache.construidas).toBe(3);
  });

  it('mudar só a cor não muda a chave de geometria; a chave de cor do nível muda', () => {
    const s = projetoCom(massaM1(), massaM3());
    const geoAntes = chavesDeMassaGeometria(s.project, 'k');
    const corAntes = chavesDeMassaCor(s.project, 'v');
    s.exec({ type: 'updateMass', id: 'm1', patch: { color: '#ff0000' } });
    expect(chavesDeMassaGeometria(s.project, 'k')).toEqual(geoAntes);
    expect(chavesDeMassaCor(s.project, 'v').get('lv_0')).not.toBe(corAntes.get('lv_0'));
  });

  it('editar uma massa muda só a chave de geometria do nível dela (vizinho por cota fica igual)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'N2', elevation: 6 }) });
    s.exec({ type: 'addMass', mass: massaM1() });
    s.exec({ type: 'addMass', mass: { ...massaM3(), id: 'm3b', levelId: 'lv_2' } });
    const antes = chavesDeMassaGeometria(s.project, 'k');
    s.exec({ type: 'updateMass', id: 'm1', patch: { origem: { x: 2, y: 0 } } });
    const depois = chavesDeMassaGeometria(s.project, 'k');
    expect(depois.get('lv_0')).not.toBe(antes.get('lv_0'));
    expect(depois.get('lv_2')).toBe(antes.get('lv_2'));
  });
});

describe('material transparente posterior (A.3 decisão 2, A.8 item 6)', () => {
  it('lote transparente posterior: transparent, opacity 0,35, sem escrita de profundidade e renderOrder acima dos opacos', () => {
    const mats = new Materiais3D();
    mats.marco = { view: view3dOf({}), dark: false };
    const m = materialDaMassa(mats, view3dOf({}), undefined);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBe(OPACIDADE_MASSA);
    expect(OPACIDADE_MASSA).toBe(0.35);
    expect(m.depthWrite).toBe(false);
    expect(ORDEM_MASSA).toBeGreaterThan(0);
  });

  it('a cena desenha a massa com esse material e renderOrder maior que o dos opacos', () => {
    kernelFalso(MALHA_M1_M3);
    const ms = cena(projetoCom(massaM1(), massaM3()).project);
    const malhas = malhasDeMassa(ms);
    expect(malhas).toHaveLength(1);
    const mesh = malhas[0]!;
    expect(mesh.renderOrder).toBeGreaterThan(0);
    for (const mat of mesh.material as THREE.Material[]) {
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBe(OPACIDADE_MASSA);
      expect(mat.depthWrite).toBe(false);
    }
    expect(mesh.userData.ranges.map((r: { id: Id }) => r.id)).toEqual(['m1', 'm3']);
  });

  it('massa sem cor usa o padrão neutro; com cor, a cor da massa', () => {
    const mats = new Materiais3D();
    mats.marco = { view: view3dOf({}), dark: false };
    const neutro = materialDaMassa(mats, view3dOf({}), undefined) as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
    expect(neutro.color.getHexString()).toBe(new THREE.Color(COR_NEUTRA_MASSA).getHexString());
    const vermelho = materialDaMassa(mats, view3dOf({}), '#ff0000') as THREE.MeshBasicMaterial;
    expect(vermelho.color.getHexString()).toBe('ff0000');
  });
});

describe('visibilidade e reserva na cena 3D', () => {
  it('categoria mass desligada na vista some do 3D (malhas e reserva)', () => {
    kernelFalso(MALHA_M1_M3);
    const p = projetoCom(massaM1(), massaM3()).project;
    const semMassa: Project = { ...p, view3d: { ...view3dOf({}), overrides: { ...defaultOverrides(), mass: { visible: false, transparency: 0, halftone: false } } } };
    const ms = cena(semMassa);
    expect(malhasDeMassa(ms)).toHaveLength(0);
    expect(reservas(ms)).toHaveLength(0);
  });

  it('reserva sem kernel: desenha o contorno da base de cada massa, sem lançar', () => {
    vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(false);
    const ms = cena(projetoCom(massaM1(), massaM2()).project);
    expect(malhasDeMassa(ms)).toHaveLength(0);
    expect(reservas(ms)).toHaveLength(2);
  });

  it('massa oculta na vista (Hide in View) sai do lote; a outra continua', () => {
    kernelFalso(MALHA_M1_M3);
    const p = projetoCom(massaM1(), massaM3()).project;
    const ms = new ModelScene({ instanciar: false });
    ms.update(p, p.levels.map((l) => resolveLevel(p, l.id)), { edges: false, shadows: false, dark: false, hidden: new Set<Id>(['m1']) });
    expect(malhasDeMassa(ms)[0]!.userData.ranges.map((r: { id: Id }) => r.id)).toEqual(['m3']);
  });

  it('seleção: a caixa da massa selecionada cobre só a faixa dela (decisão 0016)', () => {
    kernelFalso(MALHA_M1_M3);
    const ms = cena(projetoCom(massaM1(), massaM3()).project);
    const caixaM1 = caixaDaSelecao(ms.scene, ['m1'])!;
    expect(caixaM1.min.x).toBeCloseTo(0, 6);
    expect(caixaM1.max.x).toBeCloseTo(10, 6);
    const caixaM3 = caixaDaSelecao(ms.scene, ['m3'])!;
    expect(caixaM3.min.x).toBeCloseTo(20, 6);
    expect(caixaM3.max.x).toBeCloseTo(32, 6);
  });

  it('kernel pronto mas com malha nula (erro do kernel): cai na reserva, sem lançar', () => {
    kernelFalso(() => null);
    expect(() => cena(projetoCom(massaM1()).project)).not.toThrow();
    expect(reservas(cena(projetoCom(massaM1()).project))).toHaveLength(1);
  });

  it('contorno da base do círculo tem 32 segmentos fechados na cota da base', () => {
    const segmentos = contornoDaBase(massaM2(), 6);
    expect(segmentos.length).toBe(6 * 32);
    for (let i = 2; i < segmentos.length; i += 3) expect(segmentos[i]).toBeCloseTo(6, 9);
    // O último segmento fecha o anel: termina onde o primeiro começa.
    const n = segmentos.length;
    expect(segmentos[n - 3]).toBeCloseTo(segmentos[0]!, 9);
    expect(segmentos[n - 2]).toBeCloseTo(segmentos[1]!, 9);
  });

  it('mudar só a cor troca o material e mantém a geometria (mesmo objeto)', () => {
    kernelFalso(MALHA_M1_M3);
    const s = projetoCom(massaM1(), massaM3());
    const ms = new ModelScene({ instanciar: false });
    const opt = { edges: false, shadows: false, dark: false };
    ms.update(s.project, s.project.levels.map((l) => resolveLevel(s.project, l.id)), opt);
    const antes = malhasDeMassa(ms)[0]!;
    s.exec({ type: 'updateMass', id: 'm1', patch: { color: '#ff0000' } });
    ms.update(s.project, s.project.levels.map((l) => resolveLevel(s.project, l.id)), opt);
    const depois = malhasDeMassa(ms)[0]!;
    expect(depois.geometry).toBe(antes.geometry);
    expect(((depois.material as THREE.Material[])[0] as THREE.MeshBasicMaterial).color.getHexString()).toBe('ff0000');
  });
});
