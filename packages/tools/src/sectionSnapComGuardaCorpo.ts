import { planoDaSecao, servicoGuardaCorpo, ServicoGuardaCorpo, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import type { Project } from '@hestia/model';
import { buildSnapIndexFromLines, mergeSectionSnapIndex, sectionSnapIndex, type SectionSnapIndex, type SectionSnapLine } from './sectionSnapIndex.ts';

/**
 * Índice de captura da vista de corte/elevação COM o guarda-corpo.
 *
 * O guarda-corpo não está no `SectionResult` (o motor de seção roda no worker, o guarda-corpo é desenhado pelo kernel Rust no
 * processo principal, na camada própria). Aqui as MESMAS linhas que a vista desenha (`servicoGuardaCorpo().corte`, o mesmo
 * resultado memorizado pelo serviço) viram pontos, arestas e trilhas, no mesmo formato do resto do índice. Como é o mesmo
 * resultado, peça cortada e peça vista ao fundo (elevação) entram igual, e o que é oculto na vista sai pelo `hostId`.
 *
 * Cache: o índice do guarda-corpo é feito uma vez por resultado do kernel (o serviço devolve o MESMO objeto enquanto os
 * guarda-corpos e o plano não mudam), e a união com o índice da seção uma vez por par (seção, guarda-corpo). Mover o mouse não
 * reconstrói nada; editar uma parede reconstrói só o da seção.
 */

type CorteGC = { linhas: LinhaVistaGC[]; poligonos: number[] };

/** `temGuardaCorpo` varre todos os elementos: memorizado por projeto (objeto imutável), pois a consulta roda a cada movimento do mouse. */
const temPorProjeto = new WeakMap<Project, boolean>();
function temGuardaCorpo(p: Project): boolean {
  let v = temPorProjeto.get(p);
  if (v === undefined) {
    v = ServicoGuardaCorpo.temGuardaCorpo(p);
    temPorProjeto.set(p, v);
  }
  return v;
}

/** Linhas do guarda-corpo na vista (as mesmas desenhadas), ou null sem guarda-corpo, sem plano ou sem kernel pronto. */
export function corteGuardaCorpoDaSecao(project: Project, section: SectionResult): CorteGC | null {
  if (!temGuardaCorpo(project)) return null;
  const plano = planoDaSecao(section);
  if (!plano) return null;
  return servicoGuardaCorpo().corte(project, null, plano.a.x, plano.a.y, plano.b.x - plano.a.x, plano.b.y - plano.a.y, plano.depth);
}

/** Contornos de peça (papel 0 a 7) são fechados; o eixo (255) é polilinha aberta. */
export function linhasDeCaptura(linhas: readonly LinhaVistaGC[]): SectionSnapLine[] {
  return linhas.filter((l) => l.pontos.length >= 2).map((l) => ({ hostId: l.guardaId, closed: l.papel !== 255, pts: l.pontos }));
}

const doKernel = new WeakMap<CorteGC, SectionSnapIndex>();
const uniao = new WeakMap<SectionSnapIndex, { gc: CorteGC; indice: SectionSnapIndex }>();

/** Índice do guarda-corpo de um resultado do kernel (cacheado pela identidade do resultado). */
export function indiceDoGuardaCorpo(corte: CorteGC): SectionSnapIndex {
  let idx = doKernel.get(corte);
  if (!idx) {
    idx = buildSnapIndexFromLines(linhasDeCaptura(corte.linhas));
    doKernel.set(corte, idx);
  }
  return idx;
}

/** Índice da vista com o guarda-corpo do projeto. Sem guarda-corpo (ou kernel fora) devolve o próprio índice da seção. */
export function sectionSnapIndexDoProjeto(section: SectionResult, project: Project | undefined): SectionSnapIndex {
  const base = sectionSnapIndex(section);
  if (!project) return base;
  const corte = corteGuardaCorpoDaSecao(project, section);
  if (!corte || corte.linhas.length === 0) return base;
  const guardado = uniao.get(base);
  if (guardado && guardado.gc === corte) return guardado.indice;
  const indice = mergeSectionSnapIndex(base, indiceDoGuardaCorpo(corte));
  uniao.set(base, { gc: corte, indice });
  return indice;
}
