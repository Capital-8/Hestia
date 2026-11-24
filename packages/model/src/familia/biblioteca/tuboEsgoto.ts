import type { Familia } from '../tipos.ts';
import { comprimento } from './novosApoio.ts';
import { anelEsgoto, corpoEsgoto, dimensao, familiaEsgoto, ligacaoEsgoto, parametroDe, parametroDn, parametroEspessura, tiposPorDn } from './tuboEsgotoApoio.ts';
import { FAMILIA_ESGOTO_CURVA45, FAMILIA_ESGOTO_CURVA90 } from './tuboEsgotoCurvas.ts';
import { FAMILIA_ESGOTO_JUNCAO45, FAMILIA_ESGOTO_LUVA, FAMILIA_ESGOTO_REDUCAO, FAMILIA_ESGOTO_TAMPAO, FAMILIA_ESGOTO_TE } from './tuboEsgotoConexoes.ts';

export { FAMILIA_TUBO_ESGOTO_PADRAO } from './tuboEsgotoApoio.ts';

/*
 * Tubulação de esgoto em PVC (ficha F1): o tubo reto e as conexões. Tubo reto = anel De × (De − 2e) de comprimento L, com a
 * ponta A na origem (sai para −Z) e a ponta B em z = L (sai para +Z). Conexões em `tuboEsgotoCurvas.ts` e `tuboEsgotoConexoes.ts`.
 * Dimensões de catálogo marcadas CONFERIR no apoio. Em todas, L, A e P são a caixa nominal do tipo (valor por DN).
 */

export const FAMILIA_TUBO_ESGOTO: Familia = familiaEsgoto({
  id: 'fam_tubo_esgoto',
  nome: 'Tubo de esgoto PVC (reto)',
  categoria: 'tubulacao',
  descricao: 'Tubo reto de PVC para esgoto: anel De × (De − 2e) ao longo do comprimento L (mm). Uma ligação em cada ponta, fluxo nos dois sentidos. DN 40 a 150.',
  parametros: [
    parametroDn('DN', 'Diâmetro nominal (DN)', 100),
    parametroDe('DN'),
    parametroEspessura('DN'),
    comprimento('L', 'Comprimento', 1000, 50, 6000, 10),
    dimensao('A', 'Altura (diâmetro externo)'),
    dimensao('P', 'Profundidade (diâmetro externo)'),
  ],
  corpos: [corpoEsgoto('tubo', 'Tubo', 'tubo', { tipo: 'extrusao', perfil: anelEsgoto(), comprimento: 'L' }, { origem: ['0', '0', '0'] })],
  ligacoes: [ligacaoEsgoto('a', 'Ponta A', ['0', '0', '0'], ['0', '0', '-1'], 'De'), ligacaoEsgoto('b', 'Ponta B', ['0', '0', 'L'], ['0', '0', '1'], 'De')],
  ifc: { classe: 'IFCPIPESEGMENT' },
  tipos: tiposPorDn((dn) => ({ L: 1000, A: dn, P: dn })),
  tipoPadrao: 'dn100',
});

/** Todas as famílias de tubulação de esgoto da biblioteca base (ficha F1): 8 famílias. */
export const TUBULACAO_ESGOTO: Familia[] = [
  FAMILIA_TUBO_ESGOTO,
  FAMILIA_ESGOTO_CURVA90,
  FAMILIA_ESGOTO_CURVA45,
  FAMILIA_ESGOTO_TE,
  FAMILIA_ESGOTO_JUNCAO45,
  FAMILIA_ESGOTO_LUVA,
  FAMILIA_ESGOTO_REDUCAO,
  FAMILIA_ESGOTO_TAMPAO,
];
