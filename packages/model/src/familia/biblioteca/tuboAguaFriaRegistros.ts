import type { Familia, Parametro } from '../tipos.ts';
import { derivado } from './novosApoio.ts';
import { corpoAgua, dimensao, encaixeDe, familiaAgua, ligacaoAgua, mm, parametroDe, parametroDn, parametroEncaixe, parametroEspessura, tiposPorDn } from './tuboAguaFriaApoio.ts';

/*
 * Registros de água fria (ficha F2). Corpo cilíndrico de diâmetro Dc = 1,6 De, com eixo em X: as pontas são as soldáveis de DN
 * (ligações A em −X e B em +X, saindo para fora). Haste vertical (+Z) de diâmetro 0,5 De e volante no topo. Gaveta: volante
 * circular (disco de diâmetro Dv = 1,8 De). Pressão: volante em alavanca (retângulo de Dv × 0,4 De). Ambos maciços na v1.
 * Caixa nominal: L no eixo X, A no eixo Z (topo do volante), P no eixo Y. Dimensões de volante e haste são CONFERIR (catálogo).
 */

const DISTANCIA_EIXO_PONTA = derivado('Ce', 'Distância eixo-ponta', 'De / 2 + Lf');
const DIAMETRO_CORPO = derivado('Dc', 'Diâmetro do corpo', 'De * 1.6');
const ALTURA_HASTE = derivado('Hh', 'Altura da haste acima do eixo', 'De');
const ESPESSURA_VOLANTE = derivado('Hv', 'Espessura do volante', 'De * 0.3');
const DIAMETRO_VOLANTE = derivado('Dv', 'Diâmetro do volante', 'De * 1.8');

/** Parâmetros comuns aos dois registros (bitola, pontas, corpo, haste e volante). */
function parametrosRegistro(): Parametro[] {
  return [
    parametroDn('DN', 'Diâmetro nominal (DN)', 25),
    parametroDe('DN'),
    parametroEspessura('DN'),
    parametroEncaixe('DN'),
    DISTANCIA_EIXO_PONTA,
    DIAMETRO_CORPO,
    ALTURA_HASTE,
    ESPESSURA_VOLANTE,
    DIAMETRO_VOLANTE,
    dimensao('L', 'Largura'),
    dimensao('A', 'Altura'),
    dimensao('P', 'Profundidade'),
  ];
}

/** Corpo cilíndrico de eixo X entre as duas pontas, e a haste vertical até o eixo do volante. */
const corpoRegistro = () => [
  corpoAgua('corpo', 'Corpo do registro', 'conexao', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'Dc' }, comprimento: '2 * Ce' }, { origem: ['0 - Ce', '0', '0'], rotacao: ['0', '90', '0'] }),
  corpoAgua('haste', 'Haste', 'conexao', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'De * 0.5' }, comprimento: 'Dc / 2 + Hh' }, { origem: ['0', '0', '0'] }),
];

/** Ligações nas duas pontas soldáveis, saindo do corpo em −X e +X. */
const ligacoesRegistro = () => [
  ligacaoAgua('a', 'Ponta A', ['0 - Ce', '0', '0'], ['-1', '0', '0'], 'De'),
  ligacaoAgua('b', 'Ponta B', ['Ce', '0', '0'], ['1', '0', '0'], 'De'),
];

/** Caixa nominal por DN: comprimento dn + 2 Lf, altura 2,1 dn (topo do volante), profundidade `prof` × dn. */
const caixaRegistro = (prof: number) => (dn: number): Record<string, number> => ({
  L: mm(dn + 2 * encaixeDe(dn)),
  A: mm(2.1 * dn),
  P: mm(prof * dn),
});

export const FAMILIA_AGUA_FRIA_REGISTRO_GAVETA: Familia = familiaAgua({
  id: 'fam_agua_fria_registro_gaveta',
  nome: 'Registro de gaveta de água fria',
  categoria: 'conexao_tubo',
  descricao: 'Registro de gaveta de PVC para água fria: corpo cilíndrico com duas pontas soldáveis (A e B), haste e volante circular no topo. Maciço na v1.',
  parametros: parametrosRegistro(),
  corpos: [
    ...corpoRegistro(),
    // CONFERIR: volante e haste de catálogo; aqui um disco de diâmetro Dv sobre a haste.
    corpoAgua('volante', 'Volante', 'conexao', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'Dv' }, comprimento: 'Hv' }, { origem: ['0', '0', 'Dc / 2 + Hh'] }),
  ],
  ligacoes: ligacoesRegistro(),
  ifc: { classe: 'IFCPIPEFITTING' },
  tipos: tiposPorDn(caixaRegistro(1.8)),
  tipoPadrao: 'dn25',
});

export const FAMILIA_AGUA_FRIA_REGISTRO_PRESSAO: Familia = familiaAgua({
  id: 'fam_agua_fria_registro_pressao',
  nome: 'Registro de pressão de água fria',
  categoria: 'conexao_tubo',
  descricao: 'Registro de pressão de PVC para água fria: corpo cilíndrico com duas pontas soldáveis (A e B), haste e volante em alavanca no topo. Maciço na v1.',
  parametros: parametrosRegistro(),
  corpos: [
    ...corpoRegistro(),
    // CONFERIR: alavanca de catálogo; aqui uma placa retangular de Dv × 0,4 De sobre a haste.
    corpoAgua(
      'volante',
      'Alavanca',
      'conexao',
      { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'Dv', altura: 'De * 0.4' }, comprimento: 'Hv' },
      { origem: ['0', '0', 'Dc / 2 + Hh'] },
    ),
  ],
  ligacoes: ligacoesRegistro(),
  ifc: { classe: 'IFCPIPEFITTING' },
  tipos: tiposPorDn(caixaRegistro(1.6)),
  tipoPadrao: 'dn25',
});
