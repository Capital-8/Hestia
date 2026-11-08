// Projetos de estresse da sub-etapa B1 do kernel Rust (decisão 0050 §3): pisos e lajes de todos os tipos que `resolveFloors` e `resolveSlabs`
// distinguem. Em cada pavimento, as paredes do layout sintético (12 quadros de 4 m e divisórias): pisos e lajes ESTÁTICOS (retângulos, com furos
// manuais e deslocamento), VINCULADOS por acabamento e por núcleo (a sala do ponto de semente; semente fora de sala dá circuito aberto), de
// PERÍMETRO (acabamento e núcleo), com lajes inclinadas, tipos de camadas variadas (membrana de espessura zero, prioridade explícita, todos os
// términos, limite no perímetro externo), escadas que furam as lajes e os pisos do pavimento de cima e um pavimento sem paredes (vinculado
// `fora`). Com `paredesB2`, as paredes que a B2 consulta ganham o que muda o término por camada: portas (soleira no piso e acima dele), paredes
// paralelas coladas, diagonais que cruzam os contornos e uma parede curva por pavimento. Nada de projeto real: só geometria sintética. A referência
// é sempre o motor TypeScript.
import {
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  makeFloor,
  makeLevel,
  makeRamp,
  makeSlab,
  makeStair,
  makeWall,
  type Command,
  type FloorType,
  type Id,
  type Layer,
  type OutlineSource,
  type Project,
  type SlabType,
  type StairLanding,
  type StairRun,
} from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { planRamp } from '../packages/engine/src/rampPlan.ts';
import { SEGMENTS } from '../packages/engine/src/fixtureSintetica.ts';
import { aleatorio } from './kernel-a1-estresse.mts';

export interface OpcoesEstresseB1 {
  /** Pavimentos com paredes (padrão 3); o pavimento extra sem paredes entra a mais, se `semParedes` (padrão verdadeiro). */
  pavimentos?: number;
  /** Pisos estáticos, vinculados, de perímetro e o mesmo para lajes, por pavimento (padrões 3, 3, 1). */
  estaticos?: number;
  vinculados?: number;
  perimetros?: number;
  /** Com escadas (padrão verdadeiro). */
  escadas?: boolean;
  semParedes?: boolean;
  /**
   * Furos manuais dos vinculados na célula de 4 m inteira, mesmo quando passam do circuito da sala (padrão falso: o furo cabe na sala do ponto de
   * semente). Furo que passa do circuito é entrada fora do contrato: o `offsetMulti` do TS (Clipper) deixa pedaços soltos em volta do furo e o Rust não.
   */
  furosLivres?: boolean;
  /**
   * B2: paredes extras por pavimento com paredes (portas em ~45% das paredes de 4 m, com a soleira no piso e acima dele; 3 paredes paralelas coladas;
   * 2 diagonais; 1 parede curva). Usa outro gerador de números aleatórios: os pisos e lajes das sementes existentes não mudam.
   */
  paredesB2?: boolean;
  /**
   * B3: as paredes ganham altura própria (algumas chegam a dois pavimentos acima e atravessam lajes e pisos de níveis NÃO adjacentes), `baseOffset`, nível de
   * topo com `topOffset`, anexo da base e do topo a piso e laje (cota e perfil da variante da junção, sem `flatAttach`, diferentes dos do término por camada) e
   * perfil de topo do modelo. Usa outro gerador: os pisos, as lajes e as paredes das sementes existentes não mudam.
   */
  anexos?: boolean;
}

const FUNCOES: Layer['function'][] = ['structure', 'substrate', 'thermal', 'membrane', 'finish1', 'finish2'];
const ESPESSURAS = [0, 0.003, 0.01, 0.02, 0.04, 0.05, 0.1, 0.12, 0.15];

/** Tipo de piso ou de laje com camadas variadas e términos de todas as espécies (`comTerminoValido` precisa aceitar). */
function camadasAleatorias(r: () => number): Layer[] {
  const quantas = 1 + Math.floor(r() * 5);
  const camadas: Layer[] = [];
  const escolhe = <T,>(v: readonly T[]): T => v[Math.floor(r() * v.length)]!;
  for (let i = 0; i < quantas; i++) {
    const funcao = r() < 0.12 ? 'membrane' : escolhe(FUNCOES);
    const esp = funcao === 'membrane' && r() < 0.6 ? 0 : escolhe(ESPESSURAS);
    const l: Layer = { function: funcao, materialId: escolhe(['mat_concreto', 'mat_argamassa', 'mat_ceramica', 'mat_madeira', 'mat_reboco']), thickness: esp, wraps: false };
    if (r() < 0.2) l.priority = 1 + Math.floor(r() * 8);
    const t = r();
    if (t < 0.12) l.termino = 'face';
    else if (t < 0.22) l.termino = 'nucleo';
    else if (t < 0.32) l.termino = 'passa';
    else if (t < 0.42) l.termino = { ate: { prioridade: 1 + Math.floor(r() * 9) } };
    else if (t < 0.58) l.termino = { cm: escolhe([-10, -3, 0, 2, 5, 12]) };
    else if (t < 0.64) l.termino = 'auto';
    if (r() < 0.18) l.limiteExterno = r() < 0.5 ? 'parede' : 'nucleo';
    camadas.push(l);
  }
  // uma estrutura em ~70% dos tipos (o resto fica sem camada estrutural: tudo é núcleo)
  if (r() < 0.7 && !camadas.some((c) => c.function === 'structure')) camadas[camadas.length - 1] = { ...camadas[camadas.length - 1]!, function: 'structure', thickness: 0.12 };
  return camadas;
}

const retangulo = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Lance reto no sentido +x a partir de `(x0, y0)`: `n` espelhos a cada `passo`, largura `largura`. */
export function lanceReto(x0: number, y0: number, n: number, passo: number, largura = 1.2): StairRun {
  const ln = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
  const b = x0 + (n - 1) * passo + 0.5;
  return {
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(x0 - 0.5, y0 + largura / 2, b, y0 + largura / 2)],
    boundaryRight: [ln(x0 - 0.5, y0 - largura / 2, b, y0 - largura / 2)],
    risers: Array.from({ length: n }, (_, k) => ln(x0 + k * passo, y0 - 1, x0 + k * passo, y0 + 1)),
    path: [],
  };
}

/** Projeto de estresse da B1. Determinístico pela semente. */
export function projetoDeEstresseB1(semente: number, opcoes: OpcoesEstresseB1 = {}): Project {
  const r = aleatorio(semente * 40503 + 29);
  const escolhe = <T,>(v: readonly T[]): T => v[Math.floor(r() * v.length)]!;
  const pavimentos = opcoes.pavimentos ?? 3;
  const store = new ProjectStore(createEmptyProject(`Estresse B1 ${semente}`));
  const cmds: Command[] = [];
  const tiposPiso: FloorType[] = Array.from({ length: 8 }, (_, i) => ({ id: `ft_b1_${i}`, name: `Piso B1 ${i}`, code: `PB${i}`, description: '', layers: camadasAleatorias(r), cost: 0 }));
  const tiposLaje: SlabType[] = Array.from({ length: 8 }, (_, i) => ({ id: `ls_b1_${i}`, name: `Laje B1 ${i}`, code: `LB${i}`, description: '', layers: camadasAleatorias(r), cost: 0 }));
  for (const floorType of tiposPiso) cmds.push({ type: 'upsertFloorType', floorType });
  for (const slabType of tiposLaje) cmds.push({ type: 'upsertSlabType', slabType });
  const idsTipoPiso = [...tiposPiso.map((t) => t.id), 'ft_ceram', 'ft_unico', 'ft_laje12'];
  const idsTipoLaje = [...tiposLaje.map((t) => t.id), 'ls_mac12', 'ls_cobertura', 'ls_unica'];
  const niveis: Id[] = [];
  const total = pavimentos + (opcoes.semParedes ?? true ? 1 : 0);
  for (let i = 0; i < total; i++) {
    const id = i === 0 ? 'lv_0' : i === 1 ? 'lv_1' : `lv_x${i}`;
    niveis.push(id);
    cmds.push({ type: 'upsertLevel', level: makeLevel({ id, name: `Pav ${i}`, elevation: i * 2.8 }) });
  }
  const comParedes = niveis.slice(0, pavimentos);
  const tiposDeParede = Object.keys(store.project.wallTypes);
  for (const levelId of comParedes) {
    SEGMENTS.forEach(([[ax, ay], [bx, by]], j) => {
      cmds.push({ type: 'addWall', wall: makeWall({ id: `bw_${semente}_${levelId}_${j}`, typeId: r() < 0.7 ? 'wt_ext19' : escolhe(tiposDeParede), levelId, a: { x: ax, y: ay }, b: { x: bx, y: by } }) });
    });
  }
  if (opcoes.paredesB2) {
    const rr = aleatorio(semente * 104729 + 7);
    const pick = <T,>(v: readonly T[]): T => v[Math.floor(rr() * v.length)]!;
    const tiposDePorta = ['ot_p80', 'ot_p90', 'ot_p160', 'ot_vao90', 'ot_pc160'] as const;
    for (const levelId of comParedes) {
      SEGMENTS.forEach(([[ax, ay], [bx, by]], j) => {
        if (rr() >= 0.45 || Math.hypot(bx - ax, by - ay) < 3.9) return;
        const sill = pick([null, null, 0, 0.02, 0.08, 0.15] as const);
        cmds.push({ type: 'addOpening', opening: { id: `bo_${semente}_${levelId}_${j}`, kind: 'door', typeId: pick(tiposDePorta), hostId: `bw_${semente}_${levelId}_${j}`, offset: 1 + rr() * 2, flipHand: false, flipFacing: rr() < 0.5, sillOverride: sill, mark: '' } });
      });
      // paralelas coladas: o mesmo eixo deslocado de 10 a 40 cm, mais curto
      for (let k = 0; k < 3; k++) {
        const [[ax, ay], [bx, by]] = pick(SEGMENTS);
        const d = pick([0.1, 0.15, 0.25, 0.4] as const);
        const t0 = rr() * 0.4;
        const t1 = 0.6 + rr() * 0.4;
        const vert = ax === bx;
        const a = vert ? { x: ax + d, y: ay + (by - ay) * t0 } : { x: ax + (bx - ax) * t0, y: ay + d };
        const b = vert ? { x: bx + d, y: ay + (by - ay) * t1 } : { x: ax + (bx - ax) * t1, y: by + d };
        cmds.push({ type: 'addWall', wall: makeWall({ id: `bp_${semente}_${levelId}_${k}`, typeId: pick(tiposDeParede), levelId, a, b }) });
      }
      // diagonais que atravessam os contornos dos pisos e das lajes
      for (let k = 0; k < 2; k++) {
        const a = { x: 1 + rr() * 4, y: 1 + rr() * 10 };
        const b = { x: 7 + rr() * 4, y: 1 + rr() * 10 };
        cmds.push({ type: 'addWall', wall: makeWall({ id: `bd_${semente}_${levelId}_${k}`, typeId: pick(tiposDeParede), levelId, a, b }) });
      }
      cmds.push({ type: 'addWall', wall: makeWall({ id: `bc_${semente}_${levelId}`, typeId: pick(tiposDeParede), levelId, a: { x: 2 + rr() * 2, y: 5 + rr() * 2 }, b: { x: 8 + rr() * 2, y: 5 + rr() * 2 }, sag: pick([-0.8, -0.4, 0.5, 0.9] as const) }) });
    }
  }
  let n = 0;
  const heightOffset = (): number => escolhe([0, 0, 0.05, 0.12, -0.02, 0.2]);
  const furosManuais = (x0: number, y0: number, x1: number, y1: number): Vec2[][] => {
    if (r() >= 0.35) return [];
    const w = (x1 - x0) / 4;
    const h = (y1 - y0) / 4;
    return [retangulo(x0 + w, y0 + h, x0 + 2 * w, y0 + 2 * h)];
  };
  // ~12% das sementes caem fora da edificação: circuito aberto (`problem: 'aberto'`) nos pavimentos com paredes
  const sala = (): Vec2 => (r() < 0.12 ? { x: 13.5, y: 6.5 } : { x: Math.floor(r() * 12) + 0.5 + (r() < 0.2 ? 0.3 : 0), y: Math.floor(r() * 12) + 0.5 + (r() < 0.2 ? 0.3 : 0) });
  const origem = (seed: Vec2): OutlineSource => {
    const t = r();
    if (t < 0.4) return { mode: 'walls-finish', seed, linked: true };
    if (t < 0.7) return { mode: 'walls-core', seed, linked: true };
    if (t < 0.85) return { mode: 'perimeter', seed, linked: true, extend: r() < 0.5 ? 'core' : 'finish' };
    // origem guardada, mas desligada (o contorno gravado vale): o modo ainda decide o término das camadas
    return { mode: escolhe(['walls-finish', 'walls-core', 'perimeter'] as const), seed, linked: false, ...(r() < 0.5 ? { extend: 'core' as const } : {}) };
  };
  for (const levelId of niveis) {
    const vazio = !comParedes.includes(levelId);
    const estaticos = opcoes.estaticos ?? 3;
    const vinculados = vazio ? 2 : (opcoes.vinculados ?? 3);
    const perimetros = vazio ? 0 : (opcoes.perimetros ?? 1);
    const geral = (laje: boolean, origemElem: OutlineSource | undefined, boundary: Vec2[], holes: Vec2[][]): Command => {
      const id = `${laje ? 'bs' : 'bf'}_${semente}_${levelId}_${n++}`;
      const base = { id, levelId, boundary, holes, heightOffset: heightOffset(), ...(origemElem ? { outlineSource: origemElem } : {}) };
      if (!laje) return { type: 'addFloor', floor: makeFloor({ ...base, typeId: escolhe(idsTipoPiso) }) };
      const inclinada = r() < 0.4;
      const ang = r() * Math.PI * 2;
      return {
        type: 'addSlab',
        slab: makeSlab({ ...base, typeId: escolhe(idsTipoLaje), slope: inclinada ? { origin: { x: r() * 12, y: r() * 12 }, dir: { x: Math.cos(ang), y: Math.sin(ang) }, percent: escolhe([0.5, 2, 5, 8, 10]) } : null }),
      };
    };
    for (const laje of [false, true]) {
      for (let k = 0; k < estaticos; k++) {
        const x0 = r() * 8;
        const y0 = r() * 8;
        const x1 = x0 + 1 + r() * 4;
        const y1 = y0 + 1 + r() * 4;
        cmds.push(geral(laje, r() < 0.2 ? { mode: 'walls-finish', linked: false } : undefined, retangulo(x0, y0, x1, y1), furosManuais(x0, y0, x1, y1)));
      }
      for (let k = 0; k < vinculados; k++) {
        const seed = sala();
        const gx = Math.floor(seed.x / 4) * 4;
        const gy = Math.floor(seed.y / 4) * 4;
        // furo de 16 cm no ponto de semente: cabe na sala (as paredes ficam em coordenadas inteiras, a 20 cm da semente no mínimo)
        const furoNaSala = (): Vec2[][] => (r() < 0.35 ? [retangulo(seed.x - 0.08, seed.y - 0.08, seed.x + 0.08, seed.y + 0.08)] : []);
        cmds.push(geral(laje, origem(seed), retangulo(gx, gy, gx + 4, gy + 4), opcoes.furosLivres ? furosManuais(gx, gy, gx + 4, gy + 4) : furoNaSala()));
      }
      for (let k = 0; k < perimetros; k++) {
        cmds.push(geral(laje, { mode: 'perimeter', seed: { x: 6, y: 6 }, linked: true, ...(r() < 0.5 ? { extend: 'core' as const } : {}) }, retangulo(0, 0, 12, 12), furosManuais(0, 0, 12, 12)));
      }
    }
  }
  // Escadas: do pavimento i para o i+1, com furo (headroom, full ou nenhum) nas lajes e pisos do pavimento de cima. Para o furo existir, uma laje e
  // um piso estáticos cobrem a escada no pavimento de cima.
  if (opcoes.escadas ?? true) {
    for (let i = 0; i + 1 < comParedes.length; i++) {
      const x0 = 1 + r() * 5;
      const y0 = 1 + r() * 9;
      const topo = comParedes[i + 1]!;
      cmds.push({
        type: 'addStair',
        stair: makeStair({
          id: `bst_${semente}_${i}`,
          typeId: defaultStairTypeId,
          levelId: comParedes[i]!,
          components: [lanceReto(x0, y0, 16, 0.28)],
          openingMode: escolhe(['headroom', 'headroom', 'full', 'none'] as const),
          openingMargin: escolhe([0, 0.05, 0.1]),
          openingRect: r() < 0.25,
          topLevelId: topo,
          ...(r() < 0.3 ? { openingHeadroom: escolhe([1.9, 2.0, 2.4]) } : {}),
        }),
      });
      cmds.push({ type: 'addSlab', slab: makeSlab({ id: `bsc_${semente}_${i}`, typeId: escolhe(idsTipoLaje), levelId: topo, boundary: retangulo(x0 - 1, y0 - 1.5, x0 + 6, y0 + 1.5), heightOffset: heightOffset(), slope: r() < 0.3 ? { origin: { x: x0, y: y0 }, dir: { x: 0, y: 1 }, percent: escolhe([2, 5]) } : null }) });
      cmds.push({ type: 'addFloor', floor: makeFloor({ id: `bfc_${semente}_${i}`, typeId: escolhe(idsTipoPiso), levelId: topo, boundary: retangulo(x0 - 1, y0 - 1.2, x0 + 6, y0 + 1.2), heightOffset: heightOffset() }) });
    }
  }
  store.exec({ type: 'batch', commands: cmds });
  if (opcoes.anexos) {
    const ra = aleatorio(semente * 7919 + 13);
    const pick = <T,>(v: readonly T[]): T => v[Math.floor(ra() * v.length)]!;
    const ajustes: Command[] = [];
    for (const el of Object.values(store.project.elements)) {
      if (el.kind !== 'wall') continue;
      const i = niveis.indexOf(el.levelId);
      const patch: Record<string, unknown> = {};
      if (ra() < 0.35) patch['height'] = pick([2.4, 3.2, 3.6, 5.8] as const);
      if (ra() < 0.3) patch['baseOffset'] = pick([-0.3, -0.1, 0.2] as const);
      if (ra() < 0.35 && i + 1 < niveis.length) {
        patch['topLevelId'] = niveis[i + (ra() < 0.3 && i + 2 < niveis.length ? 2 : 1)];
        patch['topOffset'] = pick([0, -0.05, 0.1] as const);
      }
      if (ra() < 0.4) patch['attachBottomToFloor'] = true;
      if (ra() < 0.4) patch['attachTopToFloor'] = true;
      if (ra() < 0.1) patch['topProfile'] = [{ t: 0, h: 2.8 }, { t: 1.5, h: 3.4 }, { t: 3.5, h: 2.5 }];
      if (Object.keys(patch).length) ajustes.push({ type: 'updateElements', ids: [el.id], patch } as Command);
    }
    store.exec({ type: 'batch', commands: ajustes });
  }
  return store.project;
}

/** O mesmo projeto sem paredes, portas e janelas: nenhum término de camada consulta paredes e nenhum circuito fecha. */
export function semParedes(p: Project): Project {
  return { ...p, elements: Object.fromEntries(Object.entries(p.elements).filter(([, e]) => e.kind !== 'wall' && e.kind !== 'door' && e.kind !== 'window')) };
}

/** Rampa que fura a laje do pavimento de cima (modo `headroom`): o pavimento 1 fica a 0,8 m, como em `rampOpenings.test.ts`. */
export function projetoComRampa(modo: 'headroom' | 'full' | 'none' = 'headroom', inclinada = false): Project {
  const base = createEmptyProject('rampa');
  const store = new ProjectStore({ ...base, levels: base.levels.map((l) => (l.id === 'lv_1' ? { ...l, elevation: 2.5 } : l)) });
  const tipo = base.rampTypes['rmt_nbr9050']!;
  const plano = planRamp({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, H: 0.8, type: tipo, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 });
  if ('error' in plano) throw new Error(plano.error);
  const comps: Array<StairRun | StairLanding> = plano.parts.map((x, i) => (x.kind === 'run' ? { id: `c${i}`, kind: 'run', ...x.run } : { id: `c${i}`, kind: 'landing', ...x.landing }));
  store.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp1', typeId: tipo.id, levelId: 'lv_0', components: comps, openingMode: modo }) });
  store.exec({ type: 'addSlab', slab: makeSlab({ id: 's1', typeId: 'ls_mac15', levelId: 'lv_1', boundary: retangulo(-1, -3, 11, 3), slope: inclinada ? { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, percent: 3 } : null }) });
  store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_laje12', levelId: 'lv_1', boundary: retangulo(-1, -3, 11, 3) }) });
  return store.project;
}
