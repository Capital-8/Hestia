import { describe, expect, it } from 'vitest';
import { editor } from './controller.ts';
import { resolveText } from './i18n.ts';
import { setPolarIncrement, useUi } from './state.ts';

const tecla = (key: string): KeyboardEvent => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false } as KeyboardEvent);

describe('F8 — modo ortogonal global', () => {
  it('alterna o modo e avisa na barra de status', () => {
    useUi.setState({ view: 'plan', planKind: 'floor', options: { ...useUi.getState().options, orthoLock: false, angleMode: { ortho: false, polar: false, polarIncrementDeg: 15 } } });
    expect(editor.key(tecla('F8'))).toBe(true);
    expect(useUi.getState().options.orthoLock).toBe(true);
    expect(resolveText(useUi.getState().status, 'pt')).toContain('F8');
    expect(editor.key(tecla('F8'))).toBe(true);
    expect(useUi.getState().options.orthoLock).toBe(false);
  });

  it('F10 alterna o polar sem desligar o orto', () => {
    useUi.setState({ view: 'plan', planKind: 'floor', options: { ...useUi.getState().options, orthoLock: false, angleMode: { ortho: false, polar: false, polarIncrementDeg: 30 } } });
    expect(editor.key(tecla('F10'))).toBe(true);
    expect(useUi.getState().options.angleMode?.polar).toBe(true);
    expect(resolveText(useUi.getState().status, 'pt')).toContain('F10');
    expect(editor.key(tecla('F8'))).toBe(true);
    expect(useUi.getState().options.angleMode).toMatchObject({ ortho: true, polar: true, polarIncrementDeg: 30 });
  });

  it('aceita incremento polar personalizado e recusa valores fora da faixa', () => {
    setPolarIncrement(22.2);
    expect(useUi.getState().options.angleMode?.polarIncrementDeg).toBe(22.2);
    setPolarIncrement(0);
    expect(useUi.getState().options.angleMode?.polarIncrementDeg).toBe(22.2);
    expect(resolveText(useUi.getState().status, 'pt')).toContain('incremento polar');
  });
});
