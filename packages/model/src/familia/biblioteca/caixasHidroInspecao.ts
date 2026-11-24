import type { Familia } from '../tipos.ts';
import { familiaCaixa, ligacoesLaterais, paredeCircular, paredeRetangular, parametrosCaixa, simboloPlanta, TABELAS_CAIXA, tiposCaixa, verificacoesCaixa } from './caixasHidroApoio.ts';

/*
 * Caixas de inspeção (ficha F3): quadrada e circular. Parede, fundo e tampa são corpos; a entrada e a saída são ligações nas
 * faces laterais (X), com a cota de fundo de cada tubulação. Sem subtração de furo (D9): a ligação marca o ponto de encaixe.
 */

export const FAMILIA_CAIXA_QUADRADA: Familia = familiaCaixa({
  id: 'fam_caixa_inspecao_quadrada',
  nome: 'Caixa de inspeção quadrada',
  descricao: 'Caixa de inspeção de planta quadrada: parede, fundo e tampa; entrada e saída laterais no DN do tipo. CONFERIR dimensões.',
  parametros: parametrosCaixa(),
  tipos: tiposCaixa(),
  tipoPadrao: 'dn100',
  corpos: paredeRetangular(),
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('quadrado')],
  verificacoes: verificacoesCaixa(),
  tabelas: TABELAS_CAIXA,
});

export const FAMILIA_CAIXA_CIRCULAR: Familia = familiaCaixa({
  id: 'fam_caixa_inspecao_circular',
  nome: 'Caixa de inspeção circular',
  descricao: 'Caixa de inspeção de planta circular (L é o diâmetro externo): parede de anel, fundo e tampa; entrada e saída laterais. CONFERIR dimensões.',
  parametros: parametrosCaixa(),
  tipos: tiposCaixa(),
  tipoPadrao: 'dn100',
  corpos: paredeCircular(),
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('circulo')],
  verificacoes: verificacoesCaixa(),
  tabelas: TABELAS_CAIXA,
});
