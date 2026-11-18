import { envoltoriaDasFontes, type CotaDoTerreno, type CurvaNivelTN, type LinhaPlantaTN, type MapaCorteAterroTN } from '@hestia/engine';
import { terrainTextFamilyFor, terrenoComTipo, tipoDoTerreno, type Id, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import { mix } from './color.ts';
import type { FloorOps } from './floors.ts';
import { tracoEm } from './marcadores.ts';
import { rotulosAutomaticosDeCurva, rotulosDeCurva, rotuloDeCota, type OcupadoRotulo } from './terrenoRotulos.ts';
import { espessuraDeCorte, espessuraDeProjecao, type PlanPaint } from './style.ts';
import type { PlanTheme, StrokeOp } from './types.ts';

/**
 * Terreno em planta (ficha V2). O terreno só aparece na planta do nível dele (`levelId`). As curvas de nível, a borda e as cotas vêm do kernel
 * (`servicoTerreno()`, via `DadosTerreno`): nenhum caminho TS gera curva, malha ou perfil. O que o TS desenha por conta própria são as FONTES do
 * modelo (contorno das regiões, pontos cotados) e a reserva sem kernel (borda do modelo, ou a envoltória das fontes, tracejada).
 *
 * Seleção: só pela borda ou por uma curva (clique ou caixa); o interior NÃO seleciona (A.8 item 7). A região seleciona pelo contorno.
 */

/** Dados do kernel de que o desenho precisa; `null` = kernel indisponível (então só a reserva é desenhada). */
export interface DadosTerreno {
  /** Curvas da superfície proposta. */
  propostas: CurvaNivelTN[] | null;
  /** Curvas da superfície existente (só lidas se algum terreno tem `mostrarExistente`). */
  existentes: CurvaNivelTN[] | null;
  bordas: LinhaPlantaTN[] | null;
  /** Cota proposta em cada ponto, na ordem recebida. */
  cotas: (pontos: Array<{ x: number; y: number }>) => Array<CotaDoTerreno | null> | null;
  /** Triângulos do mapa de corte e aterro (ficha U2); só lidos com o mapa ligado. Ausente ou `null` = sem mapa. */
  mapa?: MapaCorteAterroTN[] | null;
}

/** [traço, vão] da curva do terreno existente e da reserva sem kernel (px). */
export const EXISTENTE_TRACO: [number, number] = [6, 4];
export const RESERVA_TRACO: [number, number] = [10, 5];
/** Fator do peso da curva mestra sobre o da normal ("um peso acima"). */
export const FATOR_MESTRA = 1.6;
/** Meio comprimento do braço da cruz do ponto cotado (px). */
export const CRUZ_PX = 4;
/** Transparência do preenchimento da região. */
export const ALFA_REGIAO = 0.28;

type Pt = { x: number; y: number };

/** Terrenos do nível, na ordem de criação, menos os ocultos. */
export function terrenosDoNivel(p: Project, levelId: Id, hidden?: ReadonlySet<Id>): Terrain[] {
  const out: Terrain[] = [];
  for (const e of Object.values(p.elements)) if (e.kind === 'terrain' && e.levelId === levelId && !hidden?.has(e.id)) out.push(e);
  return out.sort((a, b) => a.order - b.order);
}

/** Regiões do nível, na ordem de criação, menos as ocultas. */
export function regioesDoNivel(p: Project, levelId: Id, hidden?: ReadonlySet<Id>): TerrainRegion[] {
  const out: TerrainRegion[] = [];
  for (const e of Object.values(p.elements)) if (e.kind === 'terrainRegion' && e.levelId === levelId && !hidden?.has(e.id)) out.push(e);
  return out.sort((a, b) => a.order - b.order);
}

/** Espessura de projeção com o fator da mestra (um peso acima). */
export function espessuraMestra(paint: PlanPaint): Pick<StrokeOp, 'widthPx' | 'papel'> {
  const e = espessuraDeProjecao(paint);
  const out: Pick<StrokeOp, 'widthPx' | 'papel'> = { widthPx: e.widthPx * FATOR_MESTRA };
  if (e.papel) out.papel = { ...e.papel, fator: (e.papel.fator ?? 1) * FATOR_MESTRA };
  return out;
}

/** Espessura de projeção multiplicada por um fator (peso de curva do tipo de terreno). */
function pesoVezes(e: Pick<StrokeOp, 'widthPx' | 'papel'>, fator: number): Pick<StrokeOp, 'widthPx' | 'papel'> {
  const out: Pick<StrokeOp, 'widthPx' | 'papel'> = { widthPx: e.widthPx * fator };
  if (e.papel) out.papel = { ...e.papel, fator: (e.papel.fator ?? 1) * fator };
  return out;
}

const par = (q: Pt): Pt => ({ x: q.x, y: q.y });

/** Borda de reserva (sem kernel): a borda do modelo, ou a envoltória convexa das fontes. */
export function bordaDeReserva(t: Terrain): Pt[] {
  if (t.borda && t.borda.length >= 6) {
    const out: Pt[] = [];
    for (let i = 0; i + 1 < t.borda.length; i += 2) out.push({ x: t.borda[i]!, y: t.borda[i + 1]! });
    return out;
  }
  return envoltoriaDasFontes(t);
}

/** Cor de uma região: material, depois a própria, depois uma por papel. */
function corDaRegiao(p: Project, r: TerrainRegion): string {
  const m = r.materialId ? p.materials[r.materialId] : undefined;
  return m?.color ?? r.color ?? (r.papel === 'subdivisao' ? '#9bb08a' : r.papel === 'plataforma' ? '#b0a58f' : '#c4a77d');
}

/** Contorno das regiões (do modelo) com preenchimento translúcido. */
export function regiaoOps(p: Project, r: TerrainRegion, dark: boolean, paint: PlanPaint): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (r.contorno.length < 3) return out;
  const cor = paint.color ?? corDaRegiao(p, r);
  const pts = r.contorno.map(par);
  out.fills.push({ polygons: [[pts]], color: cor, alpha: ALFA_REGIAO });
  out.strokes.push({ pts, closed: true, ...espessuraDeProjecao(paint), color: mix(cor, dark ? '#ffffff' : '#000000', 0.35), alpha: 1 });
  return out;
}

/** Desenho de um terreno: curvas (proposta, existente), borda, pontos cotados e rótulos; reserva tracejada sem kernel. */
export function terrenoOps(p: Project, bruto: Terrain, dados: DadosTerreno, theme: PlanTheme, dark: boolean, paint: PlanPaint, scale: number): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  const base = dark ? theme.bg : '#ffffff';
  // Com tipo: a equidistância, a família do rótulo e o peso/cor das curvas vêm dele; as curvas não herdam o verde da superfície.
  const tipo = tipoDoTerreno(p.settings, bruto);
  const t = terrenoComTipo(p.settings, bruto);
  const corPadrao = mix('#8a6a3a', dark ? '#ffffff' : '#000000', 0.1);
  const cor = paint.color ?? (tipo ? (tipo.curvaCor ?? corPadrao) : (t.color ?? corPadrao));
  const suave = mix(cor, base, 0.45);
  const projBase = espessuraDeProjecao(paint);
  const proj = tipo ? pesoVezes(projBase, tipo.curvaPeso) : projBase;
  const mestra = tipo ? pesoVezes(projBase, tipo.mestraPeso) : espessuraMestra(paint);
  const doTerreno = (l: CurvaNivelTN[] | null): CurvaNivelTN[] => (l ?? []).filter((c) => c.terrenoId === t.id && c.pontos.length >= 2);
  const proposta = doTerreno(dados.propostas);
  if (t.mostrarExistente) {
    for (const c of doTerreno(dados.existentes)) out.strokes.push({ pts: c.pontos.map(par), closed: c.fechada, ...proj, color: suave, alpha: 1, dash: EXISTENTE_TRACO });
  }
  for (const c of proposta) out.strokes.push({ pts: c.pontos.map(par), closed: c.fechada, ...(c.mestra ? mestra : proj), color: cor, alpha: 1 });
  // Borda: do kernel; sem ele, a reserva tracejada (borda do modelo ou envoltória das fontes).
  const linhas = dados.bordas?.filter((b) => b.terrenoId === t.id && b.pontos.length >= 2);
  if (linhas) {
    for (const b of linhas) out.strokes.push({ pts: b.pontos.map(par), closed: b.fechada, ...espessuraDeCorte(paint), color: cor, alpha: 1 });
  } else {
    const r = bordaDeReserva(t);
    if (r.length >= 3) out.strokes.push({ pts: r, closed: true, ...projBase, color: cor, alpha: 1, dash: RESERVA_TRACO });
  }
  const mestras = proposta.filter((c) => c.mestra);
  const ocupados: OcupadoRotulo[] = [];
  out.labels.push(...rotulosDeCurva(p, t, mestras, scale, ocupados));
  if (tipo?.rotularCurvas) out.labels.push(...rotulosAutomaticosDeCurva(p, t, mestras, scale, tipo.rotularCada, ocupados));
  // Pontos cotados: cruz (em px) e o valor da cota do terreno proposto; sem kernel, só a cruz.
  const alvos: Pt[] = [];
  for (let i = 0; i + 1 < t.pontosCotados.length; i += 2) alvos.push({ x: t.pontosCotados[i]!, y: t.pontosCotados[i + 1]! });
  const cotas = alvos.length > 0 ? dados.cotas(alvos) : null;
  alvos.forEach((q, i) => {
    const h = CRUZ_PX;
    out.strokes.push({ ...tracoEm(q, [{ x: -h, y: 0 }, { x: h, y: 0 }], false), ...projBase, color: cor, alpha: 1 });
    out.strokes.push({ ...tracoEm(q, [{ x: 0, y: -h }, { x: 0, y: h }], false), ...projBase, color: cor, alpha: 1 });
    const c = cotas?.[i];
    if (c) out.labels.push(rotuloDeCota(p, q, c.z, scale, terrainTextFamilyFor(p.settings, 'spot', t.cotadoFamilyId)));
  });
  return out;
}

/** Realce do terreno (borda ou curvas pelas linhas da camada) e da região (contorno): sem preenchimento, o interior não é alvo. */
export function terrenoSelectionOps(p: Project, levelId: Id, selection: readonly Id[], hover: Id | null, theme: PlanTheme, dados: DadosTerreno | null, hidden?: ReadonlySet<Id>): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  const estilo = (sel: boolean): Pick<StrokeOp, 'widthPx' | 'color' | 'alpha'> => ({ widthPx: sel ? 2.5 : 2, color: sel ? theme.select : theme.selectHover, alpha: sel ? 1 : 0.8 });
  for (const t of terrenosDoNivel(p, levelId, hidden)) {
    const sel = selection.includes(t.id);
    if (!sel && t.id !== hover) continue;
    const linhas = dados?.bordas?.filter((b) => b.terrenoId === t.id && b.pontos.length >= 2);
    if (linhas) for (const b of linhas) out.strokes.push({ pts: b.pontos.map(par), closed: b.fechada, ...estilo(sel) });
    else {
      const r = bordaDeReserva(t);
      if (r.length >= 3) out.strokes.push({ pts: r, closed: true, ...estilo(sel) });
    }
  }
  for (const r of regioesDoNivel(p, levelId, hidden)) {
    const sel = selection.includes(r.id);
    if (!sel && r.id !== hover) continue;
    out.strokes.push({ pts: r.contorno.map(par), closed: true, ...estilo(sel) });
  }
  return out;
}
