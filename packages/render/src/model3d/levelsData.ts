import { unitsOf, type Id, type Project } from '@hestia/model';
import { levelBox } from '../plan/build.ts';

/**
 * Dados do datum de nível para o 3D (fase 6): a linha tracejada, a bolha e o plano azul de seleção. Tudo em coordenadas de
 * mundo (m), com `z` na elevação do nível. A caixa é a do PROJETO (união das caixas dos níveis + margem), então as linhas
 * de todos os níveis ficam alinhadas e sempre cobrem a obra.
 */

/** Retângulo em planta (m). */
export interface LevelBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Ponto 3D do datum. */
export interface LevelPoint3 {
  x: number;
  y: number;
  z: number;
}

/** Um nível no 3D: linha, bolha, texto e o plano de seleção. */
export interface LevelDatum {
  levelId: Id;
  name: string;
  /** Elevação absoluta (m). */
  elevation: number;
  /** Texto da cabeça: `Térreo +0,00`. */
  text: string;
  /** Δ para o nível imediatamente abaixo (m); ausente = é o mais baixo. */
  deltaBelow?: number;
  /** Δ para o nível imediatamente acima (m); ausente = é o mais alto. */
  deltaAbove?: number;
  /** Linha de datum, em `z = elevation`. */
  line: { a: LevelPoint3; b: LevelPoint3 };
  /** Centro da bolha, logo depois do fim da linha. */
  headAt: LevelPoint3;
  /** Ponto onde encosta a borda DIREITA do texto (à esquerda da bolha), em `z = elevation`. */
  textAt: LevelPoint3;
  /** Plano do nível (usado só na seleção), em `z = elevation`. */
  plane: LevelBox & { z: number };
}

/** Margem curta (m) da caixa da obra: só o plano azul de seleção do nível usa. */
export const LEVEL_MARGIN = 1;

/** Afastamento (m) das linhas-guia do datum (esquerda e de fundo), da bolha e do texto em relação à caixa da obra. */
export const LEVEL_LINE_OFFSET = 6;

/** Folga entre o fim da linha e o centro da bolha (m); a bolha tem 0,6 m de raio. */
export const LEVEL_HEAD_GAP = 0.9;
export const LEVEL_HEAD_RADIUS = 0.6;

/** Cota com sinal e duas casas, no separador do projeto (`+0,00`, `-1,20`). */
export function levelElevationLabel(elevation: number, decimalSymbol: ',' | '.' = ','): string {
  const abs = Math.abs(elevation);
  // units-ok: rótulo de cota do nível no 3D (m)
  const casas = decimalSymbol === ',' ? abs.toFixed(2).replace('.', ',') : abs.toFixed(2);
  return `${elevation < 0 ? '-' : '+'}${casas}`;
}

/** Caixa do projeto: união das caixas dos níveis, com margem; projeto sem paredes = 0..10 m. */
export function levelProjectBox(p: Project, margin = LEVEL_MARGIN): LevelBox {
  const boxes = p.levels.map((l) => levelBox(p, l.id)).filter((b): b is NonNullable<typeof b> => b !== null);
  if (boxes.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return {
    minX: Math.min(...boxes.map((b) => b.minX)) - margin,
    minY: Math.min(...boxes.map((b) => b.minY)) - margin,
    maxX: Math.max(...boxes.map((b) => b.maxX)) + margin,
    maxY: Math.max(...boxes.map((b) => b.maxY)) + margin,
  };
}

/**
 * Datum de cada nível, do mais baixo ao mais alto. Os Δ abaixo/acima saem da ordem das elevações (empate: id). A linha
 * fica na borda sul da caixa do projeto afastada em `LEVEL_LINE_OFFSET`; a bolha depois do fim e o texto encostado à
 * esquerda dela. O plano de seleção usa a caixa com a margem curta (`LEVEL_MARGIN`).
 */
export function levelDataOf(p: Project, offset = LEVEL_LINE_OFFSET): LevelDatum[] {
  const box = levelProjectBox(p, offset);
  const caixaPlano = levelProjectBox(p, LEVEL_MARGIN);
  const ordered = [...p.levels].sort((a, b) => a.elevation - b.elevation || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ordered.map((l, i) => {
    const z = l.elevation;
    const below = ordered[i - 1];
    const above = ordered[i + 1];
    return {
      levelId: l.id,
      name: l.name,
      elevation: l.elevation,
      text: `${l.name} ${levelElevationLabel(l.elevation, unitsOf(p).decimalSymbol)}`,
      ...(below === undefined ? {} : { deltaBelow: l.elevation - below.elevation }),
      ...(above === undefined ? {} : { deltaAbove: above.elevation - l.elevation }),
      line: { a: { x: box.minX, y: box.minY, z }, b: { x: box.maxX, y: box.minY, z } },
      headAt: { x: box.maxX + LEVEL_HEAD_GAP, y: box.minY, z },
      // O texto fica à direita da bolha, na mesma direção da linha, fora da silhueta da obra.
      textAt: { x: box.maxX + LEVEL_HEAD_GAP + LEVEL_HEAD_RADIUS + 0.3, y: box.minY, z },
      plane: { ...caixaPlano, z },
    };
  });
}
