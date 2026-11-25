import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, type Project } from '@hestia/model';
import { useUi } from './state.ts';
import { hideInView, temporaryHide, visibilityOf } from './viewVisibility.ts';

/*
 * Ficha N2: `visibilityOf` guarda o último resultado por (projeto, campos da vista). Devolve o MESMO objeto enquanto nada disso muda e
 * recalcula quando muda o projeto, a vista, a disciplina de trabalho, a ocultação temporária ou o bloqueio de edição.
 */

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, sectionId: null, viewTemp: {}, selection: [], subElemento: null, minhaDisciplina: null, liberarEdicao: false } as never));

const projeto = (): Project => structuredClone(buildTemplate('house2'));

describe('visibilityOf memoizado', () => {
  it('mesmo projeto e mesma vista: o mesmo objeto (sem refazer os conjuntos)', () => {
    const p = projeto();
    const a = visibilityOf(p, useUi.getState());
    expect(visibilityOf(p, useUi.getState())).toBe(a);
    // Campos que não são da vista (cursor, status) não invalidam.
    useUi.setState({ status: 'qualquer coisa' } as never);
    expect(visibilityOf(p, useUi.getState())).toBe(a);
  });
  it('projeto novo (cada comando cria um): recalcula', () => {
    const p = projeto();
    const a = visibilityOf(p, useUi.getState());
    expect(visibilityOf({ ...p }, useUi.getState())).not.toBe(a);
  });
  it('trocar de vista, disciplina de trabalho ou liberar edição recalcula', () => {
    const p = projeto();
    const a = visibilityOf(p, useUi.getState());
    useUi.setState({ view: '3d' });
    const tres = visibilityOf(p, useUi.getState());
    expect(tres).not.toBe(a);
    useUi.setState({ view: 'plan', minhaDisciplina: 'hidrossanitario' } as never);
    const hidro = visibilityOf(p, useUi.getState());
    expect(hidro).not.toBe(a);
    useUi.setState({ liberarEdicao: true } as never);
    expect(visibilityOf(p, useUi.getState())).not.toBe(hidro);
  });
  it('ocultar elemento (temporário) aparece na consulta seguinte, sem resultado velho', () => {
    const p = projeto();
    const parede = Object.values(p.elements).find((e) => e.kind === 'wall');
    expect(parede).toBeDefined();
    const id = parede?.id ?? '';
    expect(visibilityOf(p, useUi.getState()).hidden.has(id)).toBe(false);
    useUi.setState((s) => ({ viewTemp: { ...s.viewTemp, 'plan:lv_0': { hidden: { elements: [id] } } } }));
    expect(visibilityOf(p, useUi.getState()).hidden.has(id)).toBe(true);
    useUi.setState({ viewTemp: {} });
    expect(visibilityOf(p, useUi.getState()).hidden.has(id)).toBe(false);
  });
});
void hideInView;
void temporaryHide;
