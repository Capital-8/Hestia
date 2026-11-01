import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeStair, type Stair } from '@hestia/model';
import { applyLevelElevation, moveLevel } from './levelActions.ts';

/** Escada com componente malformado (sem `risers`): `riserCountOf` lançava dentro do plano. */
function storeMalformada(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const ruim = { id: 'r1', kind: 'run', boundaryLeft: [], boundaryRight: [], path: [] } as unknown as Stair['components'][number];
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [ruim] }) });
  return s;
}

describe('moveLevel robusto (a cota do nível não pode falhar em silêncio)', () => {
  it('escada malformada não lança: vira conflito com motivo e nada é aplicado', () => {
    const s = storeMalformada();
    const antes = s.project.levels.find((l) => l.id === 'lv_1')!.elevation;
    let r: ReturnType<typeof moveLevel> | undefined;
    expect(() => { r = moveLevel(s, 'lv_1', antes + 0.5); }).not.toThrow();
    expect(r!.needsDecision).toBe(true);
    expect(r!.plan!.stairs[0]!.status).toBe('conflict');
    expect(r!.plan!.stairs[0]!.reason).toBeTruthy();
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(antes);
  });

  it('sem escadas a cota muda e a mensagem de sucesso é devolvida', () => {
    const s = new ProjectStore(createEmptyProject());
    const r = moveLevel(s, 'lv_1', 4);
    expect(r.ok).toBe(true);
    expect(s.project.levels.find((l) => l.id === 'lv_1')!.elevation).toBe(4);
    expect(r.message).toContain('movido');
  });

  it('applyLevelElevation: sucesso, conflito e erro sempre devolvem mensagem', () => {
    const ok = applyLevelElevation(new ProjectStore(createEmptyProject()), 'lv_1', 4);
    expect(ok).toMatchObject({ ok: true });
    expect(ok.message).toContain('movido');
    const conf = applyLevelElevation(storeMalformada(), 'lv_1', 3.5);
    expect(conf.conflictArg).toBe(JSON.stringify({ levelId: 'lv_1', elevation: 3.5 }));
    const erro = applyLevelElevation(new ProjectStore(createEmptyProject()), 'nao_existe', 4);
    expect(erro.ok).toBe(false);
    expect(erro.message).toContain('Não foi possível mover o nível');
  });
});
