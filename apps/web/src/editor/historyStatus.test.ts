import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { desfazerOuRefazer } from './historyStatus.ts';
import { resolveText } from './i18n.ts';
import { useUi } from './state.ts';

describe('Desfazer e Refazer dizem o passo na barra de status', () => {
  it('Ctrl+Z troca a mensagem antiga por "Desfeito: <passo>." e Refazer por "Refeito: <passo>."', () => {
    const s = new ProjectStore(createEmptyProject());
    s.transaction('Parede paralela', () =>
      s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) }),
    );
    useUi.setState({ status: 'Parede paralela criada a 3,000 m. Ctrl+Z desfaz.' });
    desfazerOuRefazer(s, 'undo');
    expect(resolveText(useUi.getState().status, 'pt')).toBe('Desfeito: Parede paralela.');
    desfazerOuRefazer(s, 'redo');
    expect(resolveText(useUi.getState().status, 'pt')).toBe('Refeito: Parede paralela.');
  });

  it('sem passo a desfazer, a barra não muda', () => {
    const s = new ProjectStore(createEmptyProject());
    useUi.setState({ status: 'Pronto.' });
    desfazerOuRefazer(s, 'undo');
    expect(useUi.getState().status).toBe('Pronto.');
  });
});
