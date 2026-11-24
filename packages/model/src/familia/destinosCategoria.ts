import { ROTULO_CATEGORIA } from './categorias.ts';
import type { CategoriaFamilia } from './tipos.ts';

/*
 * Destino de cada categoria na faixa (fase 2, ficha J1): UMA tabela diz em que aba e painel a família aparece. A categoria que a
 * pessoa escolhe no editor decide sozinha onde ela vai, e a paleta (J2), as abas Sistemas, Aço e Estrutura (J3) e as listas de
 * quantitativo e IFC (J4) leem esta mesma tabela. Só dados e funções puras.
 */

export type AbaFamilia = 'arquitetura' | 'sistemas' | 'estrutura';
export type PainelFamilia = 'componentes' | 'hidraulica' | 'eletrico' | 'hvac' | 'perfis' | 'chapas';

export interface DestinoCategoria {
  aba: AbaFamilia;
  painel: PainelFamilia;
}

export const DESTINO_DA_CATEGORIA: Readonly<Record<CategoriaFamilia, DestinoCategoria>> = {
  marcenaria: { aba: 'arquitetura', painel: 'componentes' },
  mobiliario: { aba: 'arquitetura', painel: 'componentes' },
  loucas: { aba: 'arquitetura', painel: 'componentes' },
  equipamento: { aba: 'arquitetura', painel: 'componentes' },
  generico: { aba: 'arquitetura', painel: 'componentes' },
  tubulacao: { aba: 'sistemas', painel: 'hidraulica' },
  conexao_tubo: { aba: 'sistemas', painel: 'hidraulica' },
  terminal_hidraulico: { aba: 'sistemas', painel: 'hidraulica' },
  reservatorio: { aba: 'sistemas', painel: 'hidraulica' },
  eletroduto: { aba: 'sistemas', painel: 'eletrico' },
  dispositivo_eletrico: { aba: 'sistemas', painel: 'eletrico' },
  luminaria: { aba: 'sistemas', painel: 'eletrico' },
  duto: { aba: 'sistemas', painel: 'hvac' },
  terminal_ar: { aba: 'sistemas', painel: 'hvac' },
  perfil_estrutural: { aba: 'estrutura', painel: 'perfis' },
  chapa_estrutural: { aba: 'estrutura', painel: 'chapas' },
};

/** Painéis de família da faixa, na ordem em que aparecem, com o texto do botão. */
export const PAINEIS_FAMILIA: ReadonlyArray<{ id: PainelFamilia; aba: AbaFamilia; rotulo: string }> = [
  { id: 'componentes', aba: 'arquitetura', rotulo: 'Componentes' },
  { id: 'hidraulica', aba: 'sistemas', rotulo: 'Hidráulica e tubulação' },
  { id: 'eletrico', aba: 'sistemas', rotulo: 'Elétrico' },
  { id: 'hvac', aba: 'sistemas', rotulo: 'HVAC' },
  { id: 'perfis', aba: 'estrutura', rotulo: 'Perfis' },
  { id: 'chapas', aba: 'estrutura', rotulo: 'Chapas e conexões' },
];

/** Categorias que um painel mostra, na ordem da tabela de rótulos. */
export function categoriasDoPainel(painel: PainelFamilia): CategoriaFamilia[] {
  return (Object.keys(ROTULO_CATEGORIA) as CategoriaFamilia[]).filter((c) => DESTINO_DA_CATEGORIA[c].painel === painel);
}

/** Categorias de uma aba (ex.: tudo o que vai para Sistemas). */
export function categoriasDaAba(aba: AbaFamilia): CategoriaFamilia[] {
  return (Object.keys(ROTULO_CATEGORIA) as CategoriaFamilia[]).filter((c) => DESTINO_DA_CATEGORIA[c].aba === aba);
}

export function destinoDaFamilia(categoria: CategoriaFamilia): DestinoCategoria {
  return DESTINO_DA_CATEGORIA[categoria];
}
