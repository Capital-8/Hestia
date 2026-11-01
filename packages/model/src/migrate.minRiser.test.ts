import { describe, expect, it } from 'vitest';
import { DEFAULT_STAIR_TYPES, createEmptyProject, migrateProject, type Project } from './index.ts';

describe('migração: espelho mínimo do tipo de escada', () => {
  it('tipos sem minRiser recebem 0,16 m; os que já têm ficam como estão; idempotente', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Project;
    const t0 = { ...raw.stairTypes[DEFAULT_STAIR_TYPES[0]!.id]! } as Record<string, unknown>;
    delete t0.minRiser;
    raw.stairTypes = { ...raw.stairTypes, antigo: { ...t0, id: 'antigo' } as never, novo: { ...t0, id: 'novo', minRiser: 0.15 } as never, estreito: { ...t0, id: 'estreito', maxRiser: 0.2 } as never };
    const m = migrateProject(raw);
    expect(m.stairTypes.antigo!.minRiser).toBe(0.16);
    expect(m.stairTypes.novo!.minRiser).toBe(0.15);
    expect(migrateProject(JSON.parse(JSON.stringify(m))).stairTypes.antigo!.minRiser).toBe(0.16);
    for (const t of Object.values(m.stairTypes)) expect(t.minRiser).toBeLessThan(t.maxRiser);
  });
});
