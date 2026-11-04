import { compilar, type Contorno } from '@hestia/model';

/*
 * Apoio puro do editor de contorno poligonal da peça: leitura dos vértices, validação (mínimo de 3 e fórmulas que
 * compilam), inclusão, remoção e reordenação. Cada vértice é um par de fórmulas (x, y) no plano da chapa.
 */

export type PontoContorno = [string, string];

/** Vértices do contorno poligonal da peça; lista vazia quando o contorno é retangular ou ausente. */
export function pontosDoContorno(contorno: Contorno | undefined): PontoContorno[] {
  if (contorno?.tipo !== 'poligono') return [];
  return contorno.pontos.map((ponto) => [ponto[0], ponto[1]]);
}

/** Motivo da recusa do contorno, ou `null` quando ele pode ser gravado. */
export function validarContorno(pontos: readonly PontoContorno[]): string | null {
  if (pontos.length < 3) return `o contorno precisa de pelo menos 3 vértices (tem ${pontos.length})`;
  for (let i = 0; i < pontos.length; i++) {
    const ponto = pontos[i]!;
    const x = ponto[0].trim();
    const y = ponto[1].trim();
    if (x === '' || y === '') return `vértice ${i + 1}: informe x e y`;
    const compiladoX = compilar(x);
    if ('erro' in compiladoX) return `vértice ${i + 1} (x): ${compiladoX.erro.message}`;
    const compiladoY = compilar(y);
    if ('erro' in compiladoY) return `vértice ${i + 1} (y): ${compiladoY.erro.message}`;
  }
  return null;
}

function copiar(pontos: readonly PontoContorno[]): PontoContorno[] {
  return pontos.map((ponto): PontoContorno => [ponto[0], ponto[1]]);
}

/** Lista nova com um vértice `[x, y]` acrescentado ao fim (padrão `0, 0`). */
export function adicionarPonto(pontos: readonly PontoContorno[], ponto: PontoContorno = ['0', '0']): PontoContorno[] {
  return [...copiar(pontos), [ponto[0], ponto[1]]];
}

/** Lista nova sem o vértice `indice`; índice fora da faixa devolve a lista como está. */
export function removerPonto(pontos: readonly PontoContorno[], indice: number): PontoContorno[] {
  const copia = copiar(pontos);
  if (indice >= 0 && indice < copia.length) copia.splice(indice, 1);
  return copia;
}

/** Lista nova com o vértice movido `delta` posições (limitado às pontas; delta 0 não muda). */
export function moverPonto(pontos: readonly PontoContorno[], indice: number, delta: number): PontoContorno[] {
  const copia = copiar(pontos);
  if (indice < 0 || indice >= copia.length) return copia;
  const destino = Math.max(0, Math.min(copia.length - 1, indice + Math.trunc(delta)));
  if (destino === indice) return copia;
  const [ponto] = copia.splice(indice, 1);
  copia.splice(destino, 0, ponto!);
  return copia;
}

/** Contorno poligonal no formato do modelo, com os vértices sem espaços nas pontas. */
export function contornoDePontos(pontos: readonly PontoContorno[]): Contorno {
  return { tipo: 'poligono', pontos: pontos.map((ponto): [string, string] => [ponto[0].trim(), ponto[1].trim()]) };
}
