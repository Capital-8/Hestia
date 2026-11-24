import type { Familia, Tipo } from '../tipos.ts';
import { derivado } from './novosApoio.ts';
import { anelAgua, corpoAgua, dimensao, encaixeDe, familiaAgua, ligacaoAgua, mm, parametroDe, parametroDn, parametroEncaixe, parametroEspessura, tiposPorDn } from './tuboAguaFriaApoio.ts';

/*
 * Conexões de água fria (ficha F2). Caixa nominal: L no eixo X, A no eixo Z, P no eixo Y. Tê: eixo principal de −Ce a +Ce em X e
 * ramal de inspeção saindo da face externa do principal em +Y (sem subtração de furo; o furo vem com o CSG, ficha F-CSG).
 * Ce = De/2 + Lf. Luva: anel de comprimento Ll = 2 Lf. União: luva mais porca sólida de diâmetro 1,4 De no meio (v1, sem furo).
 * Redução: transição sólida de círculos, excêntrica (geratriz inferior alinhada), comprimento Lr = De (v1, maciça).
 */

const DISTANCIA_EIXO_PONTA = derivado('Ce', 'Distância eixo-ponta', 'De / 2 + Lf');
const COMPRIMENTO_LUVA = derivado('Ll', 'Comprimento da luva', '2 * Lf');
const DIAMETRO_PORCA = derivado('Dp', 'Diâmetro da porca da união', 'De * 1.4');

/** Corpo principal de tê: anel de −Ce a +Ce em X (rotação [0, 90, 0] leva +Z para +X). */
const PRINCIPAL_T = corpoAgua(
  'principal',
  'Ramal principal',
  'conexao',
  { tipo: 'extrusao', perfil: anelAgua(), comprimento: '2 * Ce' },
  { origem: ['0 - Ce', '0', '0'], rotacao: ['0', '90', '0'] },
);

/** Caixa nominal de tê por DN: comprimento 2 Ce, altura De, profundidade Ce (ramal em +Y). */
const caixaT = (dn: number): Record<string, number> => {
  const ce = dn / 2 + encaixeDe(dn);
  return { L: mm(2 * ce), A: dn, P: mm(ce) };
};

export const FAMILIA_AGUA_FRIA_TE: Familia = familiaAgua({
  id: 'fam_agua_fria_te',
  nome: 'Tê de água fria',
  categoria: 'conexao_tubo',
  descricao: 'Tê de PVC soldável para água fria: ramal principal em X (pontas A e B) e ramal de inspeção em +Y (ponta C). Ramal começa na face externa do principal.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 25),
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
    corpoAgua('ramal', 'Ramal', 'conexao', { tipo: 'extrusao', perfil: anelAgua(), comprimento: 'Lf' }, { origem: ['0', 'De / 2', '0'], rotacao: ['-90', '0', '0'] }),
  ],
  ligacoes: [
    ligacaoAgua('a', 'Ponta A', ['0 - Ce', '0', '0'], ['-1', '0', '0'], 'De'),
    ligacaoAgua('b', 'Ponta B', ['Ce', '0', '0'], ['1', '0', '0'], 'De'),
    ligacaoAgua('c', 'Ponta C', ['0', 'Ce', '0'], ['0', '1', '0'], 'De'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' },
  tipos: tiposPorDn(caixaT),
  tipoPadrao: 'dn25',
});

export const FAMILIA_AGUA_FRIA_LUVA: Familia = familiaAgua({
  id: 'fam_agua_fria_luva',
  nome: 'Luva de água fria',
  categoria: 'conexao_tubo',
  descricao: 'Luva de união de PVC soldável para água fria: anel De × (De − 2e) de comprimento Ll = 2 Lf, com as duas pontas do mesmo DN.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 25),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    COMPRIMENTO_LUVA,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [corpoAgua('luva', 'Luva', 'conexao', { tipo: 'extrusao', perfil: anelAgua(), comprimento: 'Ll' }, { origem: ['0', '0', '0'] })],
  ligacoes: [ligacaoAgua('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'), ligacaoAgua('b', 'Ponta B', ['0', '0', 'Ll'], ['0', '0', '1'], 'De')],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'CONNECTOR' },
  tipos: tiposPorDn((dn) => ({ L: dn, A: mm(2 * encaixeDe(dn)), P: dn })),
  tipoPadrao: 'dn25',
});

export const FAMILIA_AGUA_FRIA_UNIAO: Familia = familiaAgua({
  id: 'fam_agua_fria_uniao',
  nome: 'União de água fria',
  categoria: 'conexao_tubo',
  descricao: 'União de PVC soldável para água fria: luva de comprimento Ll = 2 Lf com porca sólida de diâmetro 1,4 De no meio (v1, sem furo). Duas pontas do mesmo DN.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 25),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    COMPRIMENTO_LUVA,
    DIAMETRO_PORCA,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    corpoAgua('uniao', 'Corpo da união', 'conexao', { tipo: 'extrusao', perfil: anelAgua(), comprimento: 'Ll' }, { origem: ['0', '0', '0'] }),
    // CONFERIR: a porca real é oca e rosqueada; na v1 é um cilindro sólido de comprimento Lf centrado no meio da união.
    corpoAgua('porca', 'Porca', 'conexao', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'Dp' }, comprimento: 'Lf' }, { origem: ['0', '0', 'Lf / 2'] }),
  ],
  ligacoes: [ligacaoAgua('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'), ligacaoAgua('b', 'Ponta B', ['0', '0', 'Ll'], ['0', '0', '1'], 'De')],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'UNION' },
  tipos: tiposPorDn((dn) => ({ L: mm(1.4 * dn), A: mm(2 * encaixeDe(dn)), P: mm(1.4 * dn) })),
  tipoPadrao: 'dn25',
});

/** Tipo de redução: DN maior e DN menor; a caixa é De (maior) em X, Z e Y (Lr = De). */
const tipoReducao = (dn: number, dn2: number): Tipo => ({ id: `r${dn}_${dn2}`, nome: `Redução DN ${dn} × ${dn2}`, valores: { DN: dn, DN2: dn2, L: dn, A: dn, P: dn } });

export const FAMILIA_AGUA_FRIA_REDUCAO: Familia = familiaAgua({
  id: 'fam_agua_fria_reducao',
  nome: 'Redução excêntrica de água fria',
  categoria: 'conexao_tubo',
  descricao: 'Redução excêntrica de PVC soldável para água fria, do DN maior (ponta A) ao DN menor (ponta B), com as geratrizes inferiores alinhadas. Maciça na v1 (transição de círculos), comprimento Lr = De.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal maior (DN)', 25),
    parametroDn('DN2', 'Diâmetro nominal menor (DN2)', 20),
    parametroDe('DN'),
    parametroDe('DN2', 'De2', 'Diâmetro externo menor'),
    derivado('Lr', 'Comprimento da redução', 'De'),
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ],
  corpos: [
    corpoAgua(
      'reducao',
      'Redução excêntrica',
      'conexao',
      { tipo: 'transicao', perfilA: { tipo: 'circulo', diametro: 'De' }, perfilB: { tipo: 'circulo', diametro: 'De2' }, comprimento: 'Lr', desvio: ['0', '(De - De2) / 2'] },
      { origem: ['0', '0', '0'] },
    ),
  ],
  ligacoes: [
    ligacaoAgua('a', 'Ponta A (maior)', ['0', '0', '0'], ['0', '0', '-1'], 'De'),
    ligacaoAgua('b', 'Ponta B (menor)', ['0', '(De - De2) / 2', 'Lr'], ['0', '0', '1'], 'De2'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'TRANSITION' },
  tipos: [tipoReducao(25, 20), tipoReducao(32, 25), tipoReducao(40, 32), tipoReducao(50, 40), tipoReducao(75, 50), tipoReducao(110, 75)],
  tipoPadrao: 'r25_20',
});
