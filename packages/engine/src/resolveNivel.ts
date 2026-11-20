import type { Id, Project } from '@hestia/model';
import { despachanteDeNivel } from './resolveDespacho.ts';
import { resolveLevelTs, sharedCache, type PlanResolveOptions, type ResolveCache } from './resolve.ts';
import { nivelUsaMotorTs, resolverComParceiras } from './resolveParceiras.ts';
import type { ResolvedLevel } from './types.ts';

/** Com o despachante do kernel Rust, ele decide; senão TypeScript. Parceiras de outros níveis (`resolveParceiras.ts`) entram só na junção; nível com parceira de cota congelada sai do TS. */
export function resolveLevel(p: Project, levelId: Id, cache: ResolveCache = sharedCache, opts: PlanResolveOptions = {}): ResolvedLevel {
  const ts = (q: Project): ResolvedLevel => resolveLevelTs(q, levelId, cache, opts);
  return resolverComParceiras(p, levelId, opts.cutZ, (q) => (q !== p && nivelUsaMotorTs(p, levelId) ? ts(q) : resolveLevelSemParceiras(q, levelId, cache, opts)));
}

/** `resolveLevel` sem promover parceiras (despacho do Rust ou TS, do projeto como está): cortadores da junção e término usam este. */
export function resolveLevelSemParceiras(p: Project, levelId: Id, cache: ResolveCache = sharedCache, opts: PlanResolveOptions = {}): ResolvedLevel {
  return despachanteDeNivel()?.(p, levelId, opts, () => resolveLevelTs(p, levelId, cache, opts)) ?? resolveLevelTs(p, levelId, cache, opts);
}
