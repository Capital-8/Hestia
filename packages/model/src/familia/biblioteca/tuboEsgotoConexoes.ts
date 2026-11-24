import type { Familia, Tipo } from '../tipos.ts';
import { derivado } from './novosApoio.ts';
import { anelEsgoto, corpoEsgoto, dimensao, encaixeDe, familiaEsgoto, ligacaoEsgoto, mm, parametroDe, parametroDn, parametroEncaixe, parametroEspessura, tiposPorDn } from './tuboEsgotoApoio.ts';

/*
 * Conexões de esgoto (ficha F1). Tê e junção: o eixo principal vai de −Ce a +Ce em X e o ramal sai da face externa do principal
 * (sem subtração de furo: a união dos corpos só é correta por fora; o furo vem com o CSG, ficha F-CSG). Ce = De/2 + Lf.
 * Luva: anel curto de comprimento Ll = 2 Lf. Redução: transição sólida de círculos, excêntrica (geratriz inferior alinhada),
 * documentada como maciça na v1. Tampão: cilindro maciço de comprimento Lf que fecha a bolsa.
 * L, A e P são a caixa nominal do tipo (valor por DN, calculado com as mesmas tabelas das fórmulas).
 */

const DISTANCIA_EIXO_PONTA = derivado('Ce', 'Distância eixo-ponta', 'De / 2 + Lf');
const COMPRIMENTO_LUVA = derivado('Ll', 'Comprimento da luva', '2 * Lf');

/** Corpo principal de tê e junção: anel de −Ce a +Ce em X (rotação [0, 90, 0] leva +Z para +X). */
const PRINCIPAL_T = corpoEsgoto(
  'principal',
  'Ramal principal',
  'conexao',
  { tipo: 'extrusao', perfil: anelEsgoto(), comprimento: '2 * Ce' },
  { origem: ['0 - Ce', '0', '0'], rotacao: ['0', '90', '0'] },
);

/** Caixa nominal de tê e junção por DN: comprimento 2 Ce, altura De, profundidade Ce (ramal em +Y ou no ângulo de 45°). */
const caixaT = (dn: number): Record<string, number> => {
  const ce = dn / 2 + encaixeDe(dn);
  return { L: mm(2 * ce), A: dn, P: mm(ce) };
};

export const FAMILIA_ESGOTO_TE: Familia = familiaEsgoto({
  id: 'fam_esgoto_te',
  nome: 'Tê de inspeção de esgoto',
  categoria: 'conexao_tubo',
  descricao: 'Tê de inspeção de PVC para esgoto: ramal principal em X (pontas A e B) e ramal de inspeção em +Y (ponta C). Ramal começa na face externa do principal.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 100),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    DISTANCIA_EIXO_PONTA,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    PRINCIPAL_T,
    corpoEsgoto('ramal', 'Ramal de inspeção', 'conexao', { tipo: 'extrusao', perfil: anelEsgoto(), comprimento: 'Lf' }, { origem: ['0', 'De / 2', '0'], rotacao: ['-90', '0', '0'] }),
  ],
  ligacoes: [
    ligacaoEsgoto('a', 'Ponta A', ['0 - Ce', '0', '0'], ['-1', '0', '0'], 'De'),
    ligacaoEsgoto('b', 'Ponta B', ['Ce', '0', '0'], ['1', '0', '0'], 'De'),
    ligacaoEsgoto('c', 'Inspeção C', ['0', 'Ce', '0'], ['0', '1', '0'], 'De'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' },
  tipos: tiposPorDn(caixaT),
  tipoPadrao: 'dn100',
});

export const FAMILIA_ESGOTO_JUNCAO45: Familia = familiaEsgoto({
  id: 'fam_esgoto_juncao45',
  nome: 'Junção 45° de esgoto',
  categoria: 'conexao_tubo',
  descricao: 'Junção de 45° de PVC para esgoto: principal em X (pontas A e B) e ramal de 45° para +X/+Y (ponta C). Ramal começa na face externa do principal.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 100),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    DISTANCIA_EIXO_PONTA,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    PRINCIPAL_T,
    // Origem sobre a face externa do principal, no ramal de 45° (distância ao eixo De / (2 sen 45) = De/√2; cot 45° = 1).
    corpoEsgoto(
      'ramal',
      'Ramal 45°',
      'conexao',
      { tipo: 'extrusao', perfil: anelEsgoto(), comprimento: 'Ce - De / (2 * sin(45))' },
      { origem: ['De / 2', 'De / 2', '0'], rotacao: ['0', '90', '45'] },
    ),
  ],
  ligacoes: [
    ligacaoEsgoto('a', 'Ponta A', ['0 - Ce', '0', '0'], ['-1', '0', '0'], 'De'),
    ligacaoEsgoto('b', 'Ponta B', ['Ce', '0', '0'], ['1', '0', '0'], 'De'),
    ligacaoEsgoto('c', 'Ramal C', ['Ce * cos(45)', 'Ce * sin(45)', '0'], ['cos(45)', 'sin(45)', '0'], 'De'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' },
  tipos: tiposPorDn(caixaT),
  tipoPadrao: 'dn100',
});

export const FAMILIA_ESGOTO_LUVA: Familia = familiaEsgoto({
  id: 'fam_esgoto_luva',
  nome: 'Luva de esgoto',
  categoria: 'conexao_tubo',
  descricao: 'Luva de união de PVC para esgoto: anel curto De × (De − 2e) de comprimento Ll = 2 Lf, com as duas pontas do mesmo DN.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 100),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    COMPRIMENTO_LUVA,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [corpoEsgoto('luva', 'Luva', 'conexao', { tipo: 'extrusao', perfil: anelEsgoto(), comprimento: 'Ll' }, { origem: ['0', '0', '0'] })],
  ligacoes: [ligacaoEsgoto('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'), ligacaoEsgoto('b', 'Ponta B', ['0', '0', 'Ll'], ['0', '0', '1'], 'De')],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'CONNECTOR' },
  tipos: tiposPorDn((dn) => ({ L: dn, A: mm(2 * encaixeDe(dn)), P: dn })),
  tipoPadrao: 'dn100',
});

/** Tipo de redução: DN maior e DN menor; a caixa é De (maior) × Lr = De × De (maior). */
const tipoReducao = (dn: number, dn2: number): Tipo => ({ id: `r${dn}_${dn2}`, nome: `Redução DN ${dn} × ${dn2}`, valores: { DN: dn, DN2: dn2, L: dn, A: dn, P: dn } });

export const FAMILIA_ESGOTO_REDUCAO: Familia = familiaEsgoto({
  id: 'fam_esgoto_reducao',
  nome: 'Redução excêntrica de esgoto',
  categoria: 'conexao_tubo',
  descricao: 'Redução excêntrica de PVC para esgoto, do DN maior (ponta A) ao DN menor (ponta B), com as geratrizes inferiores alinhadas. Maciça na v1 (transição de círculos), comprimento Lr = De.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal maior (DN)', 100),
    parametroDn('DN2', 'Diâmetro nominal menor (DN2)', 75),
    parametroDe('DN'),
    parametroDe('DN2', 'De2', 'Diâmetro externo menor'),
    derivado('Lr', 'Comprimento da redução', 'De'),
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    corpoEsgoto(
      'reducao',
      'Redução excêntrica',
      'conexao',
      { tipo: 'transicao', perfilA: { tipo: 'circulo', diametro: 'De' }, perfilB: { tipo: 'circulo', diametro: 'De2' }, comprimento: 'Lr', desvio: ['0', '(De - De2) / 2'] },
      { origem: ['0', '0', '0'] },
    ),
  ],
  ligacoes: [
    ligacaoEsgoto('a', 'Ponta A (maior)', ['0', '0', '0'], ['0', '0', '-1'], 'De'),
    ligacaoEsgoto('b', 'Ponta B (menor)', ['0', '(De - De2) / 2', 'Lr'], ['0', '0', '1'], 'De2'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'TRANSITION' },
  tipos: [tipoReducao(50, 40), tipoReducao(75, 50), tipoReducao(100, 50), tipoReducao(100, 75), tipoReducao(150, 100)],
  tipoPadrao: 'r100_75',
});

export const FAMILIA_ESGOTO_TAMPAO: Familia = familiaEsgoto({
  id: 'fam_esgoto_tampao',
  nome: 'Tampão de esgoto',
  categoria: 'conexao_tubo',
  descricao: 'Tampão de PVC para esgoto: cilindro maciço De de comprimento Lf que fecha a bolsa do tubo. Uma ligação (ponta A) na origem.',
  parametros: [parametroDn('DN', 'Diâmetro nominal (DN)', 100), parametroDe('DN'), parametroEncaixe('DN'), dimensao('L', 'Largura'), dimensao('A', 'Altura'), dimensao('P', 'Profundidade')],
  corpos: [corpoEsgoto('tampao', 'Tampão', 'tampa', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'De' }, comprimento: 'Lf' }, { origem: ['0', '0', '0'] })],
  ligacoes: [ligacaoEsgoto('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De')],
  ifc: { classe: 'IFCPIPEFITTING' },
  tipos: tiposPorDn((dn) => ({ L: dn, A: encaixeDe(dn), P: dn })),
  tipoPadrao: 'dn100',
});
