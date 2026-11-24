import type { Familia, Tipo } from '../tipos.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { DetalheFamilia, Simbolo2D } from '../tiposRepresentacao.ts';
import { corpoCaixa, familiaCaixa, ligacaoCaixa, ligacoesLaterais, parametroNumero, simboloPlanta, type DadosCaixa } from './caixasHidroApoio.ts';
import {
  acima,
  areaExigida,
  detalheCorte,
  PI,
  parametrosConstrucao,
  parametrosNorma,
  tabelaFossa,
  tipoDe,
  valoresTipo,
  verificacoesFossa,
} from './fossasSepticaApoio.ts';
import { derivado } from './novosApoio.ts';
import { comprimento } from './novosApoio.ts';

/*
 * Sumidouro (poço cilíndrico com anéis) e vala de infiltração simples (ficha F4). A área de infiltração exigida vem da vazão
 * diária e da taxa de infiltração do solo, ambas parâmetros editáveis (CONFERIR: o ensaio de percolação define a taxa).
 * Nenhuma das duas afirma atender à norma. O sumidouro não tem fundo (infiltra pela parede); a vala não tem saída.
 */

const E = 100;
const ET = 80;
const HA = 500;
// units-ok: rótulo de unidade do texto da família, não formatação
const verificacaoArea = { id: 'areaInsuficiente', severidade: 'aviso', condicao: 'areaInfiltracao < areaExigida', mensagem: 'Área de infiltração de {areaInfiltracao} m² menor que a exigida de {areaExigida} m² para {nContrib} contribuintes (CONFERIR)' } as const;

function familiaInfiltracao(d: DadosCaixa, detalhe: DetalheFamilia): Familia {
  return { ...familiaCaixa(d), detalhes: [detalhe] };
}

/** Área de infiltração (m2) do sumidouro: parede dos anéis, π · Di · (nAneis · ha). O fundo não conta (CONFERIR). */
export const AREA_SUMIDOURO = `${PI} * (L - 2 * e) * nAneis * ha / 1000000`;
/** Volume do poço (litros), útil como referência: π/4 · Di² · (nAneis · ha). */
export const VOLUME_SUMIDOURO = `${PI} / 4 * (L - 2 * e) * (L - 2 * e) * nAneis * ha / 1000000`;

export function tiposSumidouro(): Tipo[] {
  return ([[5, 1500], [10, 1800], [20, 2200]] as const).map(([n, d]) => {
    const perimetro = (PI * (d - 2 * E)) / 1000;
    const aneis = Math.ceil(areaExigida(n) / (perimetro * (HA / 1000)) - 1e-9);
    const a = aneis * HA + ET;
    return tipoDe(`n${n}`, `${n} contribuintes`, (({ cotaSaida: _, ...resto }) => resto)(valoresTipo(n, 100, { L: d, P: d, A: a })));
  });
}

const parametrosPoco = [
  parametroNumero('ha', 'Altura de cada anel', HA, 200, 1000, 'tipo'),
  derivado('nAneis', 'Número de anéis', 'floor((A - et) / ha)'),
  // units-ok: rótulo de unidade do texto da família, não formatação
  derivado('areaInfiltracao', 'Área de infiltração (m²)', AREA_SUMIDOURO),
  derivado('volumeUtil', 'Volume do poço (litros)', VOLUME_SUMIDOURO),
];

export const FAMILIA_SUMIDOURO: Familia = familiaInfiltracao(
  {
  id: 'fam_sumidouro',
  nome: 'Sumidouro',
  descricao:
    'Poço de infiltração cilíndrico de anéis de concreto, sem fundo, com tampa e uma entrada lateral. Área de infiltração pela vazão e pela taxa do solo, editáveis (CONFERIR: ensaio de percolação e norma vigente); não afirma atender à norma.',
  parametros: [...parametrosConstrucao().filter((p) => p.id !== 'ef' && p.id !== 'cotaSaida' && p.id !== 'A'), comprimento('A', 'Altura (profundidade total)', 3000, 500, 20000), ...parametrosPoco, ...parametrosNorma('infiltracao')],
  tipos: tiposSumidouro(),
  tipoPadrao: 'n5',
  corpos: [
    { ...corpoCaixa('aneis', 'Anéis de concreto', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'anel', diametroExterno: 'L', diametroInterno: 'L - 2 * e' }, comprimento: 'ha' }, { origem: ['0', '0', '(i - 1) * ha'] }), repetir: 'nAneis' },
    corpoCaixa('tampa', 'Tampa', 'tampa', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L' }, comprimento: 'et' }, { origem: ['0', '0', 'A - et'] }),
  ],
  // Entrada lateral e respiro na tampa (a ligação de saída de ar; o sumidouro não tem saída de esgoto). CONFERIR.
  ligacoes: [...ligacoesLaterais().filter((l) => l.id === 'entrada'), ligacaoCaixa('respiro', 'Respiro', 'saida', ['0', '0', 'A'], ['0', '0', '1'])],
  simbolos: [simboloPlanta('circulo')],
  verificacoes: [
    ...verificacoesFossa().filter((v) => v.id !== 'saidaAcimaDaEntrada'),
    verificacaoArea,
    { id: 'semAneis', severidade: 'erro', condicao: 'nAneis < 1', mensagem: 'Altura de {A} mm não comporta nenhum anel de {ha} mm' },
  ],
  // units-ok: rótulo de unidade do texto da família, não formatação
  tabelas: tabelaFossa({ titulo: 'Área de infiltração', valor: 'areaInfiltracao', unidade: 'm²' }),
  },
  detalheCorte({ saida: false, fundo: false }),
);

// Vala de infiltração: leito de brita (L × P × hBrita) com tubo perfurado ao longo de X; entrada na ponta −X.
/** Altura do leito de brita (mm) = profundidade total − cobertura de terra. */
const BRITA = 'A - cobertura';
/** Área de infiltração da vala (m2): fundo e as duas laterais do leito, (P + 2 · hBrita) · L. */
export const AREA_VALA = '(P + 2 * hBrita) * L / 1000000';
const P_VALA = 600;
const COBERTURA = 300;
const A_VALA = 800;

export function tiposVala(): Tipo[] {
  return ([[5], [10], [20]] as const).map(([n]) => {
    const l = acima((areaExigida(n) * 1e6) / (P_VALA + 2 * (A_VALA - COBERTURA)), 500);
    return tipoDe(`n${n}`, `${n} contribuintes`, { nContrib: n, DN: 100, L: l, P: P_VALA, A: A_VALA, cotaEntrada: A_VALA - COBERTURA - 150 });
  });
}

const ligacaoVala: Ligacao = ligacaoCaixa('entrada', 'Entrada', 'entrada', ['0 - L / 2', '0', 'cotaEntrada + DN / 2'], ['-1', '0', '0']);
/** Ponta final do tubo perfurado: continuação para outra vala ou caixa de inspeção. CONFERIR. */
const ligacaoPonta: Ligacao = ligacaoCaixa('ponta', 'Ponta final', 'saida', ['L / 2', '0', 'cotaEntrada + DN / 2'], ['1', '0', '0']);

const simboloVala: Simbolo2D = {
  id: 'planta',
  nome: 'Planta da vala',
  vistas: ['planta'],
  plano: 'xy',
  substituiGeometria: true,
  primitivos: [
    { tipo: 'polilinha', pontos: [['0 - L / 2', '0 - P / 2'], ['L / 2', '0 - P / 2'], ['L / 2', 'P / 2'], ['0 - L / 2', 'P / 2']], fechada: true },
    { tipo: 'linha', de: ['0 - L / 2', '0'], ate: ['L / 2', '0'] },
  ],
};

/** Corte longitudinal da vala: profundidade total, fundo da entrada (na ponta −X) e altura do leito de brita. */
const detalheVala: DetalheFamilia = {
  id: 'corteLongitudinal',
  nome: 'Corte longitudinal',
  vista: 'corte',
  plano: { eixo: 'y', posicao: '0' },
  escala: 25,
  cotas: [
    { id: 'profundidade', de: { tipo: 'ponto', ponto: ['0', '0', '0'] }, ate: { tipo: 'ponto', ponto: ['0', '0', 'A'] }, deslocamento: 'L / 2 + 200', parametro: 'A' },
    { id: 'fundoEntrada', de: { tipo: 'ponto', ponto: ['0 - L / 2', '0', '0'] }, ate: { tipo: 'ponto', ponto: ['0 - L / 2', '0', 'cotaEntrada'] }, deslocamento: '300', parametro: 'cotaEntrada' },
    { id: 'leitoBrita', de: { tipo: 'ponto', ponto: ['0', '0', '0'] }, ate: { tipo: 'ponto', ponto: ['0', '0', 'hBrita'] }, deslocamento: '0 - L / 2 - 200' },
  ],
};

export const FAMILIA_VALA_INFILTRACAO: Familia = {
  ...familiaInfiltracao({
    id: 'fam_vala_infiltracao',
    nome: 'Vala de infiltração',
    descricao:
      'Vala simples de infiltração: leito de brita com tubo perfurado ao longo do comprimento, entrada na ponta. Área de infiltração pela vazão e pela taxa do solo, editáveis (CONFERIR: ensaio de percolação e norma vigente); não afirma atender à norma.',
    parametros: [
      { id: 'DN', nome: 'Diâmetro nominal (DN)', tipo: 'enum', escopo: 'tipo', padrao: 100, grupo: 'Bitola', opcoes: [{ valor: 100, rotulo: 'DN 100' }] },
      comprimento('L', 'Comprimento da vala', 6000, 1000, 100000),
      comprimento('P', 'Largura da vala', P_VALA, 300, 2000),
      comprimento('A', 'Profundidade total', A_VALA, 400, 3000),
      parametroNumero('cobertura', 'Cobertura de terra sobre a brita', COBERTURA, 100, 1000, 'tipo'),
      parametroNumero('cotaEntrada', 'Cota de fundo da entrada', A_VALA - COBERTURA - 150, 0, 3000, 'instancia', 'Tubulações'),
      derivado('hBrita', 'Altura do leito de brita', BRITA),
      // units-ok: rótulo de unidade do texto da família, não formatação
      derivado('areaInfiltracao', 'Área de infiltração (m²)', AREA_VALA),
      derivado('volumeUtil', 'Volume do leito de brita (litros)', 'L * P * hBrita / 1000000'),
      ...parametrosNorma('infiltracao'),
    ],
    tipos: tiposVala(),
    tipoPadrao: 'n5',
    corpos: [
      corpoCaixa('leito', 'Leito de brita', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'P' }, comprimento: 'hBrita' }, { origem: ['0', '0', '0'] }),
      corpoCaixa('tubo', 'Tubo perfurado', 'tubo', { tipo: 'extrusao', perfil: { tipo: 'anel', diametroExterno: 'DN', diametroInterno: 'DN - 6' }, comprimento: 'L' }, { origem: ['0 - L / 2', '0', 'hBrita - DN'], rotacao: ['0', '90', '0'] }),
    ],
    ligacoes: [ligacaoVala, ligacaoPonta],
    simbolos: [simboloVala],
    verificacoes: [
      verificacaoArea,
      { id: 'tuboNaoCabe', severidade: 'erro', condicao: 'DN + 100 > hBrita', mensagem: 'Tubo DN {DN} não cabe no leito de {hBrita} mm' },
      { id: 'entradaForaDoLeito', severidade: 'erro', condicao: 'cotaEntrada + DN / 2 > A', mensagem: 'Entrada com cota de {cotaEntrada} mm fica acima da superfície' },
    ],
    // units-ok: rótulo de unidade do texto da família, não formatação
    tabelas: tabelaFossa({ titulo: 'Área de infiltração', valor: 'areaInfiltracao', unidade: 'm²' }),
  }, detalheVala),
};
