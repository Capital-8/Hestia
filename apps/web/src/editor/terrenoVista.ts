import type { LinhaCorteTN, ServicoTerreno } from '@hestia/engine';
import { cotaExibida, formatQuantity, isTerrain, isTerrainRegion, type Id, type Project, type ResolvedUnits, type ValidationIssue } from '@hestia/model';
import type { Lang } from './i18n/tipos.ts';
import type { IssueTarget } from './issuesView.ts';

/**
 * Funções puras que ligam o terreno à vista (ficha U1b): repintar quando o kernel carrega, alvo do "Ir para" dos avisos, enquadramento vertical do corte
 * e a sonda da barra de status. Nenhuma gera malha, curva de nível ou perfil: tudo isso vem de `servicoTerreno()`; aqui só se decide quando e o que mostrar.
 */

// ---- 1. repintar quando o kernel carrega ---------------------------------------------------------------------------------------

/** O que a vista refaz quando o kernel do terreno fica pronto (ou é trocado): o mesmo da cortina e do guarda-corpo. */
export interface AcoesDeRepintura {
  /** Zera a chave do modelo 3D para a montagem recomeçar. */
  zerarChaveDoModelo: () => void;
  /** Descarta a geometria da planta guardada. */
  reiniciarPlanta: () => void;
  /** Invalida o quadro da planta (camadas). */
  invalidarQuadro: () => void;
  /** Pede um novo desenho (incrementa `previewTick`). */
  pedirDesenho: () => void;
}

/**
 * Liga a repintura ao `aoMudarPronto` do serviço do terreno. Sem isso, o 3D e a planta abertos antes de o kernel carregar ficam só com a borda de
 * reserva. Devolve a função que desliga a escuta.
 */
export function ligarRepinturaDoTerreno(servico: Pick<ServicoTerreno, 'aoMudarPronto'>, acoes: AcoesDeRepintura): () => void {
  return servico.aoMudarPronto(() => {
    acoes.zerarChaveDoModelo();
    acoes.reiniciarPlanta();
    acoes.invalidarQuadro();
    acoes.pedirDesenho();
  });
}

// ---- 2. "Ir para" dos avisos do terreno ----------------------------------------------------------------------------------------

type Caixa = { minX: number; minY: number; maxX: number; maxY: number };

function juntar(caixa: Caixa | null, x: number, y: number): Caixa {
  return caixa ? { minX: Math.min(caixa.minX, x), minY: Math.min(caixa.minY, y), maxX: Math.max(caixa.maxX, x), maxY: Math.max(caixa.maxY, y) } : { minX: x, minY: y, maxX: x, maxY: y };
}

/**
 * Caixa do terreno em planta: a borda do modelo, se houver, senão a de todas as fontes (pontos, curvas e quebras). É dado do modelo, não geometria
 * derivada. Null sem nenhuma fonte.
 */
export function caixaDoTerreno(t: { pontos: readonly number[]; curvas: ReadonlyArray<{ xy: readonly number[] }>; quebras: ReadonlyArray<{ xyz: readonly number[] }>; borda?: readonly number[] }): Caixa | null {
  let c: Caixa | null = null;
  if (t.borda && t.borda.length >= 6) {
    for (let i = 0; i + 1 < t.borda.length; i += 2) c = juntar(c, t.borda[i]!, t.borda[i + 1]!);
    return c;
  }
  for (let i = 0; i + 2 < t.pontos.length; i += 3) c = juntar(c, t.pontos[i]!, t.pontos[i + 1]!);
  for (const q of t.curvas) for (let i = 0; i + 1 < q.xy.length; i += 2) c = juntar(c, q.xy[i]!, q.xy[i + 1]!);
  for (const q of t.quebras) for (let i = 0; i + 2 < q.xyz.length; i += 3) c = juntar(c, q.xyz[i]!, q.xyz[i + 1]!);
  return c;
}

/**
 * Alvo do "Ir para" de um aviso cujo elemento é um terreno ou uma região: o nível dele e a caixa que enquadra o terreno (ou o contorno da região). Null
 * para qualquer outro elemento (quem chama segue o caminho comum) e para elemento ausente.
 */
export function alvoDoAvisoDeTerreno(p: Project, issue: Pick<ValidationIssue, 'elementId'>): IssueTarget | null {
  const id = issue.elementId;
  const e = id ? p.elements[id] : undefined;
  if (!id || !e) return null;
  const nivel = (levelId: Id): Id | null => (p.levels.some((l) => l.id === levelId) ? levelId : null);
  if (isTerrain(e)) {
    const box = caixaDoTerreno(e);
    return { elementId: id, levelId: nivel(e.levelId), center: box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : null, ...(box ? { box } : {}) };
  }
  if (isTerrainRegion(e)) {
    let box: Caixa | null = null;
    for (const q of e.contorno) box = juntar(box, q.x, q.y);
    return { elementId: id, levelId: nivel(e.levelId), center: box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : null, ...(box ? { box } : {}) };
  }
  return null;
}

// ---- 3. enquadramento vertical do corte ----------------------------------------------------------------------------------------

/** Quanto sobra acima e abaixo do terreno no enquadramento (m), como a folga de `sectionBox`. */
const FOLGA_Z = 0.5;

/**
 * Amplia a caixa do corte na vertical para incluir a faixa de cota do terreno visível (as linhas vêm de `linhasDoTerrenoNoCorte`). Em projeto só de
 * terreno (ex.: T5 em z 8 a 10) o enquadramento padrão (0 a 3 m do edifício) deixaria o terreno fora da tela. Sem linhas, a caixa volta igual. A faixa
 * horizontal não muda.
 */
export function caixaDoCorteComTerreno(caixa: Caixa, linhas: readonly Pick<LinhaCorteTN, 'pontos'>[]): Caixa {
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const l of linhas) {
    for (const q of l.pontos) {
      if (!Number.isFinite(q.z)) continue;
      zMin = Math.min(zMin, q.z);
      zMax = Math.max(zMax, q.z);
    }
  }
  if (zMin > zMax) return caixa;
  return { ...caixa, minY: Math.min(caixa.minY, zMin - FOLGA_Z), maxY: Math.max(caixa.maxY, zMax + FOLGA_Z) };
}

// ---- 4. cota do terreno na barra de status -------------------------------------------------------------------------------------

/** Intervalo mínimo entre duas consultas ao kernel (ms). */
export const SONDA_INTERVALO_MS = 80;
/** Distância mínima do cursor, em pixels de tela, para repetir a consulta. */
export const SONDA_DISTANCIA_PX = 3;

export interface UltimaSonda {
  x: number;
  y: number;
  /** Instante da consulta (ms). */
  t: number;
  /** Identifica o que a resposta depende (projeto, nível, kernel pronto): chave diferente refaz a consulta. */
  chave: string;
  /** z do terreno proposto (z do projeto), ou null fora de todo terreno. */
  z: number | null;
}

/**
 * Precisa consultar o kernel de novo? Sim sem consulta anterior ou com outra chave; senão só se o cursor andou mais que `SONDA_DISTANCIA_PX` E já
 * passou o intervalo. Isso limita a uma consulta por intervalo, não uma por pixel.
 */
export function precisaConsultar(ant: UltimaSonda | null, ponto: { x: number; y: number }, agora: number, mpp: number, chave: string): boolean {
  if (!ant || ant.chave !== chave) return true;
  if (agora - ant.t < SONDA_INTERVALO_MS) return false;
  return Math.hypot(ponto.x - ant.x, ponto.y - ant.y) > SONDA_DISTANCIA_PX * mpp;
}

/** Sonda memorizada: uma consulta por vez, reaproveitada enquanto `precisaConsultar` disser que não. */
export function criarSondaDoTerreno(consultar: (ponto: { x: number; y: number }) => number | null): {
  ler: (ponto: { x: number; y: number }, agora: number, mpp: number, chave: string) => number | null;
  ultima: () => UltimaSonda | null;
} {
  let ultima: UltimaSonda | null = null;
  return {
    ler(ponto, agora, mpp, chave) {
      if (precisaConsultar(ultima, ponto, agora, mpp, chave)) ultima = { x: ponto.x, y: ponto.y, t: agora, chave, z: consultar(ponto) };
      return ultima!.z;
    },
    ultima: () => ultima,
  };
}

/** Texto da cota na barra de status: a cota exibida (z do projeto mais a cota zero da localização) pela unidade do projeto. */
export function textoDaCotaDoTerreno(p: Project, units: ResolvedUnits, z: number, lang: Lang): string {
  return formatQuantity(units, 'length', cotaExibida(p, z), { lang });
}
