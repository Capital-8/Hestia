// Formulário do perfil da seção (estrutura, A.2): campos que cada forma pede e completagem de valores válidos ao trocar de
// forma (o molde é `curtainMullionProfile.ts`). Só trata os NÚMEROS do formulário: o contorno (anéis e furos) é do kernel,
// que a prévia consulta por `perfilContorno` (ver perfilContorno.ts). Nada aqui calcula geometria.

import { validarPerfil, type FormaDePerfil, type PerfilForma, type VerticePerfil } from '@hestia/model';

/** Parâmetro numérico de um perfil (os que a forma pede, por nome). */
export type ParametroPerfil = 'b' | 'h' | 'd' | 'tf' | 'tw' | 't';

/** Parâmetros que cada forma pede, na ordem em que o editor os mostra (`personalizado` não tem: edita vértices). */
export const PARAMETROS_DA_FORMA: Readonly<Record<FormaDePerfil, readonly ParametroPerfil[]>> = {
  retangular: ['b', 'h'],
  circular: ['d'],
  L: ['b', 'h', 'tf'],
  T: ['b', 'h', 'tf', 'tw'],
  I: ['b', 'h', 'tf', 'tw'],
  U: ['b', 'h', 'tf', 'tw'],
  tuboRetangular: ['b', 'h', 't'],
  tuboCircular: ['d', 't'],
  personalizado: [],
};

/** Parâmetros que a forma pede. */
export const camposDaForma = (forma: FormaDePerfil): readonly ParametroPerfil[] => PARAMETROS_DA_FORMA[forma];

/** Menor e maior valor possível de cada parâmetro no campo (metros); a regra fina (tf*2 < h...) é de `validarPerfil`. */
export const PARAMETRO_MIN = 0.001;

/** Largura e altura (m) de referência do perfil, usadas para carregar o tamanho ao trocar de forma. */
export function dimensoesDe(p: PerfilForma): { b: number; h: number } {
  switch (p.forma) {
    case 'circular':
    case 'tuboCircular':
      return { b: p.d, h: p.d };
    case 'personalizado': {
      const xs = p.anel.map((v) => v[0]);
      const ys = p.anel.map((v) => v[1]);
      const b = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      return { b: Number.isFinite(b) && b > 0 ? b : 0.2, h: Number.isFinite(h) && h > 0 ? h : 0.2 };
    }
    default:
      return { b: p.b, h: p.h };
  }
}

/** Arredonda ao milímetro (valor de campo), nunca abaixo de 1 mm. */
const mm = (v: number): number => Math.max(PARAMETRO_MIN, Math.round(v * 1000) / 1000);

/** Retângulo b × h centrado na origem, no sentido anti-horário (semente do perfil personalizado). */
export function aneloRetangular(b: number, h: number): VerticePerfil[] {
  return [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]];
}

/**
 * Perfil da forma pedida com valores válidos: carrega largura e altura do perfil anterior, mantém espessuras que a nova
 * forma também usa (se ainda valem) e completa as que faltam com 1/10 da menor medida (alma e parede finas). Ao ir para
 * `personalizado` a semente é o retângulo da caixa do perfil anterior, que o usuário edita.
 */
export function perfilParaForma(atual: PerfilForma, forma: FormaDePerfil): PerfilForma {
  if (atual.forma === forma) return atual;
  const { b, h } = dimensoesDe(atual);
  const lado = Math.min(b, h);
  const tfAtual = 'tf' in atual ? atual.tf : undefined;
  const twAtual = 'tw' in atual ? atual.tw : undefined;
  const tAtual = 't' in atual ? atual.t : undefined;
  const tf = tfAtual ?? tAtual ?? mm(lado / 10);
  const tw = twAtual ?? mm(tf * 0.6);
  const t = tAtual ?? tfAtual ?? mm(lado / 10);
  const candidatos: Record<FormaDePerfil, PerfilForma> = {
    retangular: { forma: 'retangular', b, h },
    circular: { forma: 'circular', d: lado },
    L: { forma: 'L', b, h, tf },
    T: { forma: 'T', b, h, tf, tw },
    I: { forma: 'I', b, h, tf, tw },
    U: { forma: 'U', b, h, tf, tw },
    tuboRetangular: { forma: 'tuboRetangular', b, h, t },
    tuboCircular: { forma: 'tuboCircular', d: lado, t: Math.min(t, mm(lado / 10)) },
    personalizado: { forma: 'personalizado', anel: aneloRetangular(b, h) },
  };
  const novo = candidatos[forma];
  if (validarPerfil(novo) === null) return novo;
  // Espessuras herdadas não servem na nova forma (ex.: parede mais grossa que a metade): usa as proporções padrão.
  const fino = mm(lado / 10);
  const seguro: Record<FormaDePerfil, PerfilForma> = {
    ...candidatos,
    L: { forma: 'L', b, h, tf: fino },
    T: { forma: 'T', b, h, tf: fino, tw: mm(fino * 0.6) },
    I: { forma: 'I', b, h, tf: fino, tw: mm(fino * 0.6) },
    U: { forma: 'U', b, h, tf: fino, tw: mm(fino * 0.6) },
    tuboRetangular: { forma: 'tuboRetangular', b, h, t: fino },
    tuboCircular: { forma: 'tuboCircular', d: lado, t: fino },
  };
  return seguro[forma];
}

/** Valor de um parâmetro do perfil (0 quando a forma não o tem). */
export function parametroDe(p: PerfilForma, nome: ParametroPerfil): number {
  const v = (p as unknown as Record<string, unknown>)[nome];
  return typeof v === 'number' ? v : 0;
}

/** Perfil com um parâmetro trocado (cópia; perfil `personalizado` volta intacto). */
export function comParametro(p: PerfilForma, nome: ParametroPerfil, valor: number): PerfilForma {
  return p.forma === 'personalizado' ? p : ({ ...p, [nome]: valor } as PerfilForma);
}

/** Vértices em texto: uma linha por vértice, "x; y" em metros (decimal com ponto). */
export const verticesParaTexto = (anel: readonly VerticePerfil[]): string => anel.map(([x, y]) => `${x}; ${y}`).join('\n');

/** Texto de vértices ("x; y" ou "x y", vírgula decimal aceita) para a lista; null se alguma linha não for um par numérico. */
export function textoParaVertices(texto: string): VerticePerfil[] | null {
  const linhas = texto.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const out: VerticePerfil[] = [];
  for (const linha of linhas) {
    const partes = linha.includes(';') ? linha.split(';') : linha.split(/\s+/);
    if (partes.length !== 2) return null;
    const [x, y] = partes.map((s) => Number(s.trim().replace(',', '.')));
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y) || partes.some((s) => s.trim() === '')) return null;
    out.push([x, y]);
  }
  return out;
}

/** Furos em texto: um furo por bloco, separados por linha em branco. */
export const furosParaTexto = (furos: readonly (readonly VerticePerfil[])[] | undefined): string => (furos ?? []).map(verticesParaTexto).join('\n\n');

/** Texto de furos para a lista de furos; null se algum vértice for inválido. */
export function textoParaFuros(texto: string): VerticePerfil[][] | null {
  const blocos = texto.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b !== '');
  const out: VerticePerfil[][] = [];
  for (const bloco of blocos) {
    const v = textoParaVertices(bloco);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

/** Formas que a base de fundação isolada (e o pescoço) aceita, por `footingTypeIssue`. */
export const ISOLADA: readonly FormaDePerfil[] = ['retangular', 'circular', 'personalizado'];
/** Formas da estaca. */
export const ESTACA: readonly FormaDePerfil[] = ['circular', 'tuboCircular'];
/** Forma da fundação corrida (baldrame). */
export const CORRIDA: readonly FormaDePerfil[] = ['retangular'];

/** Formas de perfil que a base aceita: corrida retangular, estaca circular ou tubo, o resto livre. */
export const formasDaBase = (tp: { modo: 'isolada' | 'corrida'; forma: 'sapata' | 'bloco' | 'estaca' }): readonly FormaDePerfil[] => (tp.forma === 'estaca' ? ESTACA : tp.modo === 'corrida' ? CORRIDA : ISOLADA);
