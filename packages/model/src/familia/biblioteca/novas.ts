import type { Familia } from '../tipos.ts';
import { CONJUNTOS } from './conjuntos.ts';
import { MARCENARIA_NOVA } from './marcenariaNovos.ts';
import { EQUIPAMENTOS_COZINHA } from './equipamentosCozinha.ts';
import { EQUIPAMENTOS_OUTROS } from './equipamentosOutros.ts';
import { GENERICOS_NOVOS, LOUCAS_NOVAS } from './genericosLoucas.ts';
import { SOFAS_CAMAS } from './sofasCamas.ts';
import { ASSENTOS_NOVOS } from './assentos.ts';
import { MESAS_APOIO } from './mesasApoio.ts';
import { MESAS_ESCRITORIO } from './mesasEscritorio.ts';
import { MESAS_JANTAR } from './mesasJantar.ts';

/** Famílias novas da Biblioteca (ficha "famílias novas"), agrupadas por arquivo. */
export const NOVAS: Familia[] = [...MESAS_JANTAR, ...MESAS_APOIO, ...MESAS_ESCRITORIO, ...ASSENTOS_NOVOS, ...SOFAS_CAMAS, ...CONJUNTOS, ...MARCENARIA_NOVA, ...EQUIPAMENTOS_COZINHA, ...EQUIPAMENTOS_OUTROS, ...GENERICOS_NOVOS, ...LOUCAS_NOVAS];
