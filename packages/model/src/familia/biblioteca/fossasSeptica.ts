import type { Familia } from '../tipos.ts';
import { FAMILIA_SUMIDOURO, FAMILIA_VALA_INFILTRACAO } from './fossasSepticaInfiltracao.ts';
import { FAMILIA_FILTRO_ANAEROBIO, FAMILIA_FOSSA_CILINDRICA, FAMILIA_FOSSA_RETANGULAR } from './fossasSepticaTanques.ts';

/*
 * Fossas, filtro, sumidouro e vala de infiltração (ficha F4): cinco famílias da categoria `reservatorio`, disciplina hidrossanitária.
 * Registradas na biblioteca MEP (`biblioteca/index.ts`), fora de BIBLIOTECA_BASE. Todos os valores de norma são editáveis (CONFERIR).
 */

/** Fossa cilíndrica, fossa retangular, filtro anaeróbio, sumidouro e vala de infiltração, nesta ordem. */
export const FOSSAS_SEPTICAS: Familia[] = [FAMILIA_FOSSA_CILINDRICA, FAMILIA_FOSSA_RETANGULAR, FAMILIA_FILTRO_ANAEROBIO, FAMILIA_SUMIDOURO, FAMILIA_VALA_INFILTRACAO];
