/*
 * Texto do menu de contexto 'Criar tubo a partir daqui' (ficha F5): começa o traçado na porta livre da peça selecionada ou no meio do
 * tubo clicado. Shard próprio: `familias.ts` só importa e espalha. Paridade PT/EN/ES/DE/FR/IT/PL pelo tipo `D`.
 */

export const PT_TUBOAQUI = {
  tubo_aqui_menu: 'Criar tubo a partir daqui',
  tubo_aqui_menu_eletroduto: 'Criar eletroduto a partir daqui',
} as const;

type D = Record<keyof typeof PT_TUBOAQUI, string>;

export const EN_TUBOAQUI: D = { tubo_aqui_menu: 'Create Pipe From Here', tubo_aqui_menu_eletroduto: 'Create Conduit From Here' };
export const ES_TUBOAQUI: D = { tubo_aqui_menu: 'Crear tubo desde aquí', tubo_aqui_menu_eletroduto: 'Crear conducto desde aquí' };
export const DE_TUBOAQUI: D = { tubo_aqui_menu: 'Rohr von hier aus erstellen', tubo_aqui_menu_eletroduto: 'Leerrohr von hier aus erstellen' };
export const FR_TUBOAQUI: D = { tubo_aqui_menu: 'Créer un tuyau à partir d’ici', tubo_aqui_menu_eletroduto: 'Créer un conduit à partir d’ici' };
export const IT_TUBOAQUI: D = { tubo_aqui_menu: 'Crea tubo da qui', tubo_aqui_menu_eletroduto: 'Crea tubo protettivo da qui' };
export const PL_TUBOAQUI: D = { tubo_aqui_menu: 'Utwórz rurę od tego miejsca', tubo_aqui_menu_eletroduto: 'Utwórz rurę instalacyjną od tego miejsca' };
