import { union, type MultiPolygon, type Ring } from '@hestia/geom';
import type { CorpoResolvido } from './corposTipos.ts';
import { malhaDosCorpos } from './corposMalha.ts';
import type { DetalhePlanta } from './projecaoPlanta.ts';

/*
 * Silhueta dos corpos na planta (ficha B3, CONTRATO §4). MÉTODO: cada triângulo da malha é projetado em XY e os triângulos
 * são unidos com a união de polígonos de `@hestia/geom` (redução em árvore, para o custo ficar em ~n·log n). Triângulos de
 * área nula na projeção (paredes verticais) são descartados; os que se repetem (tampa de cima e de baixo) entram uma vez só.
 * O resultado são só os contornos EXTERNOS (furos da união são ignorados: a silhueta é uma pegada cheia). Coordenadas em m,
 * no sistema da família. Nunca lança: malha com erro ou sem triângulos devolve `[]`.
 */

const RANGO: Record<'grosso' | 'medio' | 'fino', number> = { grosso: 0, medio: 1, fino: 2 };
const RANGO_PLANTA: Record<DetalhePlanta, number> = { coarse: 0, medium: 1, fine: 2 };
/** Grade de arredondamento (m) que estabiliza a união de triângulos que se tocam. */
const GRADE = 1e-7;
const AREA_MINIMA = 1e-12;

/** O corpo desenha na planta neste nível de detalhe? Vazio e `vistas` sem `planta` nunca; `detalhe3d` vale o menor nível listado. */
export function corpoNaPlanta(corpo: CorpoResolvido, detalhe: DetalhePlanta): boolean {
  if (corpo.vazio || detalhe === 'coarse') return false;
  if (corpo.vistas !== null && !corpo.vistas.includes('planta')) return false;
  if (corpo.detalhe3d !== null && corpo.detalhe3d.length > 0) {
    return Math.min(...corpo.detalhe3d.map((n) => RANGO[n])) <= RANGO_PLANTA[detalhe];
  }
  return true;
}

const arredonda = (v: number): number => Math.round(v / GRADE) * GRADE;

function triangulosProjetados(positions: number[], indices: number[]): Ring[] {
  const vistos = new Set<string>();
  const saida: Ring[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const pt = (k: number): { x: number; y: number } => {
      const i = (indices[t + k] ?? 0) * 3;
      return { x: arredonda(positions[i] ?? 0), y: arredonda(positions[i + 1] ?? 0) };
    };
    const a = pt(0);
    const b = pt(1);
    const c = pt(2);
    const area = ((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    if (Math.abs(area) < AREA_MINIMA) continue;
    const anel: Ring = area > 0 ? [a, b, c] : [a, c, b];
    const chave = anel
      .map((v) => `${Math.round(v.x / GRADE)},${Math.round(v.y / GRADE)}`)
      .sort()
      .join('|');
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(anel);
  }
  return saida;
}

function uniaoEmArvore(partes: MultiPolygon[]): MultiPolygon {
  let nivel = partes;
  while (nivel.length > 1) {
    const prox: MultiPolygon[] = [];
    for (let i = 0; i < nivel.length; i += 2) {
      const a = nivel[i] ?? [];
      const b = nivel[i + 1];
      prox.push(b === undefined ? a : union(a, b));
    }
    nivel = prox;
  }
  return nivel[0] ?? [];
}

/**
 * Silhueta dos corpos na planta: um polígono por contorno externo, como pares x,y planos (m, anti-horário), no sistema da
 * família. `coarse` devolve `[]` (só a pegada, como hoje). Corpos vazios, fora de `vistas: planta` ou fora do `detalhe3d` não contam.
 */
export function projetarCorposPlanta(corpos: CorpoResolvido[], detalhe: DetalhePlanta): number[][] {
  const visiveis = corpos.filter((c) => corpoNaPlanta(c, detalhe));
  if (visiveis.length === 0) return [];
  const { solidas } = malhaDosCorpos(visiveis);
  const triangulos = triangulosProjetados(solidas.positions, solidas.indices);
  if (triangulos.length === 0) return [];
  const uniao = uniaoEmArvore(triangulos.map((t): MultiPolygon => [[t]]));
  const saida: number[][] = [];
  for (const poligono of uniao) {
    const externo = poligono[0];
    if (externo === undefined || externo.length < 3) continue;
    saida.push(externo.flatMap((v) => [v.x, v.y]));
  }
  return saida;
}
