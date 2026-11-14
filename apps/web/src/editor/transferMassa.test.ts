import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, isMass, makeLevel, makeMass, secaoCirculo, type Id, type Mass } from '@hestia/model';
import { Transfer } from './transfer.ts';
import { useUi } from './state.ts';

/**
 * Transferência com a MASSA (ficha T1c, item c): copiar e colar alinhado leva a massa, a seleção pós-colar a inclui e a origem da cópia
 * (nível) e a contagem do buffer a conhecem. A frase de contagem ainda não cita a massa (falta a chave de i18n; ver `transfer.ts`).
 */
function setup() {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav. 1', elevation: 3 }) });
  s.exec({ type: 'addMass', mass: { ...makeMass({ id: 'm1', levelId: 'lv_0', name: 'Torre', origem: { x: 2, y: 1 }, secoes: [secaoCirculo(0, 2), secaoCirculo(9, 2)] }), order: 1 } });
  useUi.setState({ selection: ['m1'], levelId: 'lv_0' });
  return s;
}

const massasDoNivel = (s: ProjectStore, levelId: Id): Mass[] => Object.values(s.project.elements).filter(isMass).filter((m) => m.levelId === levelId);

describe('transferência do editor: massa', () => {
  it('copiar a massa e colar no nível: a cópia nasce com id novo e entra na seleção', () => {
    const s = setup();
    const t = new Transfer();
    expect(t.copy(s.project, ['m1'])).toBe(true);
    const clip = t.clipBuffer()!;
    expect(clip.masses).toHaveLength(1);
    expect(t.elementCount(clip)).toBe(1);
    expect(t.originLevelIds(clip)).toEqual(['lv_0']);
    expect(t.paste(s, 'lv_1')).toBe(true);
    const [copia] = massasDoNivel(s, 'lv_1');
    expect(copia).toBeDefined();
    expect(copia!.id).not.toBe('m1');
    expect(copia!.origem).toEqual({ x: 2, y: 1 });
    expect(useUi.getState().selection).toEqual([copia!.id]);
    s.undo();
    expect(massasDoNivel(s, 'lv_1')).toHaveLength(0);
  });

  it('colar em vários níveis: a massa vai a cada nível escolhido e a seleção a inclui', () => {
    const s = setup();
    const t = new Transfer();
    t.copy(s.project, ['m1']);
    const r = t.pasteToLevels(s, ['lv_1'], false);
    expect(r).not.toBeNull();
    const [copia] = massasDoNivel(s, 'lv_1');
    expect(useUi.getState().selection).toContain(copia!.id);
    expect(useUi.getState().selection).toHaveLength(1);
  });
});
