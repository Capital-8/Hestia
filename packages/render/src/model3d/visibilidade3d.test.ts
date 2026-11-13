import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeFloor, makeRoof, makeStair, makeWall, type Opening, type Project, type StairRun } from '@hestia/model';
import { ModelScene, type Scene3DOptions } from './scene3d.ts';
import type { ElementRange } from './solids.ts';

/**
 * Hide in View / Reveal na vista 3D. O `hidden` não gera malha, caixa nem picking; o `revealed` continua no modelo normal
 * e ganha uma sobreposição de arestas azuis sem preenchimento. O cache de nível não pode reutilizar uma malha montada com
 * outro conjunto de visibilidade.
 */

/** Cor das bordas do Reveal (a mesma de `scene3d.ts`). */
const AZUL = 0x2563eb;

const curva = (ax: number, ay: number, bx: number, by: number, sag = 0) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag });

/** Lance reto de 17 espelhos de 0,28 m (cota de 3 m = 0,176 m por espelho, dentro da norma): gera degraus. */
const lanceReto = (): StairRun => {
  const n = 17;
  const sp = 0.28;
  const y0 = 1;
  const y1 = 2;
  return {
    id: 'r1',
    kind: 'run',
    boundaryLeft: [curva(-0.5, y1, (n - 1) * sp + 0.5, y1)],
    boundaryRight: [curva(-0.5, y0, (n - 1) * sp + 0.5, y0)],
    risers: Array.from({ length: n }, (_, k) => curva(k * sp, y0, k * sp, y1)),
    path: [],
  };
};

/** Sala 4 × 3 m: porta na parede a, janela na c, piso. Opcionalmente, telhado e escada (para as categorias). */
function casa(extra: { telhado?: boolean; escada?: boolean } = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  const pts = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];
  const lados: Array<[string, number, number]> = [
    ['a', 0, 1],
    ['b', 1, 2],
    ['c', 2, 3],
    ['d', 3, 0],
  ];
  for (const [id, i, j] of lados) {
    s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: pts[i]!, b: pts[j]! }) });
  }
  const porta: Opening = { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'a', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  const janela: Opening = { id: 'j1', kind: 'window', typeId: 'ot_j120', hostId: 'c', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: porta });
  s.exec({ type: 'addOpening', opening: janela });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: pts }) });
  if (extra.telhado) s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: pts, heightOffset: 0.2 }) });
  if (extra.escada) s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [lanceReto()] }) });
  return s.project;
}

const niveis = (p: Project): ResolvedLevel[] => p.levels.map((l) => resolveLevel(p, l.id));

const BASE: Scene3DOptions = { edges: false, shadows: false, dark: false };

/** Cena com o conjunto de visibilidade dado. O padrão é o caminho de geometria (fácil de inspecionar). */
function cena(p: Project, opt: Partial<Scene3DOptions> = {}, instanciar = false): ModelScene {
  const ms = new ModelScene({ instanciar });
  ms.update(p, niveis(p), { ...BASE, ...opt });
  return ms;
}

/** Grupo do modelo (o primeiro `Group` filho da cena). */
function modelo(ms: ModelScene): THREE.Group {
  return ms.scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
}

function malhas(ms: ModelScene): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  modelo(ms).traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

function linhas(ms: ModelScene): THREE.LineSegments[] {
  const out: THREE.LineSegments[] = [];
  modelo(ms).traverse((o) => {
    if (o instanceof THREE.LineSegments) out.push(o);
  });
  return out;
}

/** Arestas azuis do Reveal (o modelo normal não usa essa cor). */
function azuis(ms: ModelScene): THREE.LineSegments[] {
  return linhas(ms).filter((l) => (l.material as THREE.LineBasicMaterial).color.getHex() === AZUL);
}

/** Faixas de elemento de todas as malhas do modelo (o que o picking e a seleção leem). */
function faixas(ms: ModelScene): ElementRange[] {
  const out: ElementRange[] = [];
  for (const m of malhas(ms)) {
    const rs = m.userData.ranges as ElementRange[] | undefined;
    if (rs) out.push(...rs);
  }
  return out;
}

describe('Hide in View: o oculto não entra na malha nem no picking', () => {
  it('parede oculta não gera faixa de parede; as outras continuam', () => {
    const p = casa();
    const base = cena(p);
    expect(base.selectionBounds(['a'])).not.toBeNull();
    expect(faixas(base).some((r) => r.id === 'a')).toBe(true);

    const ms = cena(p, { hidden: new Set(['a']) });
    expect(ms.selectionBounds(['a'])).toBeNull();
    expect(faixas(ms).some((r) => r.id === 'a')).toBe(false);
    expect(ms.selectionBounds(['b'])).not.toBeNull();
    expect(ms.selectionBounds(['f'])).not.toBeNull();
  });

  it('piso oculto some do modelo e do picking', () => {
    const p = casa();
    expect(cena(p).selectionBounds(['f'])).not.toBeNull();
    const ms = cena(p, { hidden: new Set(['f']) });
    expect(ms.selectionBounds(['f'])).toBeNull();
    expect(faixas(ms).some((r) => r.id === 'f')).toBe(false);
  });

  it('telhado e escada ocultos saem do modelo e do picking', () => {
    const p = casa({ telhado: true, escada: true });
    const base = cena(p);
    expect(base.selectionBounds(['r1'])).not.toBeNull();
    expect(base.selectionBounds(['st1'])).not.toBeNull();

    const ms = cena(p, { hidden: new Set(['r1', 'st1']) });
    expect(ms.selectionBounds(['r1'])).toBeNull();
    expect(ms.selectionBounds(['st1'])).toBeNull();
    expect(faixas(ms).some((r) => r.id === 'r1' || r.id === 'st1')).toBe(false);
  });

  it('abertura oculta some; a abertura de uma parede oculta continua (visibilidade por elemento)', () => {
    const p = casa();
    expect(cena(p).selectionBounds(['d1'])).not.toBeNull();

    const semAbertura = cena(p, { hidden: new Set(['d1']) });
    expect(semAbertura.selectionBounds(['d1'])).toBeNull();
    expect(faixas(semAbertura).some((r) => r.id === 'd1')).toBe(false);
    // A janela não foi afetada.
    expect(semAbertura.selectionBounds(['j1'])).not.toBeNull();

    const semParede = cena(p, { hidden: new Set(['a']) });
    expect(semParede.selectionBounds(['a'])).toBeNull();
    expect(semParede.selectionBounds(['d1'])).not.toBeNull();
    expect(faixas(semParede).some((r) => r.id === 'd1')).toBe(true);
  });

  it('isolar a porta (tudo o mais oculto) deixa só a porta; isolar as paredes não traz as esquadrias', () => {
    const p = casa();
    const todos = Object.keys(p.elements);
    const soPorta = cena(p, { hidden: new Set(todos.filter((id) => id !== 'd1')) });
    expect(soPorta.selectionBounds(['d1'])).not.toBeNull();
    for (const id of ['a', 'b', 'c', 'd', 'j1', 'f']) expect(soPorta.selectionBounds([id])).toBeNull();

    const soParedes = cena(p, { hidden: new Set(todos.filter((id) => !['a', 'b', 'c', 'd'].includes(id))) });
    for (const id of ['a', 'b', 'c', 'd']) expect(soParedes.selectionBounds([id])).not.toBeNull();
    expect(soParedes.selectionBounds(['d1'])).toBeNull();
    expect(soParedes.selectionBounds(['j1'])).toBeNull();

    const paredeEPorta = cena(p, { hidden: new Set(todos.filter((id) => id !== 'a' && id !== 'd1')) });
    expect(paredeEPorta.selectionBounds(['a'])).not.toBeNull();
    expect(paredeEPorta.selectionBounds(['d1'])).not.toBeNull();
    expect(paredeEPorta.selectionBounds(['j1'])).toBeNull();
  });

  it('caminho instanciado: parede oculta sai das caixas e do picking', () => {
    const p = casa();
    const base = cena(p, {}, true);
    expect(base.selectionBounds(['a'])).not.toBeNull();

    const ms = cena(p, { hidden: new Set(['a']) }, true);
    expect(ms.selectionBounds(['a'])).toBeNull();
    expect(faixas(ms).some((r) => r.id === 'a')).toBe(false);
    expect(ms.selectionBounds(['b'])).not.toBeNull();
  });
});

describe('Reveal: contorno azul sem mudar o modelo normal', () => {
  it('parede revelada continua desenhada e ganha arestas azuis (sem preenchimento)', () => {
    const p = casa();
    const base = cena(p);
    const ms = cena(p, { revealed: new Set(['a']) });

    // O modelo normal não filtrou o revelado.
    expect(ms.selectionBounds(['a'])).not.toBeNull();
    expect(malhas(ms)).toHaveLength(malhas(base).length);

    const azul = azuis(ms);
    expect(azul).toHaveLength(1);
    expect(azul[0]!.geometry.getAttribute('position').count).toBeGreaterThan(0);
    // Só linhas: nenhum preenchimento azul que esconda o modelo.
    expect(malhas(ms).some((m) => (m.material as THREE.MeshBasicMaterial).color?.getHex() === AZUL)).toBe(false);
    const alvo = ms.selectionBounds(['a'])!;
    const caixa = new THREE.Box3().setFromBufferAttribute(azul[0]!.geometry.getAttribute('position') as THREE.BufferAttribute);
    expect(caixa.min.x).toBeCloseTo(alvo.min.x, 6);
    expect(caixa.max.x).toBeCloseTo(alvo.max.x, 6);
  });

  it('piso revelado ganha o contorno na cota dele, e o modelo normal permanece', () => {
    const p = casa();
    const base = cena(p);
    const ms = cena(p, { revealed: new Set(['f']) });

    expect(ms.selectionBounds(['f'])).not.toBeNull();
    expect(malhas(ms)).toHaveLength(malhas(base).length);
    const azul = azuis(ms);
    expect(azul).toHaveLength(1);
    const caixa = new THREE.Box3().setFromBufferAttribute(azul[0]!.geometry.getAttribute('position') as THREE.BufferAttribute);
    const alvo = ms.selectionBounds(['f'])!;
    expect(caixa.min.z).toBeCloseTo(alvo.min.z, 6);
    expect(caixa.max.z).toBeCloseTo(alvo.max.z, 6);
  });

  it('oculto e revelado ao mesmo tempo: o oculto vence (sem malha nem borda)', () => {
    const p = casa();
    const ms = cena(p, { hidden: new Set(['a']), revealed: new Set(['a']) });
    expect(ms.selectionBounds(['a'])).toBeNull();
    expect(azuis(ms)).toHaveLength(0);
  });

  it('caminho instanciado: parede revelada também ganha arestas azuis', () => {
    const p = casa();
    const ms = cena(p, { revealed: new Set(['a']) }, true);
    expect(ms.selectionBounds(['a'])).not.toBeNull();
    const azul = azuis(ms);
    expect(azul).toHaveLength(1);
    expect(azul[0]!.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('sem Hide/Reveal a cena continua igual', () => {
  it('conjuntos vazios dão a mesma cena e os mesmos limites de seleção', () => {
    const p = casa();
    const a = cena(p);
    const b = cena(p, { hidden: new Set(), revealed: new Set() });

    expect(malhas(b)).toHaveLength(malhas(a).length);
    expect(linhas(b)).toHaveLength(linhas(a).length);
    expect(azuis(b)).toHaveLength(0);
    expect(b.bounds().min.distanceTo(a.bounds().min)).toBe(0);
    expect(b.bounds().max.distanceTo(a.bounds().max)).toBe(0);
    for (const id of ['a', 'b', 'c', 'd', 'd1', 'j1', 'f']) {
      expect(b.selectionBounds([id])!.equals(a.selectionBounds([id])!)).toBe(true);
    }
  });
});

describe('cache por nível: o conjunto de visibilidade entra na chave', () => {
  it('ocultar e reexibir a parede remonta o nível (não reusa a malha antiga)', () => {
    const p = casa();
    const nv = niveis(p);
    const ms = new ModelScene({ instanciar: false });
    ms.update(p, nv, BASE);
    expect(ms.selectionBounds(['a'])).not.toBeNull();

    ms.update(p, nv, { ...BASE, hidden: new Set(['a']) });
    expect(ms.selectionBounds(['a'])).toBeNull();

    ms.update(p, nv, BASE);
    expect(ms.selectionBounds(['a'])).not.toBeNull();
  });

  it('ligar e desligar o Reveal cria e remove as bordas azuis', () => {
    const p = casa();
    const nv = niveis(p);
    const ms = new ModelScene({ instanciar: false });
    ms.update(p, nv, BASE);
    expect(azuis(ms)).toHaveLength(0);

    ms.update(p, nv, { ...BASE, revealed: new Set(['a']) });
    expect(azuis(ms)).toHaveLength(1);

    ms.update(p, nv, BASE);
    expect(azuis(ms)).toHaveLength(0);
  });
});
