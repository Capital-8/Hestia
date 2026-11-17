import { CAPABILITY_REQUIRES_V2 } from '@hestia/plugin-api';

/** Permissões exigidas por `cap` (diretas), conforme a tabela V2 de `plugin-api/permissions.ts`. */
export const requiresOf = (cap: string): readonly string[] => CAPABILITY_REQUIRES_V2[cap as keyof typeof CAPABILITY_REQUIRES_V2] ?? [];

/** Marca `cap` e, em cadeia, tudo que ela exige (a tela marca as exigidas junto, spec 08 §3 regra 2). */
export function withDeps(selected: ReadonlySet<string>, cap: string, requested: readonly string[]): Set<string> {
  const out = new Set(selected);
  const visit = (c: string): void => {
    if (out.has(c) || !requested.includes(c)) return;
    out.add(c);
    for (const d of requiresOf(c)) visit(d);
  };
  visit(cap);
  return out;
}

/** Desmarca `cap` e, em cadeia, tudo que dependia dela (não pode sobrar permissão sem a que ela exige). */
export function withoutDependents(selected: ReadonlySet<string>, cap: string): Set<string> {
  const out = new Set(selected);
  out.delete(cap);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of [...out]) {
      if (requiresOf(c).some((d) => !out.has(d))) {
        out.delete(c);
        changed = true;
      }
    }
  }
  return out;
}
