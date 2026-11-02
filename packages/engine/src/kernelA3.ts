/**
 * Adaptador da sub-etapa A3a do kernel Rust (decisão 0047 §7): vãos. NÃO calcula geometria: (1) monta as seções
 * `tipos_abertura` e `aberturas` da cena v4 a partir de um `Project` e (2) EXTRAI do motor TypeScript existente
 * (`openingGeometry` de `resolve.ts` e `openingRect` de `openingCut.ts`) o que o Rust produz em `aberturas_geom`, na
 * mesma codificação plana (ver `crates/geom-wasm/schema/cena-v5.json`), para o harness e os testes compararem.
 *
 * O que o JS ainda decide e envia pronto: o tipo normalizado para o vão (`openingType` = `spanTypeOf`: nominalRef leaf
 * e composição) e se a instância tem override de peitoril e de altura. A largura, a altura efetiva, o vão bruto, o
 * centro, `u`, `n` e o `cutHalf` o Rust calcula a partir do quadro da parede.
 */
import { openingType, openingsOfWall, type Id, type Opening, type PlanSymbol, type Project } from '@hestia/model';
import type { MultiPolygon } from '@hestia/geom';
import { levelFrames, openingGeometry } from './resolve.ts';
import { openingRect } from './openingCut.ts';
import type { CenaA1, ColunasA1 } from './kernelA1.ts';

/** `plano` da seção `tipos_abertura`: o índice do `PlanSymbol` nesta lista (a do esquema). */
export const PLANOS: readonly PlanSymbol[] = ['swing', 'double', 'sliding', 'pivot', 'fixed', 'tilt', 'casement', 'dblact', 'pocket', 'bifold', 'accordion', 'garage', 'hinged', 'hung', 'pivotwin', 'louver'];

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
  for (const n of ['id_num', 'largura', 'altura', 'peitoril', 'folga_w', 'folga_h', 'folhas', 'plano']) tipos[n] ??= [];
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

const numeroDe = (m: Map<Id, number>, id: Id, o: string): number => {
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
