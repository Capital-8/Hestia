/**
 * Casos do término por camada da parede (decisão 0054), compartilhados entre o teste unitário do motor e o teste wasm que compara o Rust com o
 * TypeScript. Cada caso é um projeto pequeno: paredes de três tipos (substrato dos dois lados, só de um lado e sem substrato), lajes com o
 * término `{ camada }` em todas as camadas e quatro disposições (cruz, perímetro, estático, L).
 */
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, makeWall, type Layer, type LayerTermino, type OutlineSource, type Project, type SlabType, type TerminoCamada, type WallType } from '@hestia/model';

const M = { kind: 'miter' as const, flip: false };

const cam = (function_: Layer['function'], materialId: string, thickness: number, termino?: LayerTermino): Layer => ({ function: function_, materialId, thickness, wraps: false, ...(termino === undefined ? {} : { termino }) });

/** Três tipos de parede (da face externa para a interna): substrato nos dois lados, só no lado interno e sem substrato. */
export const TIPOS_DE_PAREDE: Record<string, Layer[]> = {
  wt_t_dois: [cam('finish2', 'mat_tinta', 0.01), cam('substrate', 'mat_reboco', 0.02), cam('structure', 'mat_bloco14', 0.1), cam('substrate', 'mat_reboco', 0.02), cam('finish1', 'mat_ceramica', 0.01)],
  wt_t_um: [cam('finish2', 'mat_tinta', 0.01), cam('structure', 'mat_bloco14', 0.1), cam('substrate', 'mat_reboco', 0.02), cam('finish1', 'mat_ceramica', 0.01)],
  wt_t_sem: [cam('structure', 'mat_bloco14', 0.14)],
};

export const camada = (funcao: TerminoCamada['funcao'], lado: TerminoCamada['lado'], face: TerminoCamada['face'], cm = 0): LayerTermino => ({ camada: { funcao, lado, face, cm } });

/** Conjuntos de quatro regras (uma por camada da laje, de cima para baixo). */
export const REGRAS: Record<string, LayerTermino[]> = {
  basicas: [camada('structure', 'proximo', 'proxima'), camada('substrate', 'proximo', 'distante'), camada('finish1', 'distante', 'meio'), camada('eixo', 'proximo', 'proxima', 2)],
  recuos: [camada('substrate', 'distante', 'proxima', -1.5), camada('thermal', 'proximo', 'meio'), camada('structure', 'distante', 'distante', 1), camada('finish2', 'proximo', 'distante', -2)],
  mistas: [camada('structure', 'distante', 'meio', 0.5), 'face', camada('membrane', 'proximo', 'proxima'), camada('structure', 'proximo', 'distante', -1)],
};

/** Tipo de laje com quatro camadas (1, 2, 3 e 12 cm), topo 20 cm acima do nível: todas cruzam a faixa de cota das paredes de 0 a 2,8 m. */
export const tipoDeLaje = (id: string, termos: readonly LayerTermino[]): SlabType => ({
  id,
  name: id,
  code: id,
  description: '',
  cost: 0,
  layers: [cam('finish1', 'mat_ceramica', 0.01, termos[0]), cam('substrate', 'mat_argamassa', 0.02, termos[1]), cam('substrate', 'mat_argamassa', 0.03, termos[2]), cam('structure', 'mat_concreto', 0.12, termos[3])],
});

export type Disposicao = 'cruz' | 'perimetro' | 'estatico' | 'ele';

interface Parede {
  a: [number, number];
  b: [number, number];
}

const PERIMETRO: Parede[] = [
  { a: [0, 0], b: [6, 0] },
  { a: [6, 0], b: [6, 4] },
  { a: [6, 4], b: [0, 4] },
  { a: [0, 4], b: [0, 0] },
];

function projetoBase(tipoParede: string): Project {
  const base = createEmptyProject();
  const t = base.wallTypes['wt_alv14']!;
  const tipo: WallType = { ...t, id: tipoParede, name: tipoParede, code: tipoParede, layers: TIPOS_DE_PAREDE[tipoParede]! };
  base.wallTypes[tipoParede] = tipo;
  return base;
}

const paredesDe = (d: Disposicao): Parede[] => {
  if (d === 'cruz') return [...PERIMETRO, { a: [3, 0], b: [3, 4] }, { a: [0, 2], b: [6, 2] }];
  if (d === 'ele') return [{ a: [0, 0], b: [6, 0] }, { a: [6, 0], b: [6, 4] }, { a: [6, 4], b: [0, 4] }, { a: [0, 4], b: [0, 0] }, { a: [4, 0], b: [4, 4] }];
  return PERIMETRO;
};

/**
 * Um projeto com as paredes da disposição (tipo `tipoParede`) e as lajes do nível 0 com as regras dadas. `cruz`: quatro cômodos vinculados e
 * um quinto elemento estático; `perimetro`: uma laje de perímetro; `estatico`: uma laje solta sobre o prédio todo; `ele`: dois cômodos
 * (um em L com a parede do meio) vinculados.
 */
export function projetoDoCaso(tipoParede: string, regras: string, disposicao: Disposicao, extra: { alturaTopo?: number } = {}): Project {
  const s = new ProjectStore(projetoBase(tipoParede));
  s.exec({ type: 'upsertSlabType', slabType: tipoDeLaje(`ls_${regras}`, REGRAS[regras]!) });
  paredesDe(disposicao).forEach((w, i) =>
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: tipoParede, levelId: 'lv_0', a: { x: w.a[0], y: w.a[1] }, b: { x: w.b[0], y: w.b[1] }, height: extra.alturaTopo ?? 2.8, joinStart: M, joinEnd: M }) }),
  );
  const retangulo = [{ x: -0.5, y: -0.5 }, { x: 6.5, y: -0.5 }, { x: 6.5, y: 4.5 }, { x: -0.5, y: 4.5 }];
  const laje = (id: string, outlineSource: OutlineSource | undefined, boundary = retangulo): void => {
    s.exec({ type: 'addSlab', slab: makeSlab({ id, typeId: `ls_${regras}`, levelId: 'lv_0', boundary, heightOffset: 0.2, ...(outlineSource ? { outlineSource } : {}) }) });
  };
  if (disposicao === 'cruz') {
    [[1.5, 1], [4.5, 1], [1.5, 3], [4.5, 3]].forEach(([x, y], i) => laje(`s${i}`, { mode: 'walls-finish', seed: { x: x!, y: y! }, linked: true }, [{ x: x! - 1, y: y! - 0.5 }, { x: x! + 1, y: y! - 0.5 }, { x: x! + 1, y: y! + 0.5 }, { x: x! - 1, y: y! + 0.5 }]));
  } else if (disposicao === 'perimetro') {
    laje('s0', { mode: 'perimeter', seed: { x: 3, y: 2 }, linked: true });
  } else if (disposicao === 'estatico') {
    laje('s0', undefined);
  } else {
    laje('s0', { mode: 'walls-finish', seed: { x: 2, y: 2 }, linked: true }, [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }]);
    laje('s1', { mode: 'walls-finish', seed: { x: 5, y: 2 }, linked: true }, [{ x: 4.5, y: 1 }, { x: 5.5, y: 1 }, { x: 5.5, y: 3 }, { x: 4.5, y: 3 }]);
  }
  return s.project;
}

/**
 * Parede do nível 0 com o topo anexado à laje do nível 1 (face inferior em 2,8 m; o topo nominal fica em 3 m) e uma laje estática no nível 1
 * cujas camadas de cima (de 2,9 a 3 m) ficam acima do topo REAL da parede: a faixa nominal as bloquearia, a real não.
 */
export function projetoComTopoAnexado(): Project {
  const base = createEmptyProject();
  const s = new ProjectStore(base);
  const camadas: Layer[] = [cam('finish1', 'mat_ceramica', 0.05, 'face'), cam('substrate', 'mat_argamassa', 0.05, 'face'), cam('structure', 'mat_concreto', 0.1, camada('structure', 'proximo', 'proxima'))];
  s.exec({ type: 'upsertSlabType', slabType: { id: 'ls_anexo', name: 'anexo', code: 'anexo', description: '', cost: 0, layers: camadas } });
  [[0, 0], [4, 0], [4, 3], [0, 3]].forEach(([x, y], i, a) => {
    const [x2, y2] = a[(i + 1) % 4]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: x!, y: y! }, b: { x: x2!, y: y2! }, topLevelId: 'lv_1', attachTopToFloor: true, joinStart: M, joinEnd: M }) });
  });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'sup', typeId: 'ls_anexo', levelId: 'lv_1', boundary: [{ x: -1, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 4 }, { x: -1, y: 4 }] }) });
  return s.project;
}

/** Piso do nível 0 (topo em 0,25 m) sobre uma parede com o topo em rampa de 3 m a 0,1 m: as camadas altas só encontram a parede no começo. */
export function projetoComPerfil(): Project {
  const base = createEmptyProject();
  const s = new ProjectStore(base);
  const camadas: Layer[] = [cam('finish1', 'mat_ceramica', 0.05, 'face'), cam('structure', 'mat_concreto', 0.1, 'face')];
  s.exec({ type: 'upsertFloorType', floorType: { id: 'ft_perfil', name: 'perfil', code: 'perfil', description: '', cost: 0, layers: camadas } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 2 }, b: { x: 4, y: 2 }, height: 3, topProfile: [{ t: 0, h: 3 }, { t: 4, h: 0.1 }], joinStart: M, joinEnd: M }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f0', typeId: 'ft_perfil', levelId: 'lv_0', boundary: [{ x: -1, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: -1, y: 4 }], heightOffset: 1.5 }) });
  return s.project;
}

export const casosDoTermino = (): Array<{ nome: string; p: Project }> => {
  const out: Array<{ nome: string; p: Project }> = [];
  for (const tipo of Object.keys(TIPOS_DE_PAREDE)) {
    for (const regras of Object.keys(REGRAS)) {
      for (const disposicao of ['cruz', 'perimetro', 'estatico', 'ele'] as const) out.push({ nome: `${tipo}/${regras}/${disposicao}`, p: projetoDoCaso(tipo, regras, disposicao) });
    }
  }
  out.push({ nome: 'topo anexado', p: projetoComTopoAnexado() }, { nome: 'perfil', p: projetoComPerfil() });
  return out;
};
