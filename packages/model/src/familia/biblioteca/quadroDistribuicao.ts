import type { Familia, Parametro } from '../tipos.ts';
import type { Corpo, Ponto3 } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import { corpoEletrico, dimensao, ESPESSURA_CAIXA, familiaEletrica } from './eletricaApoio.ts';
import { derivado } from './novosApoio.ts';

/*
 * Quadro de distribuição elétrico (ficha C4). Caixa de chapa genérica: a face (porta) fica em y = 0 e o corpo cresce para +Y, como
 * as caixas de luz. TODAS as medidas são GENÉRICAS e EDITÁVEIS, marcadas CONFERIR: não representam produto de fabricante. Barramento
 * e disjuntores por dentro não são modelados; `posicoes` é só o número de posições de disjuntor (dado para o projeto de circuitos).
 * As entradas de eletroduto são ligações do domínio `eletroduto` com diâmetro = DN do tipo (20, 25 ou 32 mm, como o eletroduto
 * rígido soldável da Krona elétrica, cujo diâmetro externo é o próprio DN): o eletroduto liga no quadro como numa caixa de luz.
 */

export const ID_QUADRO_ELETRICO = 'fam_quadro_distribuicao_eletrico';
/** Posições de disjuntor do tipo inicial (CONFERIR: valor genérico). */
export const POSICOES_PADRAO = 12;
const DNS_QUADRO = [20, 25, 32] as const;
const FACE: Ponto3 = ['-90', '0', '0'];

const PARAM_POSICOES: Parametro = { id: 'posicoes', nome: 'Posições de disjuntor, CONFERIR', tipo: 'inteiro', escopo: 'instancia', padrao: POSICOES_PADRAO, min: 1, max: 96, passo: 1, grupo: 'Elétrica' };
const PARAM_DN: Parametro = { id: 'DN', nome: 'Diâmetro nominal da entrada de eletroduto (DN)', tipo: 'enum', escopo: 'tipo', padrao: 20, grupo: 'Bitola', opcoes: DNS_QUADRO.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) };

const entrada = (id: string, nome: string, posicao: Ponto3, direcao: Ponto3): Ligacao => ({
  id, nome, dominio: 'eletroduto', sistema: 'Eletroduto', secao: 'redonda', posicao, direcao, diametro: 'DN', fluxo: 'ambos',
});

const corpos: Corpo[] = [
  corpoEletrico('porta', 'Porta', 'tampa', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'A' }, comprimento: 'e' }, { origem: ['L / 2', '0', 'A / 2'], rotacao: FACE }),
  corpoEletrico('parede', 'Caixa', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'A', espessura: 'e' }, comprimento: 'P - 2 * e' }, { origem: ['L / 2', 'e', 'A / 2'], rotacao: FACE }),
  corpoEletrico('fundo', 'Fundo', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'A' }, comprimento: 'e' }, { origem: ['L / 2', 'P - e', 'A / 2'], rotacao: FACE }),
];

/** Quadro de distribuição genérico: L × A × P editáveis, `posicoes` de disjuntor e quatro entradas de eletroduto (duas em cima, duas embaixo). */
export const FAMILIA_QUADRO_ELETRICO: Familia = familiaEletrica({
  id: ID_QUADRO_ELETRICO,
  nome: 'Quadro de distribuição (genérico)',
  categoria: 'dispositivo_eletrico',
  descricao: 'Quadro de distribuição genérico de chapa: porta em y = 0, caixa e fundo. Largura, altura, profundidade e número de posições de disjuntor são EDITÁVEIS e genéricos (CONFERIR), não de fabricante. Quatro entradas de eletroduto (duas em cima e duas embaixo) no DN do tipo (20, 25 ou 32).',
  hospedagem: 'parede',
  parametros: [PARAM_DN, dimensao('L', 'Largura, CONFERIR', 400), dimensao('A', 'Altura, CONFERIR', 500), dimensao('P', 'Profundidade, CONFERIR', 120), PARAM_POSICOES, derivado('e', 'Espessura da chapa, CONFERIR', ESPESSURA_CAIXA)],
  corpos,
  ligacoes: [
    entrada('a', 'Entrada superior esquerda', ['L / 3', 'P / 2', 'A'], ['0', '0', '1']),
    entrada('b', 'Entrada superior direita', ['2 * L / 3', 'P / 2', 'A'], ['0', '0', '1']),
    entrada('c', 'Entrada inferior esquerda', ['L / 3', 'P / 2', '0'], ['0', '0', '-1']),
    entrada('d', 'Entrada inferior direita', ['2 * L / 3', 'P / 2', '0'], ['0', '0', '-1']),
  ],
  ifc: { classe: 'IFCBUILDINGELEMENTPROXY' }, // não há classe de quadro em ClasseIfc; igual ao quadro de exemplo
  tipos: DNS_QUADRO.map((dn) => ({ id: `dn${dn}`, nome: `DN ${dn} (${POSICOES_PADRAO} posições)`, valores: { DN: dn, L: 400, A: 500, P: 120, posicoes: POSICOES_PADRAO } })),
  // DN 20: o mesmo da ferramenta Eletroduto e das entradas das caixas de luz da Krona (ficha C8a); com o DN 25 o eletroduto padrão não ligava no quadro.
  tipoPadrao: 'dn20',
});

/** Famílias de quadro do ramo elétrico. UMA lista própria: a lista `ELETRICA` da F5 tem teste de ids exatos. */
export const QUADROS_ELETRICOS: Familia[] = [FAMILIA_QUADRO_ELETRICO];
