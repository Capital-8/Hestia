import type { MapaCorteAterroTN } from '@hestia/engine';
import type { Id } from '@hestia/model';
import type { FloorOps } from './floors.ts';

/**
 * Mapa de corte e aterro na planta (ficha U2, A.4 regra 13): os triângulos de corte em vermelho translúcido e os de aterro em azul translúcido, no
 * nível do terreno. Os triângulos vêm do kernel (`servicoTerreno().mapaCorteAterro()`): este arquivo só pinta, não calcula volume nem malha.
 *
 * O liga/desliga é do app (caixa "Mapa" da faixa): como a camada do terreno é montada por `build.ts` sem acesso ao estado da interface, o app grava
 * o valor em `definirMapaCorteAterro` (motor, terrenoSchedule.ts) e a camada o lê com `mapaCorteAterroLigado`. Desligado (o padrão), o kernel nem é
 * consultado para o mapa.
 */

export const COR_CORTE = '#d93a3a';
export const COR_ATERRO = '#2f6fd6';
/** Transparência do preenchimento do mapa (o desenho do terreno continua visível por baixo). */
export const ALFA_MAPA = 0.45;

/**
 * Preenchimentos do mapa: no máximo dois (um de corte, um de aterro), cada um com um polígono por triângulo. Só entram terrenos de `visiveis`.
 * `null` (sem kernel) ou sem triângulos: nada.
 */
export function mapaCorteAterroOps(grupos: readonly MapaCorteAterroTN[] | null | undefined, visiveis: ReadonlySet<Id>): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (!grupos) return out;
  for (const tipo of ['corte', 'aterro'] as const) {
    const polygons: Array<Array<Array<{ x: number; y: number }>>> = [];
    for (const g of grupos) {
      if (g.tipo !== tipo || !visiveis.has(g.terrenoId)) continue;
      for (let i = 0; i + 5 < g.pontos.length; i += 6) {
        const p = g.pontos;
        polygons.push([[{ x: p[i]!, y: p[i + 1]! }, { x: p[i + 2]!, y: p[i + 3]! }, { x: p[i + 4]!, y: p[i + 5]! }]]);
      }
    }
    if (polygons.length > 0) out.fills.push({ polygons, color: tipo === 'corte' ? COR_CORTE : COR_ATERRO, alpha: ALFA_MAPA });
  }
  return out;
}
