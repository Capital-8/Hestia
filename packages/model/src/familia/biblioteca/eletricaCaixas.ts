import type { Familia } from '../tipos.ts';
import type { Corpo, Ponto3, Perfil } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import { corpoEletrico, deEletrico, dimensao, ESPESSURA_CAIXA, familiaEletrica, ligacaoEletrica, parametroDnEletrico, tiposDn } from './eletricaApoio.ts';
import { derivado } from './novosApoio.ts';

/*
 * Caixas de embutir (ficha F5): 4×2, 4×4, octogonal e de passagem. A face da caixa é o plano XZ em y = 0 e a caixa cresce para
 * +Y (profundidade P). Parede, fundo e tampa são corpos; os eletrodutos entram por ligações nas faces laterais (X) e, na de
 * passagem, também em cima e embaixo. Medidas em mm; a caixa 4×2 é 100 × 50 (CONFERIR). Sem subtração de furo: a ligação marca o ponto.
 */

/** Rotação que leva a extrusão de +Z para +Y e a largura de +X para +X (Rx de −90°). */
const FACE: Ponto3 = ['-90', '0', '0'];

/** Parede da caixa retangular: anel retangular de `largura` (L) × `altura` (A) de comprimento `comp`, a partir de `y0`. */
function paredeRetangular(comp: string, y0: string): Corpo {
  const perfil: Perfil = { tipo: 'retanguloOco', largura: 'L', altura: 'A', espessura: 'e' };
  return corpoEletrico('parede', 'Parede', 'corpo', { tipo: 'extrusao', perfil, comprimento: comp }, { origem: ['L / 2', y0, 'A / 2'], rotacao: FACE });
}

/** Fundo (ou tampa) retangular de L × A e espessura `e`, em `y0`. */
function placaRetangular(id: string, nome: string, papel: 'corpo' | 'tampa', y0: string): Corpo {
  return corpoEletrico(id, nome, papel, { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'L', altura: 'A' }, comprimento: 'e' }, { origem: ['L / 2', y0, 'A / 2'], rotacao: FACE });
}

/** Parede circular da caixa octogonal: anel de diâmetro L e espessura `e`, de comprimento P − e. */
function paredeCircular(): Corpo {
  const perfil: Perfil = { tipo: 'anel', diametroExterno: 'L', diametroInterno: 'L - 2 * e' };
  return corpoEletrico('parede', 'Parede', 'corpo', { tipo: 'extrusao', perfil, comprimento: 'P - e' }, { origem: ['L / 2', '0', 'A / 2'], rotacao: FACE });
}

/** Diâmetro interno útil: verificação de eletroduto que não cabe na caixa. */
const CABE = [{ id: 'diametroCabe', severidade: 'erro' as const, condicao: 'De > L - 2 * e', mensagem: 'Eletroduto de DN {DN} não cabe na caixa de {L} mm' }];

/** Entradas laterais (−X e +X) a meia altura e meia profundidade. */
function ligacoesLaterais(): Ligacao[] {
  return [ligacaoEletrica('a', 'Entrada esquerda', 'eletroduto', ['0', 'P / 2', 'A / 2'], ['-1', '0', '0']), ligacaoEletrica('b', 'Entrada direita', 'eletroduto', ['L', 'P / 2', 'A / 2'], ['1', '0', '0'])];
}

const CAIXA_4X2 = familiaEletrica({
  id: 'fam_caixa_4x2',
  nome: 'Caixa de embutir 4×2',
  categoria: 'dispositivo_eletrico',
  descricao: 'Caixa de embutir 4×2 polegadas (100 × 50 mm, CONFERIR): parede e fundo, face aberta em y = 0. Entradas de eletroduto nas faces laterais, no DN do tipo.',
  hospedagem: 'parede',
  parametros: [parametroDnEletrico([20, 25], 20), deEletrico(), dimensao('L', 'Largura', 100), dimensao('A', 'Altura', 50), dimensao('P', 'Profundidade', 50), derivado('e', 'Espessura da parede', ESPESSURA_CAIXA)],
  corpos: [paredeRetangular('P - e', '0'), placaRetangular('fundo', 'Fundo', 'corpo', 'P - e')],
  ligacoes: ligacoesLaterais(),
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'OTHER' },
  tipos: tiposDn([20, 25], () => ({ L: 100, A: 50, P: 50 })),
  tipoPadrao: 'dn20',
  verificacoes: CABE,
});

const CAIXA_4X4 = familiaEletrica({
  id: 'fam_caixa_4x4',
  nome: 'Caixa de embutir 4×4',
  categoria: 'dispositivo_eletrico',
  descricao: 'Caixa de embutir 4×4 polegadas (100 × 100 mm, CONFERIR): parede e fundo, face aberta em y = 0. Entradas de eletroduto nas faces laterais, no DN do tipo.',
  hospedagem: 'parede',
  parametros: [parametroDnEletrico([20, 25, 32, 40], 20), deEletrico(), dimensao('L', 'Largura', 100), dimensao('A', 'Altura', 100), dimensao('P', 'Profundidade', 50), derivado('e', 'Espessura da parede', ESPESSURA_CAIXA)],
  corpos: [paredeRetangular('P - e', '0'), placaRetangular('fundo', 'Fundo', 'corpo', 'P - e')],
  ligacoes: ligacoesLaterais(),
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'OTHER' },
  tipos: tiposDn([20, 25, 32, 40], () => ({ L: 100, A: 100, P: 50 })),
  tipoPadrao: 'dn20',
  verificacoes: CABE,
});

const CAIXA_OCTOGONAL = familiaEletrica({
  id: 'fam_caixa_octogonal',
  nome: 'Caixa octogonal de embutir',
  categoria: 'dispositivo_eletrico',
  descricao: 'Caixa octogonal de teto (diâmetro L = A, CONFERIR): parede de anel circular e fundo, face aberta em y = 0. Entradas de eletroduto nas faces laterais, no DN do tipo. Modelada como circular (sem os oito lados).',
  hospedagem: 'parede',
  parametros: [parametroDnEletrico([20, 25], 20), deEletrico(), dimensao('L', 'Diâmetro', 100), dimensao('A', 'Altura', 100), dimensao('P', 'Profundidade', 50), derivado('e', 'Espessura da parede', ESPESSURA_CAIXA)],
  corpos: [paredeCircular(), corpoEletrico('fundo', 'Fundo', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L' }, comprimento: 'e' }, { origem: ['L / 2', 'P - e', 'A / 2'], rotacao: FACE })],
  ligacoes: ligacoesLaterais(),
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'OTHER' },
  tipos: tiposDn([20, 25], () => ({ L: 100, A: 100, P: 50 })),
  tipoPadrao: 'dn20',
  verificacoes: CABE,
});

const CAIXA_PASSAGEM = familiaEletrica({
  id: 'fam_caixa_passagem',
  nome: 'Caixa de passagem',
  categoria: 'dispositivo_eletrico',
  descricao: 'Caixa de passagem quadrada (150 × 150 mm, CONFERIR) com tampa parafusada em y = 0, fundo e parede. Entradas de eletroduto nas quatro faces: esquerda, direita, topo e base.',
  hospedagem: 'parede',
  parametros: [parametroDnEletrico([20, 25, 32, 40, 50], 25), deEletrico(), dimensao('L', 'Largura', 150), dimensao('A', 'Altura', 150), dimensao('P', 'Profundidade', 60), derivado('e', 'Espessura da parede', ESPESSURA_CAIXA)],
  corpos: [
    placaRetangular('tampa', 'Tampa', 'tampa', '0'),
    corpoEletrico('parede', 'Parede', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'A', espessura: 'e' }, comprimento: 'P - 2 * e' }, { origem: ['L / 2', 'e', 'A / 2'], rotacao: FACE }),
    placaRetangular('fundo', 'Fundo', 'corpo', 'P - e'),
  ],
  ligacoes: [
    ...ligacoesLaterais(),
    ligacaoEletrica('c', 'Entrada superior', 'eletroduto', ['L / 2', 'P / 2', 'A'], ['0', '0', '1']),
    ligacaoEletrica('d', 'Entrada inferior', 'eletroduto', ['L / 2', 'P / 2', '0'], ['0', '0', '-1']),
  ],
  ifc: { classe: 'IFCCABLECARRIERFITTING', tipoPredefinido: 'OTHER' },
  tipos: tiposDn([20, 25, 32, 40, 50], () => ({ L: 150, A: 150, P: 60 })),
  tipoPadrao: 'dn25',
  verificacoes: CABE,
});

/** Caixas de embutir e de passagem do ramo elétrico (ficha F5). */
export const CAIXAS_ELETRICAS: Familia[] = [CAIXA_4X2, CAIXA_4X4, CAIXA_OCTOGONAL, CAIXA_PASSAGEM];
