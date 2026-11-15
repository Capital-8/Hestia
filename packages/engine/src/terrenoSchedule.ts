import { isTerrain, isTerrainRegion, type Id, type PapelRegiaoTerreno, type Project, type ResolvedUnits, type Terrain, type TerrainRegion } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import type { Lang } from './i18nMessages.ts';
import { servicoTerreno } from './kernelTerrenoServico.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import type { QuantidadesRegiaoTN, QuantidadesTerreno } from './terrenoQuantities.ts';

/**
 * Tabela "Terreno: corte e aterro" (ficha U2, A.6): uma linha por região, seguida da linha de total do terreno, e o total do projeto no rodapé. Todos os
 * números vêm do kernel (`quantidades()` e `quantidadesRegioes()` do `servicoTerreno()`): aqui só se organiza e se calcula o saldo (corte menos aterro).
 * Sem kernel a tabela vem vazia, com a mensagem do aviso `terreno-sem-kernel` (ou `terreno-invalido`); nunca lança e nunca mostra número de TypeScript.
 */

/** Uma linha da tabela: de uma região (`tipo` `regiao`) ou o total de um terreno (`tipo` `terreno`, sem região nem papel). Áreas em m², volumes em m³ (SI). */
export interface TerrenoScheduleRow {
  tipo: 'regiao' | 'terreno';
  terrenoId: Id;
  terrenoNome: string;
  regiaoId: Id | null;
  regiaoNome: string;
  papel: PapelRegiaoTerreno | null;
  areaPlanta: number;
  areaSuperficie: number;
  volumeCorte: number;
  volumeAterro: number;
  /** Corte menos aterro: positivo sobra terra (retira-se); negativo falta terra (traz-se). */
  saldo: number;
}

export interface TerrenoScheduleTotais {
  areaPlanta: number;
  areaSuperficie: number;
  volumeCorte: number;
  volumeAterro: number;
  saldo: number;
}

export interface TerrenoSchedule {
  rows: TerrenoScheduleRow[];
  /** Total do projeto: a soma das linhas de terreno (as de região já estão dentro delas). */
  totais: TerrenoScheduleTotais;
  /** `false` enquanto o kernel não responde (tabela vazia); `true` também quando o projeto não tem terreno. */
  pronto: boolean;
  /** Mensagem do aviso `terreno-sem-kernel` ou `terreno-invalido` quando `pronto` é `false`; senão `null`. */
  mensagem: string | null;
}

/** As quantidades do kernel de que a tabela precisa; `null` num dos dois = kernel indisponível. */
export interface DadosTerrenoSchedule {
  terrenos: readonly QuantidadesTerreno[] | null;
  regioes: readonly QuantidadesRegiaoTN[] | null;
}

/**
 * Liga do mapa de corte e aterro da planta (caixa "Mapa" da faixa). Mora aqui, junto da tabela, porque o app grava e a camada da planta (render) lê, e o
 * motor é o pacote que os dois já importam. Desligado por padrão: com ele desligado a planta nem consulta o kernel para o mapa.
 */
let mapaLigado = false;

/** Liga ou desliga o mapa de corte e aterro da planta. */
export function definirMapaCorteAterro(valor: boolean): void {
  mapaLigado = valor;
}

/** O mapa de corte e aterro está ligado? */
export const mapaCorteAterroLigado = (): boolean => mapaLigado;

const ZERO: TerrenoScheduleTotais = { areaPlanta: 0, areaSuperficie: 0, volumeCorte: 0, volumeAterro: 0, saldo: 0 };

const porOrdem = <T extends { order: number; id: Id }>(a: T, b: T): number => a.order - b.order || a.id.localeCompare(b.id);

/** Soma das linhas dadas; o saldo é sempre corte menos aterro. */
export function somarTerrenoSchedule(linhas: ReadonlyArray<Pick<TerrenoScheduleRow, 'areaPlanta' | 'areaSuperficie' | 'volumeCorte' | 'volumeAterro'>>): TerrenoScheduleTotais {
  const t = { ...ZERO };
  for (const l of linhas) {
    t.areaPlanta += l.areaPlanta;
    t.areaSuperficie += l.areaSuperficie;
    t.volumeCorte += l.volumeCorte;
    t.volumeAterro += l.volumeAterro;
  }
  t.saldo = t.volumeCorte - t.volumeAterro;
  return t;
}

/** Por que a tabela está vazia sem kernel: a mensagem do aviso do painel (`terreno-sem-kernel` ou `terreno-invalido`). */
function mensagemSemKernel(p: Project, lang: Lang): string {
  const aviso = servicoTerreno()
    .avisosDoPainel(p, lang)
    .find((a) => a.code === 'terreno-sem-kernel' || a.code === 'terreno-invalido');
  return aviso?.message ?? '';
}

const linhaDeRegiao = (t: Terrain, r: TerrainRegion, q: QuantidadesRegiaoTN | undefined): TerrenoScheduleRow => ({
  tipo: 'regiao',
  terrenoId: t.id,
  terrenoNome: t.name,
  regiaoId: r.id,
  regiaoNome: r.name,
  papel: r.papel,
  areaPlanta: q?.areaPlanta ?? 0,
  areaSuperficie: q?.areaSuperficie ?? 0,
  volumeCorte: q?.volumeCorte ?? 0,
  volumeAterro: q?.volumeAterro ?? 0,
  saldo: (q?.volumeCorte ?? 0) - (q?.volumeAterro ?? 0),
});

const linhaDeTerreno = (t: Terrain, q: QuantidadesTerreno | undefined): TerrenoScheduleRow => ({
  tipo: 'terreno',
  terrenoId: t.id,
  terrenoNome: t.name,
  regiaoId: null,
  regiaoNome: '',
  papel: null,
  areaPlanta: q?.areaPlanta ?? 0,
  areaSuperficie: q?.areaSuperficieProposta ?? 0,
  volumeCorte: q?.volumeCorte ?? 0,
  volumeAterro: q?.volumeAterro ?? 0,
  saldo: (q?.volumeCorte ?? 0) - (q?.volumeAterro ?? 0),
});

/**
 * Monta a tabela. `dados` é injetável (teste); sem ele consulta `servicoTerreno()`. Projeto sem terreno: tabela vazia e pronta, sem consultar o kernel.
 * Terreno ou região que o kernel não devolveu aparece com zeros (o aviso do kernel explica, ex.: terreno sem triângulos).
 */
export function buildTerrenoSchedule(p: Project, lang: Lang = 'pt', dados?: DadosTerrenoSchedule): TerrenoSchedule {
  const terrenos = Object.values(p.elements).filter(isTerrain).sort(porOrdem);
  if (terrenos.length === 0) return { rows: [], totais: { ...ZERO }, pronto: true, mensagem: null };
  const srv = servicoTerreno();
  const qt = dados ? dados.terrenos : srv.quantidades(p);
  const qr = dados ? dados.regioes : srv.quantidadesRegioes(p);
  if (!qt || !qr) return { rows: [], totais: { ...ZERO }, pronto: false, mensagem: mensagemSemKernel(p, lang) };
  const regioes = Object.values(p.elements).filter(isTerrainRegion).sort(porOrdem);
  const rows: TerrenoScheduleRow[] = [];
  for (const t of terrenos) {
    for (const r of regioes) if (r.terrenoId === t.id) rows.push(linhaDeRegiao(t, r, qr.find((x) => x.regiaoId === r.id)));
    rows.push(linhaDeTerreno(t, qt.find((x) => x.terrenoId === t.id)));
  }
  return { rows, totais: somarTerrenoSchedule(rows.filter((r) => r.tipo === 'terreno')), pronto: true, mensagem: null };
}

/** Textos do CSV, entregues pelo app (i18n da interface): o motor não guarda dicionário desta tabela. */
export interface RotulosCsvTerreno {
  terreno: string;
  regiao: string;
  papel: string;
  areaPlanta: string;
  areaSuperficie: string;
  volumeCorte: string;
  volumeAterro: string;
  saldo: string;
  papeis: Record<PapelRegiaoTerreno, string>;
  /** Texto da coluna "região" na linha de total do terreno. */
  totalTerreno: string;
  /** Texto da linha de rodapé com o total do projeto. */
  totalProjeto: string;
}

/**
 * CSV da tabela: separador ';', decimal do idioma (ou o do projeto), BOM UTF-8, cabeçalho com a unidade do projeto, uma linha por região e por terreno e a
 * linha final com o total do projeto. Tabela vazia gera só o cabeçalho.
 */
export function terrenoScheduleToCsv(s: TerrenoSchedule, units: ResolvedUnits, rotulos: RotulosCsvTerreno, lang: Lang = 'pt'): string {
  const a = (v: number): string => scheduleCsvCell(units, 'area', v, 2, lang);
  const vol = (v: number): string => scheduleCsvCell(units, 'volume', v, 3, lang);
  const cab = [
    rotulos.terreno,
    rotulos.regiao,
    rotulos.papel,
    scheduleCsvHeader(units, rotulos.areaPlanta, 'area'),
    scheduleCsvHeader(units, rotulos.areaSuperficie, 'area'),
    scheduleCsvHeader(units, rotulos.volumeCorte, 'volume'),
    scheduleCsvHeader(units, rotulos.volumeAterro, 'volume'),
    scheduleCsvHeader(units, rotulos.saldo, 'volume'),
  ];
  const corpo = s.rows.map((r) => [
    csvText(r.terrenoNome),
    csvText(r.tipo === 'terreno' ? rotulos.totalTerreno : r.regiaoNome),
    csvText(r.papel ? rotulos.papeis[r.papel] : ''),
    a(r.areaPlanta),
    a(r.areaSuperficie),
    vol(r.volumeCorte),
    vol(r.volumeAterro),
    vol(r.saldo),
  ]);
  const t = s.totais;
  const rodape = s.rows.length === 0 ? [] : [[csvText(rotulos.totalProjeto), '', '', a(t.areaPlanta), a(t.areaSuperficie), vol(t.volumeCorte), vol(t.volumeAterro), vol(t.saldo)]];
  return csvDocument([cab, ...corpo, ...rodape]);
}
