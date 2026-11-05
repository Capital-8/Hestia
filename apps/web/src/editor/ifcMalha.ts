import type { Project } from '@hestia/model';

/**
 * Transporte das malhas entre o worker de importação e a janela.
 *
 * Um IFC de 50 MB vira um projeto com milhões de coordenadas (o arquivo de teste dá ~6,7 milhões de números). Mandar
 * isso por `postMessage` como objetos custa segundos de *structured clone* na thread principal. Aqui as malhas viram
 * dois buffers (`Float64Array` das posições e `Uint32Array` dos índices) transferidos sem cópia, e cada elemento fica
 * com uma referência `{ p0, p1, i0, i1 }` no lugar do `mesh`. Na janela o `mesh` é remontado como array comum, que é
 * o formato que o modelo e o Salvar já usam.
 */

/** Faixa de uma malha dentro dos buffers empacotados. */
export interface FaixaMalha {
  p0: number;
  p1: number;
  i0: number;
  i1: number;
}

export interface ProjetoIfcEmpacotado {
  projeto: Project;
  posicoes: Float64Array;
  indices: Uint32Array;
}

interface Malha {
  positions: number[];
  indices: number[];
}

const malhaDe = (elemento: unknown): Malha | undefined => {
  const mesh = (elemento as { mesh?: unknown }).mesh;
  if (!mesh || typeof mesh !== 'object') return undefined;
  const { positions, indices } = mesh as Partial<Malha>;
  return Array.isArray(positions) && Array.isArray(indices) ? { positions, indices } : undefined;
};

/** Troca cada malha por uma faixa nos buffers, prontos para `postMessage(..., [buffers])`. */
export function empacotarProjetoIfc(projeto: Project): ProjetoIfcEmpacotado {
  const entradas = Object.entries(projeto.elements);
  let totalPosicoes = 0;
  let totalIndices = 0;
  for (const [, elemento] of entradas) {
    const malha = malhaDe(elemento);
    if (!malha) continue;
    totalPosicoes += malha.positions.length;
    totalIndices += malha.indices.length;
  }

  const posicoes = new Float64Array(totalPosicoes);
  const indices = new Uint32Array(totalIndices);
  const elementos: Record<string, unknown> = {};
  let p = 0;
  let i = 0;
  for (const [id, elemento] of entradas) {
    const malha = malhaDe(elemento);
    if (!malha) {
      elementos[id] = elemento;
      continue;
    }
    posicoes.set(malha.positions, p);
    indices.set(malha.indices, i);
    const faixa: FaixaMalha = { p0: p, p1: p + malha.positions.length, i0: i, i1: i + malha.indices.length };
    elementos[id] = { ...elemento, mesh: faixa };
    p += malha.positions.length;
    i += malha.indices.length;
  }
  return { projeto: { ...projeto, elements: elementos as Project['elements'] }, posicoes, indices };
}

/** Remonta os arrays comuns de cada malha a partir dos buffers recebidos. */
export function desempacotarProjetoIfc(empacotado: ProjetoIfcEmpacotado): Project {
  const { projeto, posicoes, indices } = empacotado;
  const elementos: Record<string, unknown> = {};
  for (const [id, elemento] of Object.entries(projeto.elements)) {
    const mesh = (elemento as { mesh?: unknown }).mesh;
    if (mesh && typeof mesh === 'object' && 'p0' in mesh) {
      const faixa = mesh as FaixaMalha;
      elementos[id] = {
        ...elemento,
        mesh: {
          positions: Array.from(posicoes.subarray(faixa.p0, faixa.p1)),
          indices: Array.from(indices.subarray(faixa.i0, faixa.i1)),
        },
      };
      continue;
    }
    elementos[id] = elemento;
  }
  return { ...projeto, elements: elementos as Project['elements'] };
}
