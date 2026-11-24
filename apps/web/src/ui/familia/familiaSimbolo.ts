import { pontosDoPrimitivo, type Primitivo2D, type VistaSimbolo } from '@hestia/model';
import type { ChaveI18n } from './familiaCorpo.ts';

/*
 * Apoio da seção "Símbolos 2D" (ficha D3): ferramentas da tela, rótulos, criação do primitivo no ponto clicado e cópias
 * com um campo trocado (a edição real passa pelo modelo, em `edicaoSimbolos.ts`, dentro de `useFamilia.executar`). Tudo puro.
 */

export type Ferramenta = 'linha' | 'circulo' | 'arco' | 'polilinha' | 'texto';

export const FERRAMENTAS: readonly Ferramenta[] = ['linha', 'circulo', 'arco', 'polilinha', 'texto'];

export const ROTULO_FERRAMENTA: Readonly<Record<Ferramenta, ChaveI18n>> = {
  linha: 'fam_sim_ferr_linha',
  circulo: 'fam_sim_ferr_circulo',
  arco: 'fam_sim_ferr_arco',
  polilinha: 'fam_sim_ferr_polilinha',
  texto: 'fam_sim_ferr_texto',
};

export const ROTULO_VISTA_SIMBOLO: Readonly<Record<VistaSimbolo, ChaveI18n>> = {
  planta: 'fam_sim_vista_planta',
  corte: 'fam_sim_vista_corte',
  elevacao: 'fam_sim_vista_elevacao',
};

/** Passo do arco na tela (mesmo número de segmentos da miniatura do detalhe). */
export const PASSOS_ARCO = 24;

/** Primitivo da ferramenta com o ponto de ancoragem em (x, y) mm (arredondado). A forma cresce 100 mm para a direita e para cima. */
export function primitivoEm(f: Ferramenta, x: number, y: number): Primitivo2D {
  const x0 = String(Math.round(x));
  const y0 = String(Math.round(y));
  const x1 = String(Math.round(x + 100));
  const y1 = String(Math.round(y + 100));
  switch (f) {
    case 'linha': return { tipo: 'linha', de: [x0, y0], ate: [x1, y0] };
    case 'circulo': return { tipo: 'circulo', centro: [x0, y0], raio: '50' };
    case 'arco': return { tipo: 'arco', centro: [x0, y0], raio: '50', deGraus: '0', ateGraus: '90' };
    case 'polilinha': return { tipo: 'polilinha', pontos: [[x0, y0], [x1, y0], [x1, y1]] };
    case 'texto': return { tipo: 'texto', posicao: [x0, y0], texto: '"Texto"', altura: '50' };
  }
}

/** Cópia profunda do primitivo (o original não pode mudar antes de a gravação passar pelo modelo). */
function clonar<T extends Primitivo2D>(p: T): T {
  return JSON.parse(JSON.stringify(p)) as T;
}

/** Cópia com o ponto `k` (ver `pontosDoPrimitivo`) e o eixo `a` (0 = X, 1 = Y) trocados pelo texto `valor`. */
export function comPonto(p: Primitivo2D, k: number, a: 0 | 1, valor: string): Primitivo2D {
  const copia = clonar(p);
  const ponto = pontosDoPrimitivo(copia)[k];
  if (ponto !== undefined) ponto[a] = valor;
  return copia;
}

export type CampoEscalar = 'raio' | 'deGraus' | 'ateGraus' | 'altura' | 'texto';

/** Cópia com um campo de texto trocado (só vale para o tipo que tem o campo; o resto fica igual). */
export function comEscalar(p: Primitivo2D, campo: CampoEscalar, valor: string): Primitivo2D {
  const copia = clonar(p);
  switch (campo) {
    case 'raio':
      if (copia.tipo === 'circulo' || copia.tipo === 'arco') copia.raio = valor;
      break;
    case 'deGraus':
      if (copia.tipo === 'arco') copia.deGraus = valor;
      break;
    case 'ateGraus':
      if (copia.tipo === 'arco') copia.ateGraus = valor;
      break;
    case 'altura':
      if (copia.tipo === 'texto') copia.altura = valor;
      break;
    case 'texto':
      if (copia.tipo === 'texto') copia.texto = valor;
      break;
  }
  return copia;
}

/** Polilinha com um vértice a mais, 100 mm à frente do último. `null` se o primitivo não é polilinha. */
export function comVerticeNovo(p: Primitivo2D): Primitivo2D | null {
  if (p.tipo !== 'polilinha') return null;
  const copia = clonar(p);
  const ultimo = copia.pontos[copia.pontos.length - 1];
  const x = Number(ultimo?.[0] ?? 0);
  const y = Number(ultimo?.[1] ?? 0);
  copia.pontos.push([String(Math.round(x + 100)), String(Math.round(y))]);
  return copia;
}

/** Polilinha sem o vértice `k`; recusa (`null`) quando sobram menos de dois vértices, que o validador exige. */
export function semVertice(p: Primitivo2D, k: number): Primitivo2D | null {
  if (p.tipo !== 'polilinha' || p.pontos.length <= 2) return null;
  const copia = clonar(p);
  copia.pontos = copia.pontos.filter((_, j) => j !== k);
  return copia;
}

/** Valor literal de um ponto (número escrito direto, em mm), ou `null` se for fórmula: só o literal tem alça na tela. */
export function literal(texto: string): number | null {
  if (texto.trim() === '') return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}
