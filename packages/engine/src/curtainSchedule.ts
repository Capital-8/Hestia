// Tabela de quantitativos das paredes cortina (decisão 0056, §5.7 e §11). As quantidades vêm de `quant_cortina` (kernel Rust);
// o TS só traduz os ids, aplica o custo e a massa quando houver densidade. Sem kernel, a linha existe e os números ficam
// vazios (`null`), nunca zero: zero seria um quantitativo errado.

import { CenaV2 } from '@hestia/geom';
import { curtainPanelTypesOf, isCurtainType, isWall, mullionTypesOf, wallType, type Id, type Project, type Wall } from '@hestia/model';
import { gerenciadorDoKernel } from './kernelDespacho.ts';
import { enviarCenaCortina, lerQuantCortina, montarCenaCortina, type LinhaQuantCortina } from './kernelCortina.ts';
import { entradaCortinaDoProjeto } from './cortinaProjeto.ts';
import { resumirCortinas, type ResumoCortina } from './curtainQuantities.ts';

/** `NIVEL_TODOS` do esquema (todas as paredes cortina do projeto). */
const NIVEL_TODOS = 4294967295;

const levelName = (p: Project, levelId: Id): string => p.levels.find((l) => l.id === levelId)?.name ?? '';

/** Motivo de a tabela não ter números: kernel desligado, ou a consulta falhou (a mensagem vai junto). */
export type MotivoSemQuantidades = 'sem-kernel' | 'falha';

export interface CurtainScheduleRow {
  wallId: Id;
  mark: string;
  typeId: Id;
  typeName: string;
  levelId: Id;
  levelName: string;
  /** Números só quando o kernel calculou. Sem ele, todos os números são `null`. */
  comprimento: number | null;
  altura: number | null;
  areaBruta: number | null;
  vidroBruta: number | null;
  vidroVisivel: number | null;
  areaSolida: number | null;
  areaVazia: number | null;
  metrosMontante: number | null;
  quantidadeMontantes: number | null;
  quantidadePaineis: number | null;
  volumeMontantes: number | null;
  /** Custo informativo: custo da parede × área bruta, mais o custo por metro dos montantes e por m² dos painéis. */
  custo: number | null;
  /** `true` quando a linha tem números do kernel. */
  pronto: boolean;
}

export interface CurtainScheduleTotals {
  count: number;
  comprimento: number;
  areaBruta: number;
  vidroBruta: number;
  vidroVisivel: number;
  areaSolida: number;
  metrosMontante: number;
  quantidadeMontantes: number;
  quantidadePaineis: number;
  custo: number;
}

export interface CurtainSchedule {
  rows: CurtainScheduleRow[];
  /** `true` quando não há paredes cortina ou o kernel calculou todas. */
  pronto: boolean;
  motivo: MotivoSemQuantidades | null;
  /** Mensagem técnica da falha (só para o diagnóstico; não vai para a tela sem tradução). */
  erro: string | null;
  totals: CurtainScheduleTotals;
}

const TOTAIS_VAZIOS: CurtainScheduleTotals = { count: 0, comprimento: 0, areaBruta: 0, vidroBruta: 0, vidroVisivel: 0, areaSolida: 0, metrosMontante: 0, quantidadeMontantes: 0, quantidadePaineis: 0, custo: 0 };

/** Consulta `quant_cortina` do kernel e devolve as linhas com os ids do adaptador. Nunca lança: a falha vira motivo. */
function consultarKernel(p: Project): { linhas: LinhaQuantCortina[]; cortinaDe: Map<string, number>; montanteDe: Map<string, number>; painelDe: Map<string, number> } | { motivo: MotivoSemQuantidades; erro: string | null } {
  const ger = gerenciadorDoKernel();
  if (!ger) return { motivo: 'sem-kernel', erro: null };
  const entrada = entradaCortinaDoProjeto(p).entrada;
  const cena0 = montarCenaCortina(entrada);
  let cena: CenaV2 | null = null;
  try {
    cena = CenaV2.criar(ger, (c) => enviarCenaCortina(c, cena0));
    const linhas = lerQuantCortina(cena.consultar('quant_cortina', [NIVEL_TODOS]));
    return { linhas, cortinaDe: cena0.cortinaDe, montanteDe: cena0.montanteDe, painelDe: cena0.painelDe };
  } catch (e) {
    return { motivo: 'falha', erro: e instanceof Error ? e.message : String(e) };
  } finally {
    cena?.destruir();
  }
}

/** Tabela de quantitativos das paredes cortina, nível a nível (ordem de criação). Sem paredes cortina, não chama o kernel. */
export function buildCurtainSchedule(p: Project): CurtainSchedule {
  const paredes = Object.values(p.elements).filter((e): e is Wall => isWall(e) && isCurtainType(p.wallTypes[e.typeId]));
  if (paredes.length === 0) return { rows: [], pronto: true, motivo: null, erro: null, totals: TOTAIS_VAZIOS };

  const k = consultarKernel(p);
  if ('motivo' in k) {
    const rows = paredes.map((w) => linhaVazia(p, w));
    return { rows, pronto: false, motivo: k.motivo, erro: k.erro, totals: TOTAIS_VAZIOS };
  }

  const idDaCortina = new Map([...k.cortinaDe].map(([id, num]) => [num, id] as const));
  const idDoMontante = new Map([...k.montanteDe].map(([id, num]) => [num, id] as const));
  const idDoPainel = new Map([...k.painelDe].map(([id, num]) => [num, id] as const));
  const resumos = resumirCortinas(k.linhas);
  const porParede = new Map<Id, ResumoCortina>();
  for (const r of resumos) {
    const wallId = idDaCortina.get(r.cortina);
    if (wallId !== undefined) porParede.set(wallId, r);
  }

  const mullions = mullionTypesOf(p);
  const panels = curtainPanelTypesOf(p);
  const rows = paredes.map((w) => {
    const r = porParede.get(w.id);
    if (!r) return linhaVazia(p, w);
    const tipo = wallType(p, w);
    let custo = tipo.cost * r.areaSistema;
    for (const [num, metros] of r.metrosPorTipo) {
      const mt = mullions[idDoMontante.get(num) ?? ''];
      custo += metros * (mt?.cost ?? 0);
    }
    for (const [num, area] of r.areaBrutaPorTipoPainel) {
      const pn = panels[idDoPainel.get(num) ?? ''];
      custo += area * (pn?.cost ?? 0);
    }
    return {
      wallId: w.id,
      mark: w.mark,
      typeId: tipo.id,
      typeName: tipo.name,
      levelId: w.levelId,
      levelName: levelName(p, w.levelId),
      comprimento: r.comprimento,
      altura: r.areaSistema && r.comprimento ? r.areaSistema / r.comprimento : 0,
      areaBruta: r.areaSistema,
      vidroBruta: r.vidroBruta,
      vidroVisivel: r.vidroVisivel,
      areaSolida: r.areaSolida,
      areaVazia: r.areaVazia,
      metrosMontante: r.metrosMontante,
      quantidadeMontantes: r.quantidadeMontantes,
      quantidadePaineis: r.quantidadePaineis,
      volumeMontantes: r.volumeMontantes,
      custo,
      pronto: true,
    } satisfies CurtainScheduleRow;
  });

  return { rows, pronto: true, motivo: null, erro: null, totals: somar(rows) };
}

/** Linha sem números (kernel desligado ou a cortina não apareceu na resposta): nome, marca e nível, sem zeros. */
function linhaVazia(p: Project, w: Wall): CurtainScheduleRow {
  const tipo = wallType(p, w);
  return {
    wallId: w.id,
    mark: w.mark,
    typeId: tipo.id,
    typeName: tipo.name,
    levelId: w.levelId,
    levelName: levelName(p, w.levelId),
    comprimento: null,
    altura: null,
    areaBruta: null,
    vidroBruta: null,
    vidroVisivel: null,
    areaSolida: null,
    areaVazia: null,
    metrosMontante: null,
    quantidadeMontantes: null,
    quantidadePaineis: null,
    volumeMontantes: null,
    custo: null,
    pronto: false,
  };
}

/** Somatório só das linhas com números. */
export function somar(rows: readonly CurtainScheduleRow[]): CurtainScheduleTotals {
  const t: CurtainScheduleTotals = { ...TOTAIS_VAZIOS };
  for (const r of rows) {
    if (!r.pronto) continue;
    t.count++;
    t.comprimento += r.comprimento ?? 0;
    t.areaBruta += r.areaBruta ?? 0;
    t.vidroBruta += r.vidroBruta ?? 0;
    t.vidroVisivel += r.vidroVisivel ?? 0;
    t.areaSolida += r.areaSolida ?? 0;
    t.metrosMontante += r.metrosMontante ?? 0;
    t.quantidadeMontantes += r.quantidadeMontantes ?? 0;
    t.quantidadePaineis += r.quantidadePaineis ?? 0;
    t.custo += r.custo ?? 0;
  }
  return t;
}
