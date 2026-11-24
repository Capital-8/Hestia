import type { BotaoAba, PainelAba } from './familiaAbaAcoes.ts';

/*
 * Painéis das abas Vista e Gerenciar (ficha G2). Estilo e nível de detalhe gravam campos do editor; vistas padrão
 * trocam a vista; Gerenciar abre os diálogos que já existem. O que ainda não existe fica desabilitado com o motivo.
 */

const B = (rotulo: BotaoAba['rotulo'], icone: string, o: Omit<BotaoAba, 'rotulo' | 'icone'> = {}): BotaoAba => ({ rotulo, icone, ...o });

export const PAINEIS_VISTA: PainelAba[] = [
  {
    titulo: 'fa_pn_estilo',
    botoes: [
      B('fa_b_sombreado', 'curtain', { ajusta: { opacidade: 1 } }),
      B('fa_b_transparente', 'layers', { ajusta: { opacidade: 0.35 } }),
      B('fa_b_arame', 'trim', { indisponivel: 'fa_m_nao_existe' }),
      B('fa_b_grosso', 'slab', { ajusta: { detalhe: 'grosso' } }),
      B('fa_b_medio', 'slab', { ajusta: { detalhe: 'medio' } }),
      B('fa_b_fino', 'slab', { ajusta: { detalhe: 'fino' } }),
    ],
  },
  {
    titulo: 'fa_pn_visibilidade',
    botoes: [
      B('fa_b_isolar', 'select', { indisponivel: 'fa_m_nao_existe' }),
      B('fa_b_planos', 'beam', { indisponivel: 'fa_m_nao_existe' }),
      B('fa_b_enquadrar', 'door', { indisponivel: 'fa_m_nao_existe' }),
    ],
  },
  {
    titulo: 'fa_pn_vista_padrao',
    botoes: [
      B('fa_b_3d', 'component', { ajusta: { vista: '3d' } }),
      B('fa_b_frente', 'wall', { ajusta: { vista: 'frente' } }),
      B('fa_b_lateral', 'wall', { ajusta: { vista: 'lateral' } }),
      B('fa_b_planta', 'slab', { ajusta: { vista: 'planta' } }),
    ],
  },
];

export const PAINEIS_GERENCIAR: PainelAba[] = [
  {
    titulo: 'fa_pn_dados',
    botoes: [
      B('fa_b_parametros', 'type', { abre: 'parametros' }),
      B('fa_b_tipos', 'layers', { abre: 'tipos' }),
      B('fa_b_encaixe', 'joins', { abre: 'encaixe' }),
      B('fa_b_catalogo', 'style', { abre: 'catalogo' }),
      B('fa_b_lista_pecas', 'schedule', { abre: 'pecas' }),
      B('fa_b_validar', 'sheet', { indisponivel: 'fa_m_validar' }),
    ],
  },
  {
    titulo: 'fa_pn_preferencias',
    botoes: [
      B('fa_b_materiais', 'style', { indisponivel: 'fa_m_nao_existe' }),
      B('fa_b_unidades', 'sheet', { indisponivel: 'fa_m_nao_existe' }),
      B('fa_b_captura', 'select', { indisponivel: 'fa_m_nao_existe' }),
    ],
  },
];
