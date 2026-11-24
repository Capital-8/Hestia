import type { Familia } from '../tipos.ts';
import { derivado } from './novosApoio.ts';
import { anelEletrico, corpoEletrico, deDn, deEletrico, dimensao, DNS_ELETRICO, espessuraEletrica, familiaEletrica, ligacaoEletrica, parametroDnEletrico, tiposDn } from './eletricaApoio.ts';

/*
 * Eletrodutos rígidos (ficha F5): tubo reto, curva de 90° e luva. O tubo é o anel De × (De − 2e) de comprimento L, com a ponta A
 * na origem (sai para −Z) e a ponta B em z = L (sai para +Z). A curva é varredura sobre A(0,0,0) → P(0,0,Rc) → E(Rc,0,Rc), com
 * raio Rc = 4 De (CONFERIR: raio mínimo de catálogo). A luva é um anel curto de parede mais grossa, com 6 mm a mais que o De.
 * Os L, A e P de cada tipo são a caixa nominal do DN (valores por DN, calculados com as mesmas tabelas das fórmulas).
 */

const RAIO_CURVA_ELETRICA = derivado('Rc', 'Raio de curva', '4 * De');

export const FAMILIA_ELETRODUTO_RIGIDO: Familia = familiaEletrica({
  id: 'fam_eletroduto_rigido',
  nome: 'Eletroduto rígido de PVC',
  categoria: 'eletroduto',
  descricao: 'Eletroduto rígido de PVC: anel De × (De − 2e) ao longo do comprimento L (mm). Uma ligação em cada ponta, fluxo nos dois sentidos. DN 20 a 50. CONFERIR dimensões (NBR 15465).',
  parametros: [parametroDnEletrico(), deEletrico(), espessuraEletrica(), dimensao('L', 'Comprimento', 1000), dimensao('A', 'Altura (diâmetro externo)', 25), dimensao('P', 'Profundidade (diâmetro externo)', 25)],
  corpos: [corpoEletrico('tubo', 'Eletroduto', 'tubo', { tipo: 'extrusao', perfil: anelEletrico(), comprimento: 'L' }, { origem: ['0', '0', '0'] })],
  ligacoes: [ligacaoEletrica('a', 'Ponta A', 'eletroduto', ['0', '0', '0'], ['0', '0', '-1']), ligacaoEletrica('b', 'Ponta B', 'eletroduto', ['0', '0', 'L'], ['0', '0', '1'])],
  ifc: { classe: 'IFCCABLECARRIERSEGMENT', tipoPredefinido: 'CONDUITSEGMENT' },
  tipos: tiposDn(DNS_ELETRICO, (dn) => ({ L: 1000, A: deDn(dn), P: deDn(dn) })),
  tipoPadrao: 'dn20',
});

export const FAMILIA_ELETRODUTO_CURVA90: Familia = familiaEletrica({
  id: 'fam_eletroduto_curva90',
  nome: 'Curva 90° de eletroduto',
  categoria: 'eletroduto',
  descricao: 'Curva de 90° de PVC para eletroduto, varrida pelo anel De × (De − 2e) sobre um arco de raio Rc = 4 De. Ponta A na origem (sai para −Z) e ponta B em (Rc, 0, Rc) (sai para +X). CONFERIR raio.',
  parametros: [parametroDnEletrico(), deEletrico(), espessuraEletrica(), RAIO_CURVA_ELETRICA, dimensao('L', 'Largura', 112), dimensao('A', 'Altura', 112), dimensao('P', 'Profundidade', 25)],
  corpos: [
    corpoEletrico(
      'curva',
      'Curva 90°',
      'conexao',
      { tipo: 'varredura', perfil: anelEletrico(), caminho: { pontos: [['0', '0', '0'], ['0', '0', 'Rc'], ['Rc', '0', 'Rc']], raios: ['Rc'] } },
      { origem: ['0', '0', '0'] },
    ),
  ],
  ligacoes: [ligacaoEletrica('a', 'Ponta A', 'eletroduto', ['0', '0', '0'], ['0', '0', '-1']), ligacaoEletrica('b', 'Ponta B', 'eletroduto', ['Rc', '0', 'Rc'], ['1', '0', '0'])],
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'BEND' },
  tipos: tiposDn(DNS_ELETRICO, (dn) => ({ L: caixaCurva(deDn(dn)), A: caixaCurva(deDn(dn)), P: deDn(dn) })),
  tipoPadrao: 'dn20',
});

export const FAMILIA_ELETRODUTO_LUVA: Familia = familiaEletrica({
  id: 'fam_eletroduto_luva',
  nome: 'Luva de eletroduto',
  categoria: 'eletroduto',
  descricao: 'Luva de PVC para unir dois trechos de eletroduto: anel curto de parede grossa (De + 6 mm externo, De interno), com uma ligação em cada ponta. CONFERIR dimensões.',
  parametros: [parametroDnEletrico(), deEletrico(), dimensao('L', 'Comprimento', 50), dimensao('A', 'Altura (diâmetro externo)', 31), dimensao('P', 'Profundidade (diâmetro externo)', 31)],
  corpos: [corpoEletrico('luva', 'Luva', 'conexao', { tipo: 'extrusao', perfil: { tipo: 'anel', diametroExterno: 'De + 6', diametroInterno: 'De' }, comprimento: 'L' }, { origem: ['0', '0', '0'] })],
  ligacoes: [ligacaoEletrica('a', 'Ponta A', 'eletroduto', ['0', '0', '0'], ['0', '0', '-1']), ligacaoEletrica('b', 'Ponta B', 'eletroduto', ['0', '0', 'L'], ['0', '0', '1'])],
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'OTHER' },
  tipos: tiposDn(DNS_ELETRICO, (dn) => ({ L: 2 * deDn(dn), A: deDn(dn) + 6, P: deDn(dn) + 6 })),
  tipoPadrao: 'dn20',
});

/** Caixa nominal da curva (raio + meio diâmetro), arredondada a 0,1 mm: 4,5 De em X e Z. */
function caixaCurva(de: number): number {
  return Math.round(de * 4.5 * 10) / 10;
}

/** Eletrodutos e conexões rígidas do ramo elétrico (ficha F5). */
export const ELETRODUTOS: Familia[] = [FAMILIA_ELETRODUTO_RIGIDO, FAMILIA_ELETRODUTO_CURVA90, FAMILIA_ELETRODUTO_LUVA];
