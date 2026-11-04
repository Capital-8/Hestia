import type { Familia } from '../tipos.ts';
import { comEscolhas } from './escolhas.ts';
import { FAMILIA_BANCO, FAMILIA_MESA } from './geralMesaBanco.ts';
import { FAMILIA_PAINEL_RIPADO } from './geralPainel.ts';
import { FAMILIA_PRATELEIRA } from './geralPrateleira.ts';
import { FAMILIA_BLOCO_LIVRE, FAMILIA_MODULO_BRANCO } from './geralSimples.ts';

export const GERAL: Familia[] = [
  FAMILIA_MODULO_BRANCO,
  FAMILIA_BLOCO_LIVRE,
  FAMILIA_MESA,
  FAMILIA_BANCO,
  FAMILIA_PRATELEIRA,
  FAMILIA_PAINEL_RIPADO,
].map(comEscolhas);
