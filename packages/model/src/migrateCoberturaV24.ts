/**
 * Migração 24 → 25: "cobertura como planta comum" (docs/vistas/PLANO-MESTRE.md, Detalhamento da Fase 4).
 *
 * O tipo de vista `roof` deixa de existir. Cada vista `kind: 'roof'` (as `pvr_<nível>`) vira planta de piso com
 * `showRoofOnTop: true`, MANTENDO o id, a faixa de vista, os gráficos, os ocultos e as anotações (pranchas, ocultos e abas
 * continuam apontando para ela). Nenhuma cobertura é apagada. O nome vira "Cobertura: <nome do nível>" só quando era
 * idêntico ao do nível; nome editado é preservado.
 *
 * `normalizeCobertura` é idempotente (só mexe em `kind: 'roof'`) e também roda em `migrateProject` para aceitar
 * `kind: 'roof'` solto (IFC importado, arquivo de rascunho).
 */
type Raw = Record<string, unknown>;

export const ROOF_NAME_PREFIX = 'Cobertura: ';

/** Normaliza, num projeto BRUTO, as vistas `kind: 'roof'` para planta de piso com `showRoofOnTop`. Devolve o próprio objeto se nada mudou. */
export function normalizeCobertura(raw: Raw): Raw {
  if (!Array.isArray(raw.planViews)) return raw;
  const levelNames = new Map<string, string>();
  for (const l of Array.isArray(raw.levels) ? (raw.levels as Raw[]) : []) if (typeof l?.id === 'string' && typeof l.name === 'string') levelNames.set(l.id, l.name);
  let mudou = false;
  const planViews = (raw.planViews as Raw[]).map((v) => {
    if (!v || typeof v !== 'object' || v.kind !== 'roof') return v;
    mudou = true;
    const levelName = typeof v.levelId === 'string' ? levelNames.get(v.levelId) : undefined;
    const next: Raw = { ...v, kind: 'floor', showRoofOnTop: true };
    if (levelName !== undefined && v.name === levelName) next.name = `${ROOF_NAME_PREFIX}${levelName}`;
    return next;
  });
  return mudou ? { ...raw, planViews } : raw;
}

/** Passo 24 → 25 da cadeia de migração. */
export const migrateCoberturaV24 = (raw: Raw): Raw => normalizeCobertura(raw);
