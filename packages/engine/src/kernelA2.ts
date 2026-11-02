/**
 * Adaptador da sub-etapa A2 do kernel Rust (decisão 0047). NÃO calcula geometria: EXTRAI do motor TypeScript
 * (`buildItems` e `paint` de `resolve.ts`, exportados) os itens por camada e o fragmento pintado de cada pavimento,
 * na mesma codificação plana da consulta `itens_pintados` (ver `crates/geom-wasm/schema/cena-v4.json`), e decodifica a
 * saída do Rust para o mesmo formato, para o harness e os testes compararem. A orquestração por grupo
 * (pontas livres, paredes que atravessam um T, corte da planta) é a de `resolveLevel`; o teste
 * `kernelA2.test.ts` confere que o resultado é o que `resolveLevel` entrega.
 */
import type { Id, Project } from '@hestia/model';
import type { MultiPolygon } from '@hestia/geom';
import { buildItems, clusterWalls, levelFrames, paint, type Item, type PlanResolveOptions } from './resolve.ts';
import { estruturaDasJuncoes } from './resolveMemo.ts';
import { DEFAULT_JOIN_TOL } from './joins.ts';
import type { CenaA1 } from './kernelA1.ts';
import type { WallZ } from './wallZ.ts';
import { zDoNivel } from './kernelA1.ts';

/** Altura (relativa à base) do plano de corte da planta quando não há `cutZ` (`PLAN_CUT` de `resolve.ts`). */
const PLAN_CUT = 1.2;

/** Um item, na codificação do esquema (ids internados em `id_num` e `material_num`). */
export interface ItemA2 {
  parede: number;
  grupo: number;
  faixa: boolean;
  /** Índice da camada no tipo, ou da faixa em `faixas` (o `layerIndex` do TS é `-(indice + 1)` nas faixas). */
  indice: number;
  material: number;
  core: boolean;
  emPlanta: boolean;
  contorno: boolean;
  atravessa: boolean;
  prioridade: number;
  ordem: number;
  nucleoT: number;
  z0: number;
  z1: number;
  espessura: number;
  bruto: MultiPolygon;
  fragmento: MultiPolygon;
}

/** Opções de planta que a consulta aceita (`PlanResolveOptions` sem o que é da A3 ou interno). */
export type OpcoesA2 = Pick<PlanResolveOptions, 'cutZ' | 'outlineWalls' | 'flatAttach'>;

/** Argumentos de `itens_pintados` para um pavimento. */
export function argumentosA2(p: Project, levelId: Id, cena: CenaA1, opcoes: OpcoesA2 = {}): number[] {
  const nivel = cena.nivelDe.get(levelId);
  if (nivel === undefined) throw new Error(`nível ${levelId} sem nivel_num`);
  const ids = [...(opcoes.outlineWalls ?? [])].flatMap((id) => {
    const n = cena.idDe.get(id);
    return n === undefined ? [] : [n];
  });
  return [nivel, p.settings?.joinTolerance ?? DEFAULT_JOIN_TOL, opcoes.cutZ === undefined ? 0 : 1, opcoes.cutZ ?? 0, ids.length, ...ids];
}

const numeroDe = (m: Map<Id, number>, id: Id, o: string): number => {
  const n = m.get(id);
  if (n === undefined) throw new Error(`${o} ${id} sem número interno`);
  return n;
};

/**
 * O que o motor TypeScript produz para os itens de um pavimento, na ordem de `resolveLevel`: grupos de
 * `clusterWalls`, e dentro de cada um `buildItems` de cada parede. `fragmento` é o do pintor para quem está em planta
 * (pintura só entre os itens em planta do grupo) ou de contorno (só entre os de contorno).
 */
export function referenciaA2(p: Project, levelId: Id, cena: CenaA1, opcoes: OpcoesA2 = {}, z: Map<Id, WallZ> = zDoNivel(p, levelId, opcoes.flatAttach === true)): ItemA2[] {
  const tol = p.settings?.joinTolerance;
  const frames = levelFrames(p, levelId).filter((f) => cena.idDe.has(f.wall.id));
  const estrutura = estruturaDasJuncoes(levelId, frames, tol);
  const saida: ItemA2[] = [];
  clusterWalls(frames, estrutura.ends).forEach((group, grupo) => {
    const livres = (f: (typeof group)[number]): Array<'a' | 'b'> =>
      (['a', 'b'] as const).filter((w) => {
        const k = estrutura.status(f.wall.id, w).kind;
        return k === 'free' || k === 'disallowed';
      });
    const atravessam = new Set<Id>();
    for (const f of group) for (const w of ['a', 'b'] as const) {
      const st = estrutura.status(f.wall.id, w);
      if (st.kind === 'tee') atravessam.add(st.hostId);
    }
    const items: Item[] = group.flatMap((f) => {
      const { z0, height } = z.get(f.wall.id)!;
      const corte = opcoes.cutZ ?? z0 + PLAN_CUT;
      return buildItems(f, estrutura.ends.get(f.wall.id)!, livres(f), { z0, z1: z0 + height }, atravessam.has(f.wall.id), corte, opcoes.outlineWalls?.has(f.wall.id) === true);
    });
    const plano = paint(items.filter((i) => i.inPlan));
    const contorno = paint(items.filter((i) => i.outline));
    for (const it of items) {
      const faixa = it.layerIndex < 0;
      saida.push({
        parede: numeroDe(cena.idDe, it.wallId, 'parede'),
        grupo,
        faixa,
        indice: faixa ? -it.layerIndex - 1 : it.layerIndex,
        material: numeroDe(cena.materialDe, it.materialId, 'material'),
        core: it.core,
        emPlanta: it.inPlan,
        contorno: it.outline,
        atravessa: it.through,
        prioridade: it.priority,
        ordem: it.order,
        nucleoT: it.coreT,
        z0: it.z0,
        z1: it.z1,
        espessura: it.thickness,
        bruto: it.shape,
        fragmento: it.inPlan ? (plano.get(it) ?? []) : it.outline ? (contorno.get(it) ?? []) : [],
      });
    }
  });
  return saida;
}

/** Decodifica as saídas de `itens_pintados` (arrays tipados do Rust) para o mesmo formato de `referenciaA2`. */
export function decodificarA2(s: Record<string, ArrayLike<number>>): ItemA2[] {
  const itens = s['itens']!;
  const num = s['itens_num']!;
  const cab = s['formas_cab']!;
  const poligonos = s['poligonos']!;
  const aneis = s['aneis']!;
  const pontos = s['pontos']!;
  const forma = (ini: number, n: number): MultiPolygon => {
    const m: MultiPolygon = [];
    for (let k = ini; k < ini + n; k++) {
      const p: MultiPolygon[number] = [];
      const iniAnel = poligonos[2 * k]!;
      for (let a = iniAnel; a < iniAnel + poligonos[2 * k + 1]!; a++) {
        const iniPt = aneis[2 * a]!;
        const anel: MultiPolygon[number][number] = [];
        for (let q = iniPt; q < iniPt + aneis[2 * a + 1]!; q++) anel.push({ x: pontos[2 * q]!, y: pontos[2 * q + 1]! });
        p.push(anel);
      }
      m.push(p);
    }
    return m;
  };
  const out: ItemA2[] = [];
  for (let i = 0; i < itens.length / 9; i++) {
    out.push({
      parede: itens[9 * i]!,
      grupo: itens[9 * i + 1]!,
      faixa: itens[9 * i + 2] === 1,
      indice: itens[9 * i + 3]!,
      material: itens[9 * i + 4]!,
      core: itens[9 * i + 5] === 1,
      emPlanta: itens[9 * i + 6] === 1,
      contorno: itens[9 * i + 7] === 1,
      atravessa: itens[9 * i + 8] === 1,
      prioridade: num[6 * i]!,
      ordem: num[6 * i + 1]!,
      nucleoT: num[6 * i + 2]!,
      z0: num[6 * i + 3]!,
      z1: num[6 * i + 4]!,
      espessura: num[6 * i + 5]!,
      bruto: forma(cab[4 * i]!, cab[4 * i + 1]!),
      fragmento: forma(cab[4 * i + 2]!, cab[4 * i + 3]!),
    });
  }
  return out;
}
