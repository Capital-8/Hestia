import type { Familia } from '../tipos.ts';
import type { Corpo } from '../tiposCorpo.ts';
import { corpoCaixa, familiaCaixa, ligacaoCaixa, parametrosRalo, parametrosSifao, simboloPlanta, tiposRalo } from './caixasHidroApoio.ts';

/*
 * Ralos (ficha F3): seco e sifonado. A cuba é REVOLUÇÃO de um perfil retangular (anel de parede, 64 segmentos); a grelha é um
 * disco maciço na tampa (CONFERIR: a grelha perfurada não é modelada). No sifonado, o trecho curvo é VARREDURA de um anel com
 * curva de 90° (raio = De), descendo e virando para a saída em +X. Medidas em mm; o diâmetro do ralo é L.
 */

/** Cuba do ralo: revolução de um perfil retangular [L/2 − e, L/2] × [0, A] em 360°. */
function cubaRalo(): Corpo {
  return corpoCaixa(
    'cuba',
    'Cuba do ralo',
    'corpo',
    {
      tipo: 'revolucao',
      perfil: {
        tipo: 'poligono',
        pontos: [
          ['L / 2 - e', '0'],
          ['L / 2', '0'],
          ['L / 2', 'A'],
          ['L / 2 - e', 'A'],
        ],
      },
      angulo: '360',
      segmentos: '64',
    },
    { origem: ['0', '0', '0'] },
  );
}

/** Grelha: disco maciço sobre a cuba, dentro da parede (CONFERIR: grelha perfurada não modelada). */
function grelhaRalo(): Corpo {
  return corpoCaixa('grelha', 'Grelha (maciça)', 'tampa', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'L - 2 * e' }, comprimento: 'et' }, { origem: ['0', '0', 'A - et'] });
}

export const FAMILIA_RALO_SECO: Familia = familiaCaixa({
  id: 'fam_ralo_seco',
  nome: 'Ralo seco',
  descricao: 'Ralo seco de piso: cuba cilíndrica com grelha maciça e saída vertical no fundo, no DN do tipo. CONFERIR dimensões.',
  parametros: parametrosRalo(),
  tipos: tiposRalo(),
  tipoPadrao: 'dn50',
  corpos: [cubaRalo(), grelhaRalo()],
  ligacoes: [ligacaoCaixa('saida', 'Saída', 'saida', ['0', '0', '0'], ['0', '0', '-1'])],
  simbolos: [simboloPlanta('circulo')],
  verificacoes: [{ id: 'diametroCabe', severidade: 'erro', condicao: 'DN > L', mensagem: 'DN {DN} maior que o diâmetro do ralo ({L} mm)' }],
});

/** Sifão do ralo: anel varrido por uma curva de 90° (descendo do fundo da cuba e virando para +X). */
const SIFAO: Corpo = corpoCaixa(
  'sifao',
  'Sifão (curva de 90°)',
  'conexao',
  {
    tipo: 'varredura',
    perfil: { tipo: 'anel', diametroExterno: 'De', diametroInterno: 'De - 2 * e' },
    caminho: {
      pontos: [
        ['0', '0', '0'],
        ['0', '0', '0 - Hc'],
        ['Lc', '0', '0 - Hc'],
      ],
      raios: ['Rc'],
      segmentosPorCurva: '12',
    },
  },
  { origem: ['0', '0', '0'] },
);

export const FAMILIA_RALO_SIFONADO: Familia = familiaCaixa({
  id: 'fam_ralo_sifonado',
  nome: 'Ralo sifonado',
  descricao: 'Ralo sifonado de piso: cuba com grelha maciça e sifão curvo de 90° para a saída em +X, no DN do tipo. CONFERIR dimensões.',
  parametros: [...parametrosRalo(), ...parametrosSifao()],
  tipos: tiposRalo(),
  tipoPadrao: 'dn50',
  corpos: [cubaRalo(), grelhaRalo(), SIFAO],
  ligacoes: [ligacaoCaixa('saida', 'Saída', 'saida', ['Lc', '0', '0 - Hc'], ['1', '0', '0'])],
  simbolos: [simboloPlanta('circulo')],
  verificacoes: [
    { id: 'diametroCabe', severidade: 'erro', condicao: 'DN > L', mensagem: 'DN {DN} maior que o diâmetro do ralo ({L} mm)' },
    { id: 'alturaFecho', severidade: 'aviso', condicao: 'A < 2 * De', mensagem: 'Altura de {A} mm pouca para o fecho hídrico do sifão (CONFERIR)' },
  ],
});
