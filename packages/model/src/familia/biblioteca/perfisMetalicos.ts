import type { Familia, Parametro } from '../tipos.ts';
import type { FormaCorpo, Perfil, Ponto3 } from '../tiposCorpo.ts';
import { FAMILIAS_CHAPA_PARAFUSO } from './perfisMetalicosChapa.ts';
import { corpoEstrutural, dimensaoPerfil, familiaEstrutural, ligacaoRedonda, ligacaoRetangular, medidaDeTipo, tiposDaSerie, type SerieEstrutural } from './perfisMetalicosApoio.ts';

/*
 * Perfis estruturais laminados e tubos (ficha F7, ADR 0061). Cada família é UMA barra: o perfil de seção extrudado de 0 a L
 * ao longo de +Z, com ligação estrutural em cada ponta (a para −Z na origem; b para +Z em L). Seção retangular liga pela
 * largura P e altura A; seção redonda liga pelo diâmetro A. Séries genéricas: os valores são editáveis e marcados CONFERIR.
 */

interface BarraDados {
  id: string;
  nome: string;
  descricao: string;
  perfil: Perfil;
  secao: 'retangular' | 'redonda';
  parametros: Parametro[];
  series: readonly SerieEstrutural[];
}

function barra(d: BarraDados): Familia {
  const forma: FormaCorpo = { tipo: 'extrusao', perfil: d.perfil, comprimento: 'L' };
  const pontaA: Ponto3 = ['0', '0', '0'];
  const pontaB: Ponto3 = ['0', '0', 'L'];
  const ligacoes =
    d.secao === 'redonda'
      ? [ligacaoRedonda('a', 'Ponta A', pontaA, ['0', '0', '-1'], 'A'), ligacaoRedonda('b', 'Ponta B', pontaB, ['0', '0', '1'], 'A')]
      : [
          ligacaoRetangular('a', 'Ponta A', pontaA, ['0', '0', '-1'], 'P', 'A'),
          ligacaoRetangular('b', 'Ponta B', pontaB, ['0', '0', '1'], 'P', 'A'),
        ];
  return familiaEstrutural({
    id: d.id,
    nome: d.nome,
    categoria: 'perfil_estrutural',
    descricao: d.descricao,
    parametros: d.parametros,
    corpos: [corpoEstrutural('perfil', 'Perfil', 'perfil', forma)],
    ligacoes,
    tipos: tiposDaSerie(d.series, { L: 1000 }),
    tipoPadrao: d.series[0]?.id ?? '',
  });
}

const dimensoes = (): Parametro[] => [dimensaoPerfil('L', 'Comprimento'), dimensaoPerfil('A', 'Altura'), dimensaoPerfil('P', 'Largura')];

// CONFERIR: séries genéricas de perfis I (altura A, largura da mesa P, espessura da alma tw, da mesa tf).
const SERIES_I: readonly SerieEstrutural[] = [
  { id: 'i100', nome: 'I 100', valores: { A: 100, P: 55, tw: 4.5, tf: 7 } },
  { id: 'i150', nome: 'I 150', valores: { A: 150, P: 75, tw: 5, tf: 7 } },
  { id: 'i200', nome: 'I 200', valores: { A: 200, P: 100, tw: 6, tf: 10 } },
  { id: 'i300', nome: 'I 300', valores: { A: 300, P: 150, tw: 6.5, tf: 10 } },
];

// CONFERIR: séries genéricas de perfis U.
const SERIES_U: readonly SerieEstrutural[] = [
  { id: 'u100', nome: 'U 100', valores: { A: 100, P: 50, tw: 5, tf: 7.5 } },
  { id: 'u150', nome: 'U 150', valores: { A: 150, P: 75, tw: 6.5, tf: 10 } },
  { id: 'u200', nome: 'U 200', valores: { A: 200, P: 75, tw: 6, tf: 10 } },
];

// CONFERIR: séries genéricas de cantoneiras de abas iguais (A e P são as abas; e a espessura).
const SERIES_L: readonly SerieEstrutural[] = [
  { id: 'l40', nome: 'L 40 × 4', valores: { A: 40, P: 40, e: 4 } },
  { id: 'l50', nome: 'L 50 × 5', valores: { A: 50, P: 50, e: 5 } },
  { id: 'l75', nome: 'L 75 × 6', valores: { A: 75, P: 75, e: 6 } },
  { id: 'l100', nome: 'L 100 × 8', valores: { A: 100, P: 100, e: 8 } },
];

// CONFERIR: séries genéricas de perfis T.
const SERIES_T: readonly SerieEstrutural[] = [
  { id: 't100', nome: 'T 100', valores: { A: 100, P: 100, tw: 5, tf: 8 } },
  { id: 't150', nome: 'T 150', valores: { A: 150, P: 150, tw: 6, tf: 9 } },
];

// CONFERIR: tubos quadrados genéricos (lado A = P, espessura e).
const SERIES_TUBO_QUADRADO: readonly SerieEstrutural[] = [
  { id: 'q40', nome: 'Quadrado 40 × 2', valores: { A: 40, P: 40, e: 2 } },
  { id: 'q60', nome: 'Quadrado 60 × 3', valores: { A: 60, P: 60, e: 3 } },
  { id: 'q80', nome: 'Quadrado 80 × 4', valores: { A: 80, P: 80, e: 4 } },
  { id: 'q100', nome: 'Quadrado 100 × 5', valores: { A: 100, P: 100, e: 5 } },
];

// CONFERIR: tubos retangulares genéricos (altura A, largura P, espessura e).
const SERIES_TUBO_RETANGULAR: readonly SerieEstrutural[] = [
  { id: 'r60x40', nome: 'Retangular 60 × 40 × 3', valores: { A: 60, P: 40, e: 3 } },
  { id: 'r100x50', nome: 'Retangular 100 × 50 × 4', valores: { A: 100, P: 50, e: 4 } },
  { id: 'r150x100', nome: 'Retangular 150 × 100 × 5', valores: { A: 150, P: 100, e: 5 } },
];

// CONFERIR: tubos redondos genéricos (diâmetro externo A, espessura e; P = A por coerência do cabeçalho).
const SERIES_TUBO_REDONDO: readonly SerieEstrutural[] = [
  { id: 'd48', nome: 'Redondo Ø48 × 3', valores: { A: 48, P: 48, e: 3 } },
  { id: 'd60', nome: 'Redondo Ø60 × 3', valores: { A: 60, P: 60, e: 3 } },
  { id: 'd89', nome: 'Redondo Ø89 × 4', valores: { A: 89, P: 89, e: 4 } },
  { id: 'd114', nome: 'Redondo Ø114 × 4,5', valores: { A: 114, P: 114, e: 4.5 } },
];

const espessuraAlmaMesa = (): Parametro[] => [medidaDeTipo('tw', 'Espessura da alma', 6), medidaDeTipo('tf', 'Espessura da mesa', 10)];

export const FAMILIA_PERFIL_I: Familia = barra({
  id: 'fam_perfil_i',
  nome: 'Perfil I',
  descricao: 'Perfil I laminado: altura A, largura da mesa P, alma tw e mesa tf. Ligação retangular nas duas pontas.',
  perfil: { tipo: 'perfilI', altura: 'A', largura: 'P', almaEsp: 'tw', mesaEsp: 'tf' },
  secao: 'retangular',
  parametros: [...dimensoes(), ...espessuraAlmaMesa()],
  series: SERIES_I,
});

export const FAMILIA_PERFIL_U: Familia = barra({
  id: 'fam_perfil_u',
  nome: 'Perfil U',
  descricao: 'Perfil U laminado (canal): altura A, largura P, alma tw e mesa tf. Ligação retangular nas duas pontas.',
  perfil: { tipo: 'perfilU', altura: 'A', largura: 'P', almaEsp: 'tw', mesaEsp: 'tf' },
  secao: 'retangular',
  parametros: [...dimensoes(), ...espessuraAlmaMesa()],
  series: SERIES_U,
});

export const FAMILIA_PERFIL_L: Familia = barra({
  id: 'fam_perfil_l',
  nome: 'Cantoneira L',
  descricao: 'Cantoneira de abas A (vertical) e P (horizontal), espessura e. Ligação retangular nas duas pontas.',
  perfil: { tipo: 'perfilL', abaA: 'A', abaB: 'P', esp: 'e' },
  secao: 'retangular',
  parametros: [...dimensoes(), medidaDeTipo('e', 'Espessura', 5)],
  series: SERIES_L,
});

export const FAMILIA_PERFIL_T: Familia = barra({
  id: 'fam_perfil_t',
  nome: 'Perfil T',
  descricao: 'Perfil T laminado: altura A, mesa de largura P, alma tw e mesa tf. Ligação retangular nas duas pontas.',
  perfil: { tipo: 'perfilT', altura: 'A', largura: 'P', almaEsp: 'tw', mesaEsp: 'tf' },
  secao: 'retangular',
  parametros: [...dimensoes(), ...espessuraAlmaMesa()],
  series: SERIES_T,
});

export const FAMILIA_PERFIL_TUBULAR_QUADRADO: Familia = barra({
  id: 'fam_perfil_tubular_quadrado',
  nome: 'Tubo quadrado',
  descricao: 'Tubo estrutural quadrado de lado A (P = A) e espessura e. Ligação retangular nas duas pontas.',
  perfil: { tipo: 'retanguloOco', largura: 'P', altura: 'A', espessura: 'e' },
  secao: 'retangular',
  parametros: [...dimensoes(), medidaDeTipo('e', 'Espessura da parede', 3)],
  series: SERIES_TUBO_QUADRADO,
});

export const FAMILIA_PERFIL_TUBULAR_RETANGULAR: Familia = barra({
  id: 'fam_perfil_tubular_retangular',
  nome: 'Tubo retangular',
  descricao: 'Tubo estrutural retangular de altura A, largura P e espessura e. Ligação retangular nas duas pontas.',
  perfil: { tipo: 'retanguloOco', largura: 'P', altura: 'A', espessura: 'e' },
  secao: 'retangular',
  parametros: [...dimensoes(), medidaDeTipo('e', 'Espessura da parede', 3)],
  series: SERIES_TUBO_RETANGULAR,
});

export const FAMILIA_PERFIL_TUBULAR_REDONDO: Familia = barra({
  id: 'fam_perfil_tubular_redondo',
  nome: 'Tubo redondo',
  descricao: 'Tubo estrutural redondo de diâmetro externo A e espessura e (anel). Ligação redonda nas duas pontas.',
  perfil: { tipo: 'anel', diametroExterno: 'A', diametroInterno: 'A - 2 * e' },
  secao: 'redonda',
  parametros: [...dimensoes(), medidaDeTipo('e', 'Espessura da parede', 3)],
  series: SERIES_TUBO_REDONDO,
});

/** Perfis e tubos (ficha F7) mais chapa de base e parafuso: a biblioteca estrutural inteira. */
export const PERFIS_METALICOS: Familia[] = [
  FAMILIA_PERFIL_I,
  FAMILIA_PERFIL_U,
  FAMILIA_PERFIL_L,
  FAMILIA_PERFIL_T,
  FAMILIA_PERFIL_TUBULAR_QUADRADO,
  FAMILIA_PERFIL_TUBULAR_RETANGULAR,
  FAMILIA_PERFIL_TUBULAR_REDONDO,
  ...FAMILIAS_CHAPA_PARAFUSO,
];
