import type { Familia } from '../tipos.ts';
import { comprimento } from './novosApoio.ts';
import { anelAgua, corpoAgua, dimensao, familiaAgua, ligacaoAgua, parametroDe, parametroDn, parametroEspessura, tiposPorDn } from './tuboAguaFriaApoio.ts';
import { FAMILIA_AGUA_FRIA_JOELHO45, FAMILIA_AGUA_FRIA_JOELHO90 } from './tuboAguaFriaCurvas.ts';
import { FAMILIA_AGUA_FRIA_REDUCAO, FAMILIA_AGUA_FRIA_TE, FAMILIA_AGUA_FRIA_UNIAO, FAMILIA_AGUA_FRIA_LUVA } from './tuboAguaFriaConexoes.ts';
import { FAMILIA_AGUA_FRIA_REGISTRO_GAVETA, FAMILIA_AGUA_FRIA_REGISTRO_PRESSAO } from './tuboAguaFriaRegistros.ts';

export { FAMILIA_TUBO_AGUA_FRIA_PADRAO } from './tuboAguaFriaApoio.ts';

/*
 * Tubulação de água fria em PVC soldável (ficha F2): o tubo reto, as conexões e os registros. Tubo reto = anel De × (De − 2e) de
 * comprimento L, com a ponta A na origem (sai para −Z) e a ponta B em z = L (sai para +Z). Demais peças em `tuboAguaFria*.ts`.
 * Dimensões de catálogo marcadas CONFERIR no apoio. Em todas, L, A e P são a caixa nominal do tipo (valor por DN).
 */

export const FAMILIA_TUBO_AGUA_FRIA: Familia = familiaAgua({
  id: 'fam_tubo_agua_fria',
  nome: 'Tubo de água fria PVC (reto)',
  categoria: 'tubulacao',
  descricao: 'Tubo reto de PVC soldável para água fria: anel De × (De − 2e) ao longo do comprimento L (mm). Uma ligação em cada ponta, fluxo nos dois sentidos. DN 20 a 110.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 25),
    parametroDe('DN'),
    parametroEspessura('DN'),
    comprimento('L', 'Comprimento', 1000, 50, 6000, 10),
    dimensao('A', 'Altura (diâmetro externo)'),
    dimensao('P', 'Profundidade (diâmetro externo)'),
  ],
  corpos: [corpoAgua('tubo', 'Tubo', 'tubo', { tipo: 'extrusao', perfil: anelAgua(), comprimento: 'L' }, { origem: ['0', '0', '0'] })],
  ligacoes: [ligacaoAgua('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'), ligacaoAgua('b', 'Ponta B', ['0', '0', 'L'], ['0', '0', '1'], 'De')],
  ifc: { classe: 'IFCPIPESEGMENT' },
  tipos: tiposPorDn((dn) => ({ L: 1000, A: dn, P: dn })),
  tipoPadrao: 'dn25',
});

/** Todas as famílias de tubulação de água fria (ficha F2): 9 famílias, uma por peça da lista da ficha. */
export const TUBULACAO_AGUA_FRIA: Familia[] = [
  FAMILIA_TUBO_AGUA_FRIA,
  FAMILIA_AGUA_FRIA_JOELHO90,
  FAMILIA_AGUA_FRIA_JOELHO45,
  FAMILIA_AGUA_FRIA_TE,
  FAMILIA_AGUA_FRIA_LUVA,
  FAMILIA_AGUA_FRIA_REDUCAO,
  FAMILIA_AGUA_FRIA_UNIAO,
  FAMILIA_AGUA_FRIA_REGISTRO_GAVETA,
  FAMILIA_AGUA_FRIA_REGISTRO_PRESSAO,
];
