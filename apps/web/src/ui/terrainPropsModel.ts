import { multiArea } from '@hestia/geom';
import { areaDoLote, areaEdificavel, perimetroDoLote, poligonoParaRumos, type ServicoTerreno } from '@hestia/engine';
import { t, type Lang } from '../editor/i18n.ts';
import { localizacaoDe, type LadoLote, type LimitesLote, type Lot, type PapelLadoLote, type Project, type Terrain, type TerrainRegion } from '@hestia/model';

/**
 * Leituras dos painéis de propriedades do terreno, da região e do lote (ficha U1). Nada é calculado aqui: vértices são contagem das FONTES
 * (dado do modelo); área, cotas e volumes vêm de `servicoTerreno().quantidades()` e `quantidadesRegioes()`; área, perímetro, área edificável,
 * comprimentos e azimutes do lote vêm do motor (`loteGeometria`, `loteRumos`). Sem kernel as leituras do terreno são `null` (o painel mostra "—").
 */

type ServicoQuantidades = Pick<ServicoTerreno, 'quantidades' | 'quantidadesRegioes'>;

/** Vértices de UM terreno: pontos soltos, vértices de curvas, de quebras e da borda (a mesma conta do limite de 200 mil). */
export function contarVerticesTerreno(tn: Terrain): number {
  return tn.pontos.length / 3 + tn.curvas.reduce((s, c) => s + c.xy.length / 2, 0) + tn.quebras.reduce((s, q) => s + q.xyz.length / 3, 0) + (tn.borda ? tn.borda.length / 2 : 0);
}

export interface LeiturasTerreno {
  vertices: number;
  /** z do projeto (a tela mostra `cotaExibida`). Nulos quando o kernel não respondeu ou o terreno não tem superfície. */
  areaPlanta: number | null;
  zMin: number | null;
  zMax: number | null;
  volumeCorte: number | null;
  volumeAterro: number | null;
}

/** Leituras do terreno. `null` nos valores calculados enquanto o kernel não responde. */
export function leiturasDoTerreno(p: Project, tn: Terrain, serv: ServicoQuantidades): LeiturasTerreno {
  const q = serv.quantidades(p)?.find((x) => x.terrenoId === tn.id);
  return {
    vertices: contarVerticesTerreno(tn),
    areaPlanta: q?.areaPlanta ?? null,
    zMin: q?.zMin ?? null,
    zMax: q?.zMax ?? null,
    volumeCorte: q?.volumeCorte ?? null,
    volumeAterro: q?.volumeAterro ?? null,
  };
}

export interface LeiturasRegiao {
  areaPlanta: number | null;
  areaSuperficie: number | null;
  volumeCorte: number | null;
  volumeAterro: number | null;
}

/** Leituras da região (área e volumes), do kernel. */
export function leiturasDaRegiao(p: Project, r: TerrainRegion, serv: ServicoQuantidades): LeiturasRegiao {
  const q = serv.quantidadesRegioes(p)?.find((x) => x.regiaoId === r.id);
  return { areaPlanta: q?.areaPlanta ?? null, areaSuperficie: q?.areaSuperficie ?? null, volumeCorte: q?.volumeCorte ?? null, volumeAterro: q?.volumeAterro ?? null };
}

export interface LeiturasLote {
  area: number;
  perimetro: number;
  areaEdificavel: number;
}

/** Área, perímetro e área edificável (lote menos recuos) do lote. */
export function leiturasDoLote(l: Lot): LeiturasLote {
  const edif = areaEdificavel(l.contorno, l.lados);
  return { area: areaDoLote(l.contorno), perimetro: perimetroDoLote(l.contorno), areaEdificavel: edif.length === 0 ? 0 : multiArea(edif) };
}

export interface LinhaLado {
  indice: number;
  /** Comprimento do lado (m). */
  comprimento: number;
  /** Azimute em graus a partir do norte verdadeiro, [0, 360). */
  azimute: number;
  papel: PapelLadoLote;
  recuo: number;
}

/** Tabela de lados do lote: comprimento e azimute (do motor, com o norte verdadeiro do projeto) mais papel e recuo do modelo. */
export function ladosDoLote(p: Pick<Project, 'localizacao'>, l: Lot): LinhaLado[] {
  const rumos = poligonoParaRumos(l.contorno, localizacaoDe(p).norteVerdadeiro);
  return l.lados.map((lado, i) => ({ indice: i, comprimento: rumos[i]?.distancia ?? 0, azimute: rumos[i]?.azimute ?? 0, papel: lado.papel, recuo: lado.recuo }));
}

/** Lados com o papel ou o recuo do lado `i` trocados (cópia; os outros lados ficam iguais). */
export const comLadoAlterado = (lados: readonly LadoLote[], i: number, patch: Partial<LadoLote>): LadoLote[] => lados.map((x, k) => (k === i ? { ...x, ...patch } : { ...x }));

/** Fração do modelo → percentual da tela (e de volta), sem ruído de ponto flutuante. */
export const fracaoParaPercentual = (f: number): number => Math.round(f * 1e8) / 1e6;
export const percentualParaFracao = (v: number): number => v / 100;

/** Limites do lote com UM limite trocado (ou removido, com `undefined`): o `updateLot` substitui o objeto todo. */
export function comLimite(limites: LimitesLote, chave: keyof LimitesLote, valor: number | undefined): LimitesLote {
  const { [chave]: _antigo, ...resto } = limites;
  return valor === undefined ? resto : { ...resto, [chave]: valor };
}

export interface ContagemDoSitio {
  terrains: number;
  regions: number;
  lots: number;
  /** Elementos selecionados que não são terreno, região nem lote. */
  outros: number;
}

/** Rótulo do cabeçalho da paleta para terreno, região ou lote ("Terreno", "Regiões de terreno"...); null se a seleção não é só disso. */
export function rotuloDoSitio(c: ContagemDoSitio, lang: Lang): string | null {
  if (c.outros > 0) return null;
  if (c.terrains > 0 && c.regions === 0 && c.lots === 0) return t(lang, c.terrains === 1 ? 'ui_tn_sel_terreno' : 'ui_tn_sel_terrenos');
  if (c.regions > 0 && c.terrains === 0 && c.lots === 0) return t(lang, c.regions === 1 ? 'ui_tn_sel_regiao' : 'ui_tn_sel_regioes');
  if (c.lots > 0 && c.terrains === 0 && c.regions === 0) return t(lang, c.lots === 1 ? 'ui_lt_sel_lote' : 'ui_lt_sel_lotes');
  return null;
}
