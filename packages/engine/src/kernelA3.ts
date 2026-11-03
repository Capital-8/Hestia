/**
 * Adaptador da sub-etapa A3a do kernel Rust (decisão 0047 §7): vãos. NÃO calcula geometria: (1) monta as seções
 * `tipos_abertura` e `aberturas` da cena v4 a partir de um `Project` e (2) EXTRAI do motor TypeScript existente
 * (`openingGeometry` de `resolve.ts` e `openingRect` de `openingCut.ts`) o que o Rust produz em `aberturas_geom`, na
 * mesma codificação plana (ver `crates/geom-wasm/schema/cena-v8.json`), para o harness e os testes compararem.
 *
 * O que o JS ainda decide e envia pronto: o tipo normalizado para o vão (`openingType` = `spanTypeOf`: nominalRef leaf
 * e composição) e se a instância tem override de peitoril e de altura. A largura, a altura efetiva, o vão bruto, o
 * centro, `u`, `n` e o `cutHalf` o Rust calcula a partir do quadro da parede.
 */
import { openingCasing, openingFrame, openingFrameDepth, openingFrameStyle, openingType, openingsOfWall, type Id, type Opening, type OpeningFrameStyle, type PlanSymbol, type Project, type WrapMode } from '@hestia/model';
import { makeReturnClipper } from './clipReturn.ts';
import type { MultiPolygon } from '@hestia/geom';
import { levelFrames, openingGeometry, resolveLevelTs, type PlanResolveOptions } from './resolve.ts';
import { openingRect } from './openingCut.ts';
import { compositionCasing, insertMode, insertReturns } from './wrap.ts';
import type { CenaA1, ColunasA1 } from './kernelA1.ts';
import { argumentosA2, decodificarForma, gruposDoNivel, type OpcoesA2 } from './kernelA2.ts';

/** `plano` da seção `tipos_abertura`: o índice do `PlanSymbol` nesta lista (a do esquema). */
export const PLANOS: readonly PlanSymbol[] = ['swing', 'double', 'sliding', 'pivot', 'fixed', 'tilt', 'casement', 'dblact', 'pocket', 'bifold', 'accordion', 'garage', 'hinged', 'hung', 'pivotwin', 'louver'];

/** `estilo_batente` da seção `tipos_abertura`: o índice do `OpeningFrameStyle` nesta lista (a do esquema). */
export const ESTILOS_BATENTE: readonly OpeningFrameStyle[] = ['rebate', 'simple', 'aduela', 'block'];

/** Códigos de `WrapMode` do esquema; `inherit` (só em `closure`) vale 4. */
const MODO: Record<WrapMode, number> = { none: 0, exterior: 1, interior: 2, both: 3 };
export const FECHAMENTO_HERDA = 4;

/** `num` de `openingExtras.ts`: o que não é número finito vale 0 (o `max(0, ...)` fica no Rust). */
const finitoOuZero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export interface CenaA3 {
  secoes: { tipos_abertura: ColunasA1; aberturas: ColunasA1 };
  nLinhas: { tipos_abertura: number; aberturas: number };
  /** id da abertura -> `id_num`. */
  aberturaDe: Map<Id, number>;
  /** id do tipo de abertura -> `id_num`. */
  tipoDe: Map<Id, number>;
  /** Aberturas ignoradas: parede hospedeira sem número interno ou tipo inexistente. */
  ignoradas: number;
}

/** Projeto -> seções `tipos_abertura` e `aberturas`. Ids internados na ordem do projeto; `a1` dá o `id_num` das paredes. */
export function montarCenaA3(p: Project, a1: CenaA1): CenaA3 {
  const tipos: ColunasA1 = {};
  const aberturas: ColunasA1 = {};
  const push = (c: ColunasA1, nome: string, v: number): void => {
    (c[nome] ??= []).push(v);
  };
  const tipoDe = new Map<Id, number>();
  const aberturaDe = new Map<Id, number>();
  let ignoradas = 0;
  for (const el of Object.values(p.elements)) {
    if (el.kind !== 'door' && el.kind !== 'window') continue;
    const o = el as Opening;
    const parede = a1.idDe.get(o.hostId);
    if (parede === undefined || !p.openingTypes[o.typeId]) {
      ignoradas++;
      continue;
    }
    const t = openingType(p, o);
    let tn = tipoDe.get(o.typeId);
    if (tn === undefined) {
      tn = tipoDe.size + 1;
      tipoDe.set(o.typeId, tn);
      push(tipos, 'id_num', tn);
      push(tipos, 'largura', t.width);
      push(tipos, 'altura', t.height);
      push(tipos, 'peitoril', t.sill);
      push(tipos, 'folga_w', finitoOuZero(t.roughOversize?.w));
      push(tipos, 'folga_h', finitoOuZero(t.roughOversize?.h));
      push(tipos, 'folhas', t.leaves);
      push(tipos, 'plano', PLANOS.indexOf(t.plan));
      // Colunas da v5 (retornos): o que `insertMode` e `insertReturns` leem do tipo, já resolvido (o Rust não deriva padrões).
      push(tipos, 'janela', t.kind === 'window' ? 1 : 0);
      push(tipos, 'fechamento', t.closure === 'inherit' ? FECHAMENTO_HERDA : (MODO[t.closure] ?? 0));
      push(tipos, 'tem_alizar', openingCasing(t) || compositionCasing(t) ? 1 : 0);
      push(tipos, 'estilo_batente', ESTILOS_BATENTE.indexOf(openingFrameStyle(t)));
      push(tipos, 'modo_prof', t.frameDepthMode === 'core' ? 1 : t.frameDepthMode === 'fixed' ? 2 : 0);
      // A profundidade que `openingFrameDepth` pede no modo fixed (parede e núcleo folgados: devolve o pedido).
      push(tipos, 'prof_pedida', openingFrameDepth({ frameDepthMode: 'fixed', frameDepth: t.frameDepth }, 1e9, 1e9).depth);
      push(tipos, 'larg_batente', openingFrame(t, 1).frameWidth);
      push(tipos, 'esp_folha', openingFrame(t, 1).leafThickness);
    }
    const id = aberturaDe.size + 1;
    aberturaDe.set(o.id, id);
    const h = o.heightOverride;
    push(aberturas, 'id_num', id);
    push(aberturas, 'tipo_num', tn);
    push(aberturas, 'parede_num', parede);
    push(aberturas, 'kind', o.kind === 'window' ? 1 : 0);
    push(aberturas, 'deslocamento', o.offset);
    push(aberturas, 'flip_mao', o.flipHand ? 1 : 0);
    push(aberturas, 'flip_frente', o.flipFacing ? 1 : 0);
    // `o.sillOverride ?? t.sill`: ausente e null valem o do tipo. Um número não finito vai como está (o Rust recusa).
    push(aberturas, 'tem_peitoril', o.sillOverride === null || o.sillOverride === undefined ? 0 : 1);
    push(aberturas, 'peitoril', o.sillOverride ?? 0);
    // `openingHeight`: só um número finito e positivo vale; o resto usa a altura do tipo (o Rust confere o sinal).
    push(aberturas, 'tem_altura', typeof h === 'number' && Number.isFinite(h) ? 1 : 0);
    push(aberturas, 'altura', typeof h === 'number' && Number.isFinite(h) ? h : 0);
  }
  for (const n of ['id_num', 'largura', 'altura', 'peitoril', 'folga_w', 'folga_h', 'folhas', 'plano', 'janela', 'fechamento', 'tem_alizar', 'estilo_batente', 'modo_prof', 'prof_pedida', 'larg_batente', 'esp_folha']) tipos[n] ??= [];
  for (const n of ['id_num', 'tipo_num', 'parede_num', 'kind', 'deslocamento', 'flip_mao', 'flip_frente', 'tem_peitoril', 'peitoril', 'tem_altura', 'altura']) aberturas[n] ??= [];
  return {
    secoes: { tipos_abertura: tipos, aberturas },
    nLinhas: { tipos_abertura: tipos['id_num']!.length, aberturas: aberturas['id_num']!.length },
    aberturaDe,
    tipoDe,
    ignoradas,
  };
}

/** Uma abertura, na codificação do esquema (ids internados). `cutHalf` é `undefined` na parede reta (campo ausente no TS). */
export interface AberturaA3 {
  id: number;
  parede: number;
  tipo: number;
  janela: boolean;
  folhas: number;
  plano: number;
  flipMao: boolean;
  flipFrente: boolean;
  centro: { x: number; y: number };
  u: { x: number; y: number };
  n: { x: number; y: number };
  largura: number;
  altura: number;
  vaoLargura: number;
  vaoAltura: number;
  peitoril: number;
  espessura: number;
  sHi: number;
  sLo: number;
  deslocamento: number;
  cutHalf: number | undefined;
  /** `openingRect`: o furo. */
  retangulo: MultiPolygon;
}

export const argumentosA3 = (cena: CenaA1, levelId: Id): number[] => {
  const nivel = cena.nivelDe.get(levelId);
  if (nivel === undefined) throw new Error(`nível ${levelId} sem nivel_num`);
  return [nivel];
};

export const numeroDe = (m: Map<Id, number>, id: Id, o: string): number => {
  const n = m.get(id);
  if (n === undefined) throw new Error(`${o} ${id} sem número interno`);
  return n;
};

/**
 * O que o motor TypeScript produz para os vãos de um pavimento: os quadros de `levelFrames` (ordem de `resolveLevel`) e,
 * em cada parede, `openingGeometry` e `openingRect` de cada abertura, na ordem de `openingsOfWall`.
 */
export function referenciaA3a(p: Project, levelId: Id, cena: CenaA1, a3: CenaA3): AberturaA3[] {
  const saida: AberturaA3[] = [];
  for (const f of levelFrames(p, levelId)) {
    if (!cena.idDe.has(f.wall.id)) continue;
    for (const o of openingsOfWall(p, f.wall.id)) {
      if (!a3.aberturaDe.has(o.id)) continue;
      const g = openingGeometry(p, o, f);
      saida.push({
        id: numeroDe(a3.aberturaDe, o.id, 'abertura'),
        parede: numeroDe(cena.idDe, o.hostId, 'parede'),
        tipo: numeroDe(a3.tipoDe, o.typeId, 'tipo de abertura'),
        janela: g.kind === 'window',
        folhas: g.leaves,
        plano: PLANOS.indexOf(g.plan),
        flipMao: g.flipHand,
        flipFrente: g.flipFacing,
        centro: g.center,
        u: g.u,
        n: g.n,
        largura: g.width,
        altura: g.height,
        vaoLargura: g.roughWidth,
        vaoAltura: g.roughHeight,
        peitoril: g.sill,
        espessura: g.thickness,
        sHi: g.sHi,
        sLo: g.sLo,
        deslocamento: g.offset,
        cutHalf: g.cutHalf,
        retangulo: openingRect(g),
      });
    }
  }
  return saida;
}

/** Decodifica as saídas de `aberturas_geom` (arrays tipados do Rust) para o mesmo formato de `referenciaA3a`. */
export function decodificarA3a(s: Record<string, ArrayLike<number>>): AberturaA3[] {
  const ids = s['ids']!;
  const dados = s['dados']!;
  const m = s['medidas']!;
  const r = s['retangulo']!;
  const out: AberturaA3[] = [];
  for (let i = 0; i < ids.length; i++) {
    const d = (k: number): number => dados[7 * i + k]!;
    const x = (k: number): number => m[16 * i + k]!;
    out.push({
      id: ids[i]!,
      parede: d(0),
      tipo: d(1),
      janela: d(2) === 1,
      folhas: d(3),
      plano: d(4),
      flipMao: d(5) === 1,
      flipFrente: d(6) === 1,
      centro: { x: x(0), y: x(1) },
      u: { x: x(2), y: x(3) },
      n: { x: x(4), y: x(5) },
      largura: x(6),
      altura: x(7),
      vaoLargura: x(8),
      vaoAltura: x(9),
      peitoril: x(10),
      espessura: x(11),
      sHi: x(12),
      sLo: x(13),
      deslocamento: x(14),
      cutHalf: Number.isNaN(x(15)) ? undefined : x(15),
      retangulo: [[Array.from({ length: 4 }, (_, k) => ({ x: r[8 * i + 2 * k]!, y: r[8 * i + 2 * k + 1]! }))]],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// A3b: retornos de acabamento nos vãos (`insertMode`, `insertReturns`, `makeReturnClipper`).

/** Um retorno de acabamento (parede, abertura, camada), na codificação do esquema. */
export interface RetornoA3b {
  parede: number;
  abertura: number;
  /** `layerIndex` da camada envolvente. */
  camada: number;
  grupo: number;
  /** `insertMode` efetivo: 0 none, 1 exterior, 2 interior, 3 both. */
  modo: number;
  /** O retorno de `insertReturns`. */
  bruto: MultiPolygon;
  /** O que `makeReturnClipper` devolve sobre ele, contra o pintado em planta do grupo. */
  recorte: MultiPolygon;
}

/** Argumentos de `retornos_geom`: os mesmos de `itens_pintados` (opções de planta incluídas). */
export { argumentosA2 as argumentosA3b } from './kernelA2.ts';

/**
 * O que o motor TypeScript produz para os retornos de um pavimento, na ordem de `resolveLevel`: grupos de `clusterWalls`,
 * paredes na ordem do grupo, aberturas na ordem de `openingsOfWall` e, em cada uma, a ordem de `insertReturns`. O recorte é o
 * de `solveCluster` na planta: `makeReturnClipper(items)(r, wallId, plan)` com `plan` = pintura dos itens em planta do grupo.
 */
export function referenciaA3b(p: Project, levelId: Id, cena: CenaA1, a3: CenaA3, opcoes: OpcoesA2 = {}): RetornoA3b[] {
  const saida: RetornoA3b[] = [];
  gruposDoNivel(p, levelId, cena, opcoes).forEach(({ group, items, plano }, grupo) => {
    const clipReturn = makeReturnClipper(items);
    for (const f of group) {
      for (const o of openingsOfWall(p, f.wall.id)) {
        if (!a3.aberturaDe.has(o.id)) continue;
        const ot = openingType(p, o);
        const modo = insertMode(f.type, ot);
        for (const r of insertReturns(f, o.offset, ot.width, modo, { ot, side: o.flipFacing ? -1 : 1 })) {
          saida.push({
            parede: numeroDe(cena.idDe, f.wall.id, 'parede'),
            abertura: numeroDe(a3.aberturaDe, o.id, 'abertura'),
            camada: r.layerIndex,
            grupo,
            modo: MODO[modo],
            bruto: r.poly,
            recorte: clipReturn({ poly: r.poly }, f.wall.id, plano),
          });
        }
      }
    }
  });
  return saida;
}

/** Decodifica as saídas de `retornos_geom` (arrays tipados do Rust) para o mesmo formato de `referenciaA3b`. */
export function decodificarA3b(s: Record<string, ArrayLike<number>>): RetornoA3b[] {
  const r = s['retornos']!;
  const cab = s['formas_cab']!;
  const pol = s['poligonos']!;
  const an = s['aneis']!;
  const pt = s['pontos']!;
  const out: RetornoA3b[] = [];
  for (let i = 0; i < r.length / 5; i++) {
    out.push({
      parede: r[5 * i]!,
      abertura: r[5 * i + 1]!,
      camada: r[5 * i + 2]!,
      grupo: r[5 * i + 3]!,
      modo: r[5 * i + 4]!,
      bruto: decodificarForma(pol, an, pt, cab[4 * i]!, cab[4 * i + 1]!),
      recorte: decodificarForma(pol, an, pt, cab[4 * i + 2]!, cab[4 * i + 3]!),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// A3c: `solveCluster` (faixas verticais, `cut` da planta, regiões por material e silhueta).

/** Uma faixa vertical de uma camada (`LayerBand` sem inclinação): alturas relativas à base da parede. */
export interface FaixaA3c {
  z0: number;
  z1: number;
  poly: MultiPolygon;
}

/** Uma camada resolvida (`ResolvedLayer`) na codificação do esquema (ids internados). */
export interface CamadaA3c {
  parede: number;
  grupo: number;
  /** `layerIndex < 0`: faixa vertical do tipo. */
  faixa: boolean;
  /** Índice da camada, ou da faixa em `faixas` (o `layerIndex` do TS é `-(indice + 1)` nas faixas). */
  indice: number;
  material: number;
  core: boolean;
  prioridade: number;
  raw: MultiPolygon;
  fragment: MultiPolygon;
  cut: MultiPolygon;
  faixas: FaixaA3c[];
}

/** Região por material de um grupo. */
export interface RegiaoA3c {
  grupo: number;
  material: number;
  poligonos: MultiPolygon;
}

/** O que `cluster_resolvido` devolve: camadas na ordem de `resolveLevel`, regiões por material e uma silhueta por grupo. */
export interface ClusterA3c {
  camadas: CamadaA3c[];
  regioes: RegiaoA3c[];
  silhuetas: MultiPolygon[];
}

/** Opções de planta de `cluster_resolvido`: as da A2 e `planOpenings` (as aberturas que furam a parede na planta). */
export type OpcoesA3c = OpcoesA2 & Pick<PlanResolveOptions, 'planOpenings'>;

/** Argumentos de `cluster_resolvido`: os de `itens_pintados` (7 fixos, sem repetir os ids de contorno) mais as aberturas de planta. */
export function argumentosA3c(p: Project, levelId: Id, cena: CenaA1, a3: CenaA3, opcoes: OpcoesA3c = {}): number[] {
  const [nivel, tol, temCorte, corte, nContorno, ...ids] = argumentosA2(p, levelId, cena, opcoes);
  const aberturas = opcoes.planOpenings === undefined ? [] : [...opcoes.planOpenings].flatMap((id) => (a3.aberturaDe.has(id) ? [a3.aberturaDe.get(id)!] : []));
  return [nivel!, tol!, temCorte!, corte!, nContorno!, opcoes.planOpenings === undefined ? 0 : 1, aberturas.length, ...ids, ...aberturas];
}

/**
 * O que o motor TypeScript produz: `resolveLevel` com as opções de planta (cache próprio, vazio), na ordem de `resolveLevel`
 * (grupos de `clusterWalls`; em cada um, as paredes do grupo e, em cada parede, as camadas já ordenadas por `layerIndex`).
 * Paredes com perfil de topo ou de base entram (a A3d as cobre); aqui as faixas só levam z0, z1 e a região, sem a inclinação (`referenciaA3d` a leva).
 */
export function referenciaA3c(p: Project, levelId: Id, cena: CenaA1, opcoes: OpcoesA3c = {}): ClusterA3c {
  const r = resolveLevelTs(p, levelId, new Map(), opcoes);
  const saida: ClusterA3c = { camadas: [], regioes: [], silhuetas: [] };
  r.clusters.forEach((c, grupo) => {
    for (const id of c.wallIds) {
      const w = r.walls[id]!;
      for (const l of w.layers) {
        const faixa = l.layerIndex < 0;
        saida.camadas.push({
          parede: numeroDe(cena.idDe, id, 'parede'),
          grupo,
          faixa,
          indice: faixa ? -l.layerIndex - 1 : l.layerIndex,
          material: numeroDe(cena.materialDe, l.materialId, 'material'),
          core: l.core,
          prioridade: l.priority,
          raw: l.raw,
          fragment: l.fragment,
          cut: l.cut,
          faixas: l.bands.map((b) => ({ z0: b.z0, z1: b.z1, poly: b.poly })),
        });
      }
    }
    for (const g of c.regions) saida.regioes.push({ grupo, material: numeroDe(cena.materialDe, g.materialId, 'material'), poligonos: g.polygons });
    saida.silhuetas.push(c.silhouette);
  });
  return saida;
}

/** Decodifica as saídas de `cluster_resolvido` (arrays tipados do Rust) para o mesmo formato de `referenciaA3c`. */
export function decodificarA3c(s: Record<string, ArrayLike<number>>): ClusterA3c {
  const cam = s['camadas']!;
  const prio = s['camadas_num']!;
  const formas = s['camadas_formas']!;
  const fz = s['faixas']!;
  const ff = s['faixas_forma']!;
  const reg = s['regioes']!;
  const sil = s['silhuetas']!;
  const pol = s['poligonos']!;
  const an = s['aneis']!;
  const pt = s['pontos']!;
  const forma = (ini: number, n: number): MultiPolygon => decodificarForma(pol, an, pt, ini, n);
  const camadas: CamadaA3c[] = [];
  for (let i = 0; i < cam.length / 6; i++) {
    const f = (k: number): number => formas[8 * i + k]!;
    const faixas: FaixaA3c[] = [];
    for (let b = f(6); b < f(6) + f(7); b++) faixas.push({ z0: fz[2 * b]!, z1: fz[2 * b + 1]!, poly: forma(ff[2 * b]!, ff[2 * b + 1]!) });
    camadas.push({
      parede: cam[6 * i]!,
      grupo: cam[6 * i + 1]!,
      faixa: cam[6 * i + 2] === 1,
      indice: cam[6 * i + 3]!,
      material: cam[6 * i + 4]!,
      core: cam[6 * i + 5] === 1,
      prioridade: prio[i]!,
      raw: forma(f(0), f(1)),
      fragment: forma(f(2), f(3)),
      cut: forma(f(4), f(5)),
      faixas,
    });
  }
  const regioes: RegiaoA3c[] = [];
  for (let i = 0; i < reg.length / 4; i++) regioes.push({ grupo: reg[4 * i]!, material: reg[4 * i + 1]!, poligonos: forma(reg[4 * i + 2]!, reg[4 * i + 3]!) });
  const silhuetas: MultiPolygon[] = [];
  for (let i = 0; i < sil.length / 3; i++) silhuetas.push(forma(sil[3 * i + 1]!, sil[3 * i + 2]!));
  return { camadas, regioes, silhuetas };
}
