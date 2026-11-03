import { adicionarPeca } from './malhaGeometria.ts';
import type { PecaResolvida } from './pecas.ts';

/*
 * Malha triangular das peças resolvidas (fatia C do Rust, ADR 0049 §5.2). FICHA E3-malha: implementar `malhaDasPecas`.
 * Testes em `malha.test.ts`. Pura e numérica: entra `PecaResolvida[]`, saem arrays planos (metros). Esta é a geometria pesada
 * que o Rust vai espelhar: sem dependências além de `@hestia/geom` (`triangulate`, para as tampas de contornos poligonais).
 */

export interface Malha {
  /** x,y,z por vértice (m). Sombreamento chapado: cada face tem os seus vértices (não há compartilhamento entre faces). */
  positions: number[];
  /** nx,ny,nz por vértice (unitária, igual para os vértices da mesma face). */
  normals: number[];
  /** Triângulos (3 índices cada), com a face de fora voltada para a normal (sentido anti-horário visto de fora). */
  indices: number[];
  /** Para cada TRIÂNGULO, o índice da peça (em `pecas` de entrada) a que pertence. */
  pecaDoTriangulo: number[];
}

export interface MalhasDasPecas {
  /** Peças não vazias. */
  solidas: Malha;
  /** Peças vazias (para mostrar como fantasma; nenhuma subtração é feita aqui). */
  vazios: Malha;
}

/**
 * Cada peça vira um prisma: a base é o `contorno` (ou o retângulo `tamanho` = `[0,0, a,0, a,b, 0,b]`) no plano da chapa, extrudada
 * por `espessura` ao longo do eixo da espessura, a partir da face mínima. Mapeamento (u, v) do plano e w da espessura → mundo:
 *   eixo x: (ox + w, oy + u, oz + v)    eixo y: (ox + u, oy + w, oz + v)    eixo z: (ox + u, oy + v, oz + w)
 * com `w` de 0 a `espessura`. Atenção: o eixo y inverte a "mão" do mapeamento; as normais têm de sair PARA FORA nos três.
 * Faces: tampa inferior (w = 0, normal −w), tampa superior (w = espessura, normal +w), e uma parede lateral por aresta do contorno
 * (2 triângulos, normal para fora do polígono). As tampas de contorno poligonal vêm de `triangulate` de `@hestia/geom` (o
 * contorno de `PecaResolvida` já é anti-horário e válido). Retângulo: 12 triângulos (6 faces × 2).
 * `pecaDoTriangulo` aponta para o índice da peça na lista de ENTRADA (mesmo para vazias, que vão para a outra malha).
 * Ordem: peças na ordem de entrada. Determinística. Não lança para peça com números finitos.
 */
export function malhaDasPecas(pecas: readonly PecaResolvida[]): MalhasDasPecas {
  const solidas = malhaVazia();
  const vazios = malhaVazia();
  for (let indice = 0; indice < pecas.length; indice++) {
    const peca = pecas[indice]!;
    adicionarPeca(peca.vazio ? vazios : solidas, peca, indice);
  }
  return { solidas, vazios };
}

function malhaVazia(): Malha {
  return { positions: [], normals: [], indices: [], pecaDoTriangulo: [] };
}

/** Volume (m³) de uma malha fechada pela soma de tetraedros assinados; positivo quando as normais saem para fora. */
export function volumeDaMalha(m: Malha): number {
  let soma = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t]!;
    const b = m.indices[t + 1]!;
    const c = m.indices[t + 2]!;
    const ax = m.positions[a * 3]!;
    const ay = m.positions[a * 3 + 1]!;
    const az = m.positions[a * 3 + 2]!;
    const bx = m.positions[b * 3]!;
    const by = m.positions[b * 3 + 1]!;
    const bz = m.positions[b * 3 + 2]!;
    const cx = m.positions[c * 3]!;
    const cy = m.positions[c * 3 + 1]!;
    const cz = m.positions[c * 3 + 2]!;
    soma += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return soma / 6;
}
