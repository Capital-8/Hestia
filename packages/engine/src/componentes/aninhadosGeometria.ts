import type { Eixo } from '@hestia/model';
import { orientarAntiHorario } from './contorno.ts';
import type { PecaResolvida } from './pecas.ts';

/*
 * Geometria pura dos módulos aninhados (ficha E2-aninhados): girar uma peça já resolvida em múltiplos de 90° em torno do
 * eixo Z local e transladar no plano. Só tabelas (nada de trigonometria) para a conta ser exata; arredondamento a 1 µm.
 * O Rust espelha estas mesmas tabelas.
 */

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

type Graus = 0 | 90 | 180 | 270;

/** Reduz a rotação (já validada como múltipla de 90°) a um dos quatro casos. */
function normalizar(graus: number): Graus {
  const n = ((graus % 360) + 360) % 360;
  if (n === 90) return 90;
  if (n === 180) return 180;
  if (n === 270) return 270;
  return 0;
}

/** Rotação anti-horária no plano XY pelas tabelas exatas de 0, 90, 180 e 270 graus. */
function girarXY(x: number, y: number, graus: Graus): [number, number] {
  switch (graus) {
    case 90: return [-y, x];
    case 180: return [-x, -y];
    case 270: return [y, -x];
    default: return [x, y];
  }
}

/** O eixo da espessura troca X↔Y quando a rotação é 90 ou 270; Z não muda. */
function eixoGirado(eixo: Eixo, graus: Graus): Eixo {
  if (graus !== 90 && graus !== 270) return eixo;
  if (eixo === 'x') return 'y';
  if (eixo === 'y') return 'x';
  return 'z';
}

/** As duas medidas no plano da chapa (m), derivadas da extensão e do eixo da espessura. */
function tamanhoDe(eixo: Eixo, extensao: readonly [number, number, number]): [number, number] {
  if (eixo === 'x') return [extensao[1], extensao[2]];
  if (eixo === 'y') return [extensao[0], extensao[2]];
  return [extensao[0], extensao[1]];
}

/** Ponto do plano da chapa (u, v) para o mundo da família (m). */
function paraMundo(eixo: Eixo, origem: readonly [number, number, number], u: number, v: number): [number, number, number] {
  if (eixo === 'x') return [origem[0], origem[1] + u, origem[2] + v];
  if (eixo === 'y') return [origem[0] + u, origem[1], origem[2] + v];
  return [origem[0] + u, origem[1] + v, origem[2]];
}

/** Ponto do mundo (x, y, z) para o plano da chapa (u, v), relativo ao canto mínimo da peça. */
function doMundo(eixo: Eixo, origem: readonly [number, number, number], x: number, y: number, z: number): [number, number] {
  if (eixo === 'x') return [y - origem[1], z - origem[2]];
  if (eixo === 'y') return [x - origem[0], z - origem[2]];
  return [x - origem[0], y - origem[1]];
}

/** Caixa girada: canto mínimo e extensões em X e Y, antes da translação. */
function caixaGirada(origem: readonly [number, number, number], extensao: readonly [number, number, number], graus: Graus): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const ex of [0, extensao[0]]) {
    for (const ey of [0, extensao[1]]) {
      const [rx, ry] = girarXY(origem[0] + ex, origem[1] + ey, graus);
      xs.push(rx);
      ys.push(ry);
    }
  }
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}

/**
 * Peça girada: rotação anti-horária `graus` em torno de Z passando pela origem local, depois translação `dx`, `dy` (m).
 * Devolve peça nova; `origem` fica no canto mínimo da caixa girada e o contorno é refeito no plano do novo eixo.
 */
export function girarPeca(p: PecaResolvida, graus: number, dx: number, dy: number): PecaResolvida {
  const g = normalizar(graus);
  const [minX, maxX, minY, maxY] = caixaGirada(p.origem, p.extensao, g);
  const origem: [number, number, number] = [round6(minX + dx), round6(minY + dy), p.origem[2]];
  const extensao: [number, number, number] = [round6(maxX - minX), round6(maxY - minY), p.extensao[2]];
  const eixo = eixoGirado(p.eixo, g);
  const tamanho = tamanhoDe(eixo, extensao);
  let contorno: number[] | null = null;
  if (p.contorno !== null) {
    const pts: number[] = [];
    for (let i = 0; i < p.contorno.length; i += 2) {
      const [wx, wy, wz] = paraMundo(p.eixo, p.origem, p.contorno[i]!, p.contorno[i + 1]!);
      const [rx, ry] = girarXY(wx, wy, g);
      const [u, v] = doMundo(eixo, origem, rx + dx, ry + dy, wz);
      pts.push(round6(u), round6(v));
    }
    contorno = orientarAntiHorario(pts);
  }
  return { ...p, eixo, origem, tamanho, extensao, contorno };
}
