import { ligacaoNoMundo, resolverComponente, type PontoSegmento } from '@hestia/engine';
import { isComponent, type Component, type Id, type Project } from '@hestia/model';

/* Geometria dos tubos do projeto usada pela ferramenta Tubo e pela verificação de viabilidade (extraída do `tuboTool.ts` na ficha B2). */

/** Ponto escolhido: coordenadas do mundo (m) e, se encaixou numa ligação aberta, quem é ela; `derivacao` = caiu no meio de um tubo. */
export interface PontoTubo {
  xyz: [number, number, number];
  alvo: { componentId: Id; ligacaoId: string } | null;
  derivacao?: boolean;
}

/** Extremos de um tubo do projeto no mundo (m), o DN (mm) e os ids das ligações do início (`idA`) e do fim (`idB`). */
export interface ExtremosTubo {
  a: PontoSegmento;
  b: PontoSegmento;
  dn: number;
  idA: string;
  idB: string;
}

/** Extremos da instância de tubo `c`; null se a família não tem duas ligações. */
export function extremosDoTubo(p: Project, c: Component): ExtremosTubo | null {
  const ligs = [...(resolverComponente(p, c).ligacoes ?? [])].sort((x, y) => x.posicao[2] - y.posicao[2]);
  const i = ligs[0];
  const f = ligs[ligs.length - 1];
  if (ligs.length < 2 || !i || !f) return null;
  return { a: ligacaoNoMundo(i, c).posicaoMundo, b: ligacaoNoMundo(f, c).posicaoMundo, dn: typeof c.values?.DN === 'number' ? c.values.DN : 0, idA: i.id, idB: f.id };
}

/** Tubo da família `familiaId` que passa a até `tol` (m) de `ponto`, longe `margem` (m) das duas pontas; devolve o ponto projetado no eixo. */
export function tuboSob(p: Project, familiaId: string, ponto: PontoSegmento, tol: number, margem: number, excluir?: Id): { c: Component; ext: ExtremosTubo; xyz: [number, number, number] } | null {
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || e.familyId !== familiaId || e.id === excluir) continue;
    const ext = extremosDoTubo(p, e);
    if (!ext) continue;
    const [dx, dy, dz] = [ext.b[0] - ext.a[0], ext.b[1] - ext.a[1], ext.b[2] - ext.a[2]];
    const h2 = dx * dx + dy * dy;
    if (h2 < 1e-12) continue;
    const t = ((ponto[0] - ext.a[0]) * dx + (ponto[1] - ext.a[1]) * dy) / h2;
    const L = Math.hypot(dx, dy, dz);
    if (t * L < margem || (1 - t) * L < margem) continue;
    const xyz: [number, number, number] = [ext.a[0] + t * dx, ext.a[1] + t * dy, ext.a[2] + t * dz];
    if (Math.hypot(xyz[0] - ponto[0], xyz[1] - ponto[1]) > tol || Math.abs(xyz[2] - ponto[2]) > tol) continue;
    return { c: e, ext, xyz };
  }
  return null;
}

