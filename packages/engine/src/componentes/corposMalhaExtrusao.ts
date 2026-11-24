import type { Malha } from './malha.ts';
import type { PerfilResolvido } from './corposTipos.ts';
import { aneisDoPerfil, faixasLaterais, malhaVazia, tampa, type Mapa } from './corposMalhaApoio.ts';

/*
 * Malha da extrusão (CONTRATO.md §2.3 "Extrusão"): o perfil no plano XY, de z = 0 a z = `comprimento` (m).
 * Tampa de baixo com normal −Z em z = 0, tampa de cima com normal +Z em z = comprimento. Cada anel do perfil (externo e
 * furos) vira paredes laterais com normais suaves ao longo do anel; os furos viram túnel. As tampas com furos são
 * trianguladas por `triangulate` de @hestia/geom, que aceita furos (sem ponte de corte; ver `corposMalhaApoio.ts`).
 * Entrada inválida (comprimento não positivo ou não finito) devolve malha vazia, sem lançar.
 */

const mapaExtrusao: Mapa = (u, v, nu, nv, z) => ({ p: [u, v, z], n: [nu, nv, 0] });

export function malhaExtrusao(perfil: PerfilResolvido, comprimento: number): Malha {
  const m = malhaVazia();
  if (!(comprimento > 0) || !Number.isFinite(comprimento)) return m;
  const aneis = aneisDoPerfil(perfil);
  for (const anel of aneis) faixasLaterais(m, anel, [0, comprimento], false, mapaExtrusao);
  tampa(m, aneis, (u, v) => [u, v, 0], [0, 0, -1]);
  tampa(m, aneis, (u, v) => [u, v, comprimento], [0, 0, 1]);
  return m;
}
