import { servicoTerreno, type CurvaNivelTN, type SuperficieTN } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { SnapIndexado, type ArestaIndexada } from './snapIndexado.ts';

/**
 * Captura nas curvas de nível do terreno (`contour`), SÓ para Rótulo de curva e Cota de ponto: as curvas desenhadas vêm do kernel
 * (`ServicoTerreno.curvas`), não do modelo, e por isso nunca estiveram nos alvos de captura. Cada curva vira uma polilinha de arestas
 * (a curva fechada ganha a aresta de fecho) com a cota z, e o ponto mais próximo sobre ela é o candidato.
 *
 * Cache por IDENTIDADE da lista que o serviço devolve: o serviço memoiza `curvas()` por projeto e superfície e só devolve uma lista nova
 * quando a cena do kernel mudou (edição de fontes, kernel que ficou pronto), então o índice acompanha a invalidação sem assinatura própria.
 * Kernel indisponível (`null`) = sem alvo. Vale para as duas superfícies: 0 = existente, 1 = proposta.
 */
const SUPERFICIES: readonly SuperficieTN[] = [0, 1];

const cache = new WeakMap<readonly CurvaNivelTN[], SnapIndexado>();

/** Arestas de uma lista de curvas, com o terreno dono (`hostId`, para ocultar com o elemento) e a cota z. */
export function arestasDasCurvas(curvas: readonly CurvaNivelTN[]): ArestaIndexada[] {
  const out: ArestaIndexada[] = [];
  for (const c of curvas) {
    const n = c.pontos.length;
    for (let i = 0; i + 1 < n; i++) out.push({ a: c.pontos[i]!, b: c.pontos[i + 1]!, hostId: c.terrenoId, kind: 'contour', z: c.z });
    if (c.fechada && n >= 3) out.push({ a: c.pontos[n - 1]!, b: c.pontos[0]!, hostId: c.terrenoId, kind: 'contour', z: c.z });
  }
  return out;
}

/** Índice das curvas de nível do nível `levelId` (superfícies existente e proposta). Sem kernel pronto, vazio. */
export function curvasSnapIndexes(project: Project, levelId: Id): SnapIndexado[] {
  const out: SnapIndexado[] = [];
  for (const sup of SUPERFICIES) {
    const curvas = servicoTerreno().curvas(project, sup, levelId);
    if (!curvas || curvas.length === 0) continue;
    let ix = cache.get(curvas);
    if (!ix) {
      ix = new SnapIndexado([], arestasDasCurvas(curvas));
      cache.set(curvas, ix);
    }
    out.push(ix);
  }
  return out;
}
