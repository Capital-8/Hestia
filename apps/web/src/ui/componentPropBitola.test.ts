import { createEmptyProject, familiaDaBiblioteca, isComponent, ProjectStore, type Component } from '@hestia/model';
import { trechoDeTubo } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { dnDoTipo, trocarDnPeloPainel, trocarTipoPeloPainel, tuboComTipoDeTubulacao } from './componentPropBitola.ts';

/* Troca de bitola pelo painel (ficha B3): só tubo de família com tipo de tubulação passa pelo motor de rede; o resto fica como era. */

const KRONA = 'fam_krona_esgoto_tubo_corte';
const GENERICO = 'fam_tubo_esgoto';

function projeto(familia: string, dn = 100): { store: ProjectStore; tubo: Component } {
  const store = new ProjectStore(createEmptyProject('t'));
  store.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(familia)!) });
  const tubo = trechoDeTubo([0, 0, 0.5], [2, 0, 0.5], { id: familia }, dn, { id: 't0', levelId: 'lv_0' })!;
  store.exec({ type: 'addComponent', component: tubo });
  return { store, tubo: store.project.elements.t0 as Component };
}
const dnAtual = (store: ProjectStore): unknown => (store.project.elements.t0 as Component).values?.DN;

describe('troca de bitola pelo painel de propriedades', () => {
  it('só o tubo único de família com tipo de tubulação é tratado', () => {
    const k = projeto(KRONA);
    expect(tuboComTipoDeTubulacao(k.store.project, [k.tubo])?.id).toBe('t0');
    expect(tuboComTipoDeTubulacao(k.store.project, [k.tubo, k.tubo])).toBeNull();
    const g = projeto(GENERICO);
    expect(tuboComTipoDeTubulacao(g.store.project, [g.tubo])).toBeNull();
  });
  it('DN válido: troca, devolve a mensagem de status e o desfazer é um passo', () => {
    const { store, tubo } = projeto(KRONA);
    const r = trocarDnPeloPainel(store, [tubo], 75);
    expect(r).toEqual({ tratado: true, mensagem: 'Bitola do tubo trocada para DN 75.' });
    expect(dnAtual(store)).toBe(75);
    store.undo();
    expect(dnAtual(store)).toBe(100);
  });
  it('DN fora da lista: recusado com o motivo e nada muda', () => {
    const { store, tubo } = projeto(KRONA);
    const antes = store.project;
    const r = trocarDnPeloPainel(store, [tubo], 63);
    expect(r.tratado).toBe(true);
    expect(r.recusa).toContain('DN 63 não existe na linha esgoto da Krona');
    expect(r.mensagem).toBe(r.recusa);
    expect(store.project).toBe(antes);
  });
  it('outra família (sem tipo de tubulação) não é tratada: o painel grava como sempre', () => {
    const { store, tubo } = projeto(GENERICO);
    const antes = store.project;
    expect(trocarDnPeloPainel(store, [tubo], 75)).toMatchObject({ tratado: false });
    expect(store.project).toBe(antes);
  });
  it('pelo seletor de tipo: o tipo de outro DN troca a bitola; o do mesmo DN não é tratado', () => {
    const { store, tubo } = projeto(KRONA);
    const familia = store.project.componentFamilies![KRONA]!;
    expect(dnDoTipo(familia, 'dn75')).toBe(75);
    expect(trocarTipoPeloPainel(store, [tubo], familia, 'dn75').tratado).toBe(true);
    expect(dnAtual(store)).toBe(75);
    expect((store.project.elements.t0 as Component).typeId).toBe('dn75');
    const atual = store.project.elements.t0 as Component;
    expect(isComponent(atual) && trocarTipoPeloPainel(store, [atual], familia, 'dn75').tratado).toBe(false);
  });
});
