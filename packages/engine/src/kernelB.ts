/**
 * Adaptador da sub-etapa B1 do kernel Rust (decisão 0050 §3): pisos e lajes. NÃO calcula geometria de piso nem de laje: só
 * (1) monta as seções da cena v8 a partir de um `Project` e
 * (2) EXTRAI de `resolveFloors` e `resolveSlabs` o que o Rust produz em `pisos_lajes_nivel`, na mesma codificação plana (ver
 * `crates/geom-wasm/schema/cena-v9.json`), para o harness e os testes compararem.
 *
 * O que o JS decide e envia pronto (fronteira da decisão 0050 §2): os circuitos fechados dos elementos vinculados e o perímetro externo
 * (`enclosedRooms`/`roomAt`/`outerPerimeter` são da fatia D), o `problem` de `resolveBoundary` e os furos de escada e rampa por elemento
 * (`holesFor` na cota da face inferior do elemento, que usa `coverUnderside` na laje inclinada).
 */
import type { MultiPolygon, Polygon, Ring } from '@hestia/geom';
import { isFloor, isSlab, levelElevation, type Floor, type FloorType, type Id, type Layer, type Project, type Slab, type SlabType } from '@hestia/model';
import type { ColunasA1 } from './kernelA1.ts';
import { decodificarForma } from './kernelA2.ts';
import { enclosedRooms, outerPerimeter, roomAt } from './enclosed.ts';
import { holesFor, openingsOnLevel, type LevelOpenings } from './levelOpenings.ts';
import { resolveBoundary, type OutlineProblem } from './outlineBound.ts';
import { resolveFloors } from './floors.ts';
import { resolveSlabs } from './slabs.ts';
import { coverUnderside } from './stairOpenings.ts';

const FUNCAO: Record<string, number> = { structure: 0, substrate: 1, thermal: 2, membrane: 3, finish1: 4, finish2: 5 };
const MODO: Record<string, number> = { 'walls-finish': 1, 'walls-core': 2, perimeter: 3 };
const PROBLEMA: Record<string, number> = { aberto: 1, fora: 2 };
const TERMINO = { auto: 0, face: 1, nucleo: 2, passa: 3, ate: 4, cm: 5 } as const;
const LIMITE_EXTERNO: Record<string, number> = { parede: 1, nucleo: 2 };
/** `papel` de `contornos_vinculados`. */
const PAPEL = { circuitoAcabamento: 0, circuitoNucleo: 1, perimetroAcabamento: 2, perimetroNucleo: 3 } as const;

export const NOMES_SECOES_B1 = ['pisos', 'lajes', 'tipos_piso', 'tipos_laje', 'camadas_piso', 'camadas_laje', 'contornos_estaticos', 'contornos_vinculados', 'furos_nivel'] as const;
export type NomeSecaoB1 = (typeof NOMES_SECOES_B1)[number];

export interface CenaB1 {
  /** Seções por nome do esquema v8, em colunas. */
  secoes: Record<NomeSecaoB1, ColunasA1>;
  nLinhas: Record<NomeSecaoB1, number>;
  /** id do piso -> `id_num`. */
  pisoDe: Map<Id, number>;
  /** id da laje -> `id_num`. */
  lajeDe: Map<Id, number>;
  /** id do tipo de piso -> `id_num`. */
  tipoPisoDe: Map<Id, number>;
  /** id do tipo de laje -> `id_num`. */
  tipoLajeDe: Map<Id, number>;
  /** id do material -> `material_num` (compartilhado com a cena da fatia A quando se passa o mapa dela). */
  materialDe: Map<Id, number>;
  /** id do nível -> `nivel_num` (índice em `p.levels`, o mesmo da A1). */
  nivelDe: Map<Id, number>;
  /** Pisos e lajes ignorados: nível ou tipo inexistente. */
  ignorados: number;
}

const COLUNAS: Record<NomeSecaoB1, readonly string[]> = {
  pisos: ['id_num', 'nivel_num', 'tipo_num', 'ordem', 'cota_nivel', 'desloc', 'modo', 'vinculado', 'tem_semente', 'extend_nucleo', 'problema'],
  lajes: ['id_num', 'nivel_num', 'tipo_num', 'ordem', 'cota_nivel', 'desloc', 'modo', 'vinculado', 'tem_semente', 'extend_nucleo', 'problema', 'tem_inclinacao', 'inc_ox', 'inc_oy', 'inc_dx', 'inc_dy', 'inc_percentual'],
  tipos_piso: ['id_num', 'n_camadas'],
  tipos_laje: ['id_num', 'n_camadas'],
  camadas_piso: ['id_num', 'tipo_num', 'indice', 'espessura', 'funcao', 'tem_prioridade', 'prioridade', 'material_num', 'termino', 'termino_valor', 'limite_externo'],
  camadas_laje: ['id_num', 'tipo_num', 'indice', 'espessura', 'funcao', 'tem_prioridade', 'prioridade', 'material_num', 'termino', 'termino_valor', 'limite_externo'],
  contornos_estaticos: ['id_num', 'tipo_el', 'elemento_num', 'anel', 'indice', 'x', 'y'],
  contornos_vinculados: ['id_num', 'tipo_el', 'elemento_num', 'papel', 'anel', 'indice', 'x', 'y'],
  furos_nivel: ['id_num', 'tipo_el', 'elemento_num', 'poligono', 'anel', 'indice', 'x', 'y'],
};

/** Término da camada no esquema: o código e o valor (prioridade de `ate`, cm de `cm`). */
function codificarTermino(l: Layer): [number, number] {
  const t = l.termino ?? 'auto';
  if (typeof t === 'string') return [TERMINO[t], 0];
  if ('ate' in t) return [TERMINO.ate, t.ate.prioridade];
  return [TERMINO.cm, t.cm];
}

/**
 * Projeto -> seções `pisos`, `lajes`, `tipos_piso`, `tipos_laje`, `camadas_piso`, `camadas_laje`, `contornos_estaticos`,
 * `contornos_vinculados` e `furos_nivel`. Ids internados na ordem do projeto. `materialDe`: o mapa de materiais da cena da fatia A, para a
 * numeração ser a mesma (materiais novos entram no fim).
 */
export function montarCenaB1(p: Project, materialDe: Map<Id, number> = new Map()): CenaB1 {
  const nivelDe = new Map<Id, number>(p.levels.map((l, i) => [l.id, i] as const));
  const secoes = Object.fromEntries(NOMES_SECOES_B1.map((n) => [n, Object.fromEntries(COLUNAS[n].map((c) => [c, [] as number[]]))])) as Record<NomeSecaoB1, ColunasA1>;
  const push = (secao: NomeSecaoB1, valores: Record<string, number>): void => {
    for (const [c, v] of Object.entries(valores)) secoes[secao][c]!.push(v);
  };
  const materialNum = (id: Id): number => {
    let n = materialDe.get(id);
    if (n === undefined) materialDe.set(id, (n = materialDe.size + 1));
    return n;
  };
  const pisoDe = new Map<Id, number>();
  const lajeDe = new Map<Id, number>();
  const tipoPisoDe = new Map<Id, number>();
  const tipoLajeDe = new Map<Id, number>();
  const aberturas = new Map<Id, LevelOpenings>();
  let ignorados = 0;
  const proximaCamada = { piso: 1, laje: 1 };
  let proximoContorno = 1;
  let proximoVinculado = 1;
  let proximoFuro = 1;

  const aneis = (secao: 'contornos_estaticos' | 'contornos_vinculados' | 'furos_nivel', tipoEl: number, elem: number, extra: Record<string, number>, rings: readonly Ring[]): void => {
    rings.forEach((r, anel) =>
      r.forEach((q, indice) => {
        const id = secao === 'contornos_estaticos' ? proximoContorno++ : secao === 'contornos_vinculados' ? proximoVinculado++ : proximoFuro++;
        push(secao, { id_num: id, tipo_el: tipoEl, elemento_num: elem, ...extra, anel, indice, x: q.x, y: q.y });
      }),
    );
  };

  for (const el of Object.values(p.elements)) {
    const laje = isSlab(el);
    if (!laje && !isFloor(el)) continue;
    const elemento = el as Floor | Slab;
    const nivel = nivelDe.get(elemento.levelId);
    const tipo: FloorType | SlabType | undefined = laje ? p.slabTypes[elemento.typeId] : p.floorTypes[elemento.typeId];
    if (nivel === undefined || !tipo) {
      ignorados++;
      continue;
    }
    const tipos = laje ? tipoLajeDe : tipoPisoDe;
    let tn = tipos.get(tipo.id);
    if (tn === undefined) {
      tn = tipos.size + 1;
      tipos.set(tipo.id, tn);
      push(laje ? 'tipos_laje' : 'tipos_piso', { id_num: tn, n_camadas: tipo.layers.length });
      tipo.layers.forEach((l, i) => {
        const [termino, valor] = codificarTermino(l);
        push(laje ? 'camadas_laje' : 'camadas_piso', {
          id_num: laje ? proximaCamada.laje++ : proximaCamada.piso++,
          tipo_num: tn!,
          indice: i,
          espessura: l.thickness,
          funcao: FUNCAO[l.function] ?? 255,
          tem_prioridade: l.priority === undefined ? 0 : 1,
          prioridade: l.priority ?? 0,
          material_num: materialNum(l.materialId),
          termino,
          termino_valor: valor,
          limite_externo: l.limiteExterno ? LIMITE_EXTERNO[l.limiteExterno]! : 0,
        });
      });
    }
    const id = (laje ? lajeDe : pisoDe).size + 1;
    (laje ? lajeDe : pisoDe).set(elemento.id, id);
    const tipoEl = laje ? 1 : 0;
    const src = elemento.outlineSource;
    const vinculado = !!src?.linked;
    const outline = resolveBoundary(p, elemento.levelId, elemento);
    const linha: Record<string, number> = {
      id_num: id,
      nivel_num: nivel,
      tipo_num: tn,
      ordem: elemento.order,
      cota_nivel: levelElevation(p, elemento.levelId),
      desloc: elemento.heightOffset,
      modo: src ? MODO[src.mode]! : 0,
      vinculado: vinculado ? 1 : 0,
      tem_semente: src?.seed ? 1 : 0,
      extend_nucleo: src?.extend === 'core' ? 1 : 0,
      problema: outline.problem ? PROBLEMA[outline.problem]! : 0,
    };
    if (laje) {
      const s = (elemento as Slab).slope;
      Object.assign(linha, { tem_inclinacao: s ? 1 : 0, inc_ox: s?.origin.x ?? 0, inc_oy: s?.origin.y ?? 0, inc_dx: s?.dir.x ?? 0, inc_dy: s?.dir.y ?? 0, inc_percentual: s?.percent ?? 0 });
    }
    push(laje ? 'lajes' : 'pisos', linha);
    aneis('contornos_estaticos', tipoEl, id, {}, [elemento.boundary, ...elemento.holes]);

    // Circuitos e perímetro: o que `resolveBoundary` e `layerOutlines` leem (o Rust usa só o do modo do elemento).
    if (src?.linked && src.mode !== 'perimeter' && src.seed) {
      for (const [extend, papel] of [['finish', PAPEL.circuitoAcabamento], ['core', PAPEL.circuitoNucleo]] as const) {
        const sala = roomAt(enclosedRooms(p, elemento.levelId, extend), src.seed);
        if (sala) aneis('contornos_vinculados', tipoEl, id, { papel }, sala);
      }
    }
    if (src?.mode === 'perimeter' || tipo.layers.some((l) => l.limiteExterno)) {
      for (const [extend, papel] of [['finish', PAPEL.perimetroAcabamento], ['core', PAPEL.perimetroNucleo]] as const) {
        const anel = outerPerimeter(p, elemento.levelId, src?.seed, extend);
        if (anel) aneis('contornos_vinculados', tipoEl, id, { papel }, [anel]);
      }
    }

    // Furos de escada e rampa na cota da face inferior do elemento (a mesma conta de `resolveFloors` e `resolveSlabs`).
    let ab = aberturas.get(elemento.levelId);
    if (!ab) aberturas.set(elemento.levelId, (ab = openingsOnLevel(p, elemento.levelId)));
    if (ab.stairs.length + ab.ramps.length > 0) {
      let z = levelElevation(p, elemento.levelId) + elemento.heightOffset;
      for (const l of tipo.layers) z = z - l.thickness;
      const contorno = outline.polygon ? outline.polygon[0]! : elemento.boundary;
      const furos = outline.polygon ? [...elemento.holes, ...outline.polygon.slice(1)] : elemento.holes;
      const underside = laje ? coverUnderside(z, (elemento as Slab).slope, [contorno, ...furos]) : z;
      const regiao: MultiPolygon = holesFor(ab, underside);
      regiao.forEach((poligono: Polygon, k) => aneis('furos_nivel', tipoEl, id, { poligono: k }, poligono));
    }
  }
  const nLinhas = Object.fromEntries(NOMES_SECOES_B1.map((n) => [n, secoes[n]['id_num']!.length])) as Record<NomeSecaoB1, number>;
  return { secoes, nLinhas, pisoDe, lajeDe, tipoPisoDe, tipoLajeDe, materialDe, nivelDe, ignorados };
}

/** Uma camada de piso ou de laje, na codificação do esquema (ids internados). */
export interface CamadaB1 {
  indice: number;
  material: number;
  z0: number;
  z1: number;
  prioridade: number;
  nucleo: boolean;
  membrana: boolean;
  explicita: boolean;
  /** Só na saída do Rust: o término da camada depende das paredes do nível (B2); a referência TS não tem esse campo. */
  pedeParedes?: boolean;
  poligono: MultiPolygon;
}

export interface InclinacaoB1 {
  origem: { x: number; y: number };
  direcao: { x: number; y: number };
  percentual: number;
}

export interface ElementoB1 {
  laje: boolean;
  id: number;
  tipo: number;
  /** 0 nenhum, 1 aberto, 2 fora. */
  problema: number;
  inclinacao: InclinacaoB1 | null;
  topoZ: number;
  baseZ: number;
  poligono: MultiPolygon;
  camadas: CamadaB1[];
}

/** Argumentos de `pisos_lajes_nivel`. */
export function argumentosB1(_p: Project, levelId: Id, cena: CenaB1): number[] {
  const n = cena.nivelDe.get(levelId);
  if (n === undefined) throw new Error(`nível ${levelId} sem nivel_num`);
  return [n];
}

const numeroDe = (m: Map<Id, number>, id: Id, o: string): number => {
  const n = m.get(id);
  if (n === undefined) throw new Error(`${o} ${id} sem número interno`);
  return n;
};

/** O que o motor TypeScript produz: `resolveFloors` e `resolveSlabs` do nível (pisos e depois lajes), campo a campo. */
export function referenciaB1(p: Project, levelId: Id, cena: CenaB1): ElementoB1[] {
  const out: ElementoB1[] = [];
  for (const f of resolveFloors(p, levelId)) {
    out.push({
      laje: false,
      id: numeroDe(cena.pisoDe, f.floorId, 'piso'),
      tipo: numeroDe(cena.tipoPisoDe, f.typeId, 'tipo de piso'),
      problema: codigoDoProblema(f.problem),
      inclinacao: null,
      topoZ: f.topZ,
      baseZ: f.bottomZ,
      poligono: f.polygon,
      camadas: f.layers.map((l) => ({ indice: l.layerIndex, material: numeroDe(cena.materialDe, l.materialId, 'material'), z0: l.z0, z1: l.z1, prioridade: l.priority, nucleo: l.core, membrana: l.membrane, explicita: l.explicit, poligono: l.polygon })),
    });
  }
  for (const s of resolveSlabs(p, levelId)) {
    out.push({
      laje: true,
      id: numeroDe(cena.lajeDe, s.slabId, 'laje'),
      tipo: numeroDe(cena.tipoLajeDe, s.typeId, 'tipo de laje'),
      problema: codigoDoProblema(s.problem),
      inclinacao: s.slope ? { origem: { ...s.slope.origin }, direcao: { ...s.slope.dir }, percentual: s.slope.percent } : null,
      topoZ: s.topZ,
      baseZ: s.bottomZ,
      poligono: s.polygon,
      camadas: s.layers.map((l) => ({ indice: l.layerIndex, material: numeroDe(cena.materialDe, l.materialId, 'material'), z0: l.z0, z1: l.z1, prioridade: l.priority, nucleo: l.core, membrana: l.membrane, explicita: l.explicit, poligono: l.polygon })),
    });
  }
  return out;
}

const codigoDoProblema = (x: OutlineProblem | null): number => (x ? PROBLEMA[x]! : 0);

/** Decodifica as saídas de `pisos_lajes_nivel` (arrays tipados do Rust) para o mesmo formato de `referenciaB1`. */
export function decodificarB1(s: Record<string, ArrayLike<number>>): ElementoB1[] {
  const el = s['elementos']!;
  const num = s['elementos_num']!;
  const cam = s['camadas']!;
  const camNum = s['camadas_num']!;
  const forma = (ini: number, n: number): MultiPolygon => decodificarForma(s['poligonos']!, s['aneis']!, s['pontos']!, ini, n);
  const out: ElementoB1[] = [];
  for (let i = 0; i < el.length / 9; i++) {
    const e = (k: number): number => el[9 * i + k]!;
    const n = (k: number): number => num[7 * i + k]!;
    const camadas: CamadaB1[] = [];
    for (let c = e(5); c < e(5) + e(6); c++) {
      camadas.push({
        indice: cam[8 * c]!,
        material: cam[8 * c + 1]!,
        nucleo: cam[8 * c + 2] === 1,
        membrana: cam[8 * c + 3] === 1,
        explicita: cam[8 * c + 4] === 1,
        pedeParedes: cam[8 * c + 5] === 1,
        z0: camNum[3 * c]!,
        z1: camNum[3 * c + 1]!,
        prioridade: camNum[3 * c + 2]!,
        poligono: forma(cam[8 * c + 6]!, cam[8 * c + 7]!),
      });
    }
    out.push({
      laje: e(0) === 1,
      id: e(1),
      tipo: e(2),
      problema: e(3),
      inclinacao: e(4) === 1 ? { origem: { x: n(2), y: n(3) }, direcao: { x: n(4), y: n(5) }, percentual: n(6) } : null,
      topoZ: n(0),
      baseZ: n(1),
      poligono: forma(e(7), e(8)),
      camadas,
    });
  }
  return out;
}
