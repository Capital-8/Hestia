import type { CorpoResolvido, Malha } from '@hestia/engine';
import { COR_PADRAO, COR_VAZIO, corDoTexto, type NivelDetalhe3d } from './logica.ts';

/*
 * Apoio puro do render 3D dos corpos (ficha B2, CONTRATO §2.3 e §7). Sem WebGL: testável em Node. Unidades: metros.
 * Os corpos chegam em coordenadas da família (`malhaDosCorpos`, de `@hestia/engine`); a instância no projeto leva
 * `matrizDoComponente` (16 números em ordem de coluna) e a elevação do nível.
 */

/**
 * Um corpo aparece no 3D? `vistas` ausente = todas; com `vistas`, precisa conter `3d`. Corpo vazio é sempre visível (fantasma,
 * como a peça vazia). `detalhe3d` ausente = aparece em todos os níveis; com ele, só nos níveis listados.
 */
export function corpoVisivel3d(c: CorpoResolvido, detalhe: NivelDetalhe3d): boolean {
  if (c.vistas !== null && !c.vistas.includes('3d')) return false;
  if (c.vazio) return true;
  if (c.detalhe3d === null) return true;
  return c.detalhe3d.includes(detalhe);
}

/** Cor (0xRRGGBB) do corpo: vazio → azul do fantasma; `materiais[corpo.material]` quando for "#rrggbb"; senão a cor padrão. */
export function corDoCorpo(c: CorpoResolvido, materiais: Readonly<Record<string, string>> = {}): number {
  if (c.vazio) return COR_VAZIO;
  if (c.material !== null) {
    const texto = materiais[c.material];
    if (texto !== undefined) {
      const cor = corDoTexto(texto);
      if (cor !== null) return cor;
    }
  }
  return COR_PADRAO;
}

/** Determinante da parte 3×3 de uma matriz em ordem de coluna: negativo quando a transformação espelha (inverte a orientação). */
function determinante3(m: readonly number[]): number {
  const g = (i: number): number => m[i] ?? 0;
  return g(0) * (g(5) * g(10) - g(9) * g(6)) + g(4) * (g(9) * g(2) - g(1) * g(10)) + g(8) * (g(1) * g(6) - g(5) * g(2));
}

/**
 * Leva uma malha local (metros) ao mundo: posições por `matriz` (16 números em ordem de coluna, translação em 12..14) mais `elevacao`
 * (m) em Z; normais pela parte 3×3 (a transformação é ortogonal, então a normal gira igual). Quando `matriz` espelha (det < 0), troca
 * dois índices de cada triângulo para as normais continuarem para fora. `pecaDoTriangulo` é copiado sem mudança. Não altera a entrada.
 */
export function malhaDoCorpoNoMundo(local: Malha, matriz: readonly number[], elevacao: number): Malha {
  const g = (i: number): number => matriz[i] ?? 0;
  const positions = new Array<number>(local.positions.length);
  for (let i = 0; i < local.positions.length; i += 3) {
    const x = local.positions[i]!;
    const y = local.positions[i + 1]!;
    const z = local.positions[i + 2]!;
    positions[i] = g(0) * x + g(4) * y + g(8) * z + g(12);
    positions[i + 1] = g(1) * x + g(5) * y + g(9) * z + g(13);
    positions[i + 2] = g(2) * x + g(6) * y + g(10) * z + g(14) + elevacao;
  }
  const normals = new Array<number>(local.normals.length);
  for (let i = 0; i < local.normals.length; i += 3) {
    const x = local.normals[i]!;
    const y = local.normals[i + 1]!;
    const z = local.normals[i + 2]!;
    normals[i] = g(0) * x + g(4) * y + g(8) * z;
    normals[i + 1] = g(1) * x + g(5) * y + g(9) * z;
    normals[i + 2] = g(2) * x + g(6) * y + g(10) * z;
  }
  const indices = local.indices.slice();
  if (determinante3(matriz) < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const troca = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = troca;
    }
  }
  return { positions, normals, indices, pecaDoTriangulo: local.pecaDoTriangulo.slice() };
}

/** Esfera de enquadramento (centro e raio, m) da caixa envolvente das malhas; `null` sem vértices. */
export function esferaDaMalhaDosCorpos(malhas: readonly Malha[]): { centro: [number, number, number]; raio: number } | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of malhas) {
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = m.positions[i + k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
  }
  if (!Number.isFinite(min[0]!) || !Number.isFinite(max[0]!)) return null;
  const centro: [number, number, number] = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
  const meia = Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2;
  return { centro, raio: Math.max(meia, 1e-3) };
}
