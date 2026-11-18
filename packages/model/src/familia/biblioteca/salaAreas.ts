import type { Familia } from '../tipos.ts';
import { FAMILIA_ARMARIO_LAVANDERIA } from './salaAreasLavanderia.ts';
import { FAMILIA_ESCRIVANINHA } from './salaAreasEscrivaninha.ts';
import { FAMILIA_ESTANTE } from './salaAreasEstante.ts';
import { FAMILIA_GABINETE_BANHEIRO } from './salaAreasGabinete.ts';
import { FAMILIA_MESA_GAVETEIRO } from './salaAreasMesaGaveteiro.ts';
import { FAMILIA_RACK } from './salaAreasRack.ts';

/** Famílias autorais do grupo sala, escritório e áreas molhadas (ficha E7-salaAreas). */
export const SALA_AREAS: Familia[] = [
  FAMILIA_RACK,
  FAMILIA_ESTANTE,
  FAMILIA_MESA_GAVETEIRO,
  FAMILIA_GABINETE_BANHEIRO,
  FAMILIA_ARMARIO_LAVANDERIA,
  FAMILIA_ESCRIVANINHA,
];
