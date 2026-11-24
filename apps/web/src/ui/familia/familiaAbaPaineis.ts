import {
  copiarCorpo,
  copiarLigacao,
  copiarPeca,
  espelharLigacao,
  espelharPeca,
  inserirDetalhe,
  inserirLigacao,
  inserirSimbolo,
  type BotaoAba,
  type PainelAba,
} from './familiaAbaAcoes.ts';

/*
 * Painéis das abas Inserir, Modificar, Vista e Gerenciar (ficha G2). Botão sem ação real aparece desabilitado, com o
 * motivo no tooltip. Ações de Vista e Gerenciar só mudam o estado do editor ou abrem diálogos que já existem.
 */

const B = (rotulo: BotaoAba['rotulo'], icone: string, o: Omit<BotaoAba, 'rotulo' | 'icone'> = {}): BotaoAba => ({ rotulo, icone, ...o });

export const PAINEIS_INSERIR: PainelAba[] = [
  {
    titulo: 'fa_pn_familia',
    botoes: [
      B('fa_b_arquivo', 'sheet', { abre: 'arquivo' }),
      B('fa_b_aninhado', 'component', { abre: 'aninhado' }),
    ],
  },
  {
    titulo: 'fa_pn_componentes',
    botoes: [
      B('fa_b_ligacao', 'joins', { acao: inserirLigacao }),
      B('fa_b_simbolo', 'style', { acao: inserirSimbolo }),
      B('fa_b_detalhe', 'trim', { acao: inserirDetalhe }),
      B('fa_b_ferragem', 'layers', { abre: 'catalogo' }),
      B('fa_b_usinagem', 'schedule', { indisponivel: 'fa_m_usinagem' }),
      B('fa_b_dxf', 'sheet', { indisponivel: 'fa_m_nao_existe' }),
      B('fa_b_plano_ref', 'beam', { indisponivel: 'fa_m_nao_existe' }),
    ],
  },
];

export const PAINEIS_MODIFICAR: PainelAba[] = [
  {
    titulo: 'fa_pn_peca',
    botoes: [
      B('fa_b_espelhar', 'wall', { acao: espelharPeca, precisa: 'peca' }),
      B('fa_b_copiar_peca', 'paste', { acao: copiarPeca, precisa: 'peca' }),
      B('fa_b_mover', 'select', { indisponivel: 'fa_m_mover' }),
      B('fa_b_girar', 'undo', { indisponivel: 'fa_m_girar' }),
      B('fa_b_alinhar', 'beam', { indisponivel: 'fa_m_alinhar' }),
    ],
  },
  {
    titulo: 'fa_pn_ligacao',
    botoes: [
      B('fa_b_espelhar', 'wall', { acao: espelharLigacao, precisa: 'ligacao' }),
      B('fa_b_copiar_ligacao', 'paste', { acao: copiarLigacao, precisa: 'ligacao' }),
    ],
  },
  {
    titulo: 'fa_pn_corpo',
    botoes: [B('fa_b_copiar_corpo', 'paste', { acao: copiarCorpo, precisa: 'corpo' })],
  },
];
