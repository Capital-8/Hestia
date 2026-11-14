import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, makeMass, ProjectStore, secaoCirculo, type Mass, type Project } from '@hestia/model';
import { useUi } from '../../editor/state.ts';
import { abrirPropriedadesDaMassa, MassasCategory, MassasNodes, massasDoProjeto, selecionarMassa } from './Massas.tsx';
import { FamiliesTree } from './Families.tsx';

// O navegador real assina o projeto pelo editor; no teste o projeto vem de uma variável.
let atual: Project = createEmptyProject();
vi.mock('../../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../editor/controller.ts')>();
  return { ...actual, useProject: () => atual };
});

const inicial = useUi.getState();
afterEach(() => useUi.setState({ selection: inicial.selection, propsOpen: inicial.propsOpen, dialog: null, dialogArg: null }));

function projetoComMassas(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addMass', mass: makeMass({ id: 'ms_b', levelId: 'lv_0', name: 'Torre B', secoes: [secaoCirculo(0, 3), secaoCirculo(18, 3)] }) });
  s.exec({ type: 'addMass', mass: makeMass({ id: 'ms_a', levelId: 'lv_0', name: 'Bulbo A', secoes: [secaoCirculo(0, 2), secaoCirculo(5, 4), secaoCirculo(10, 2)] }) });
  return s.project;
}
const massas = (p: Project): Mass[] => massasDoProjeto(p);

describe('navegador: categoria Massas', () => {
  it('lista as massas por nome (ordem alfabética), uma por instância', () => {
    const p = projetoComMassas();
    expect(massas(p).map((m) => m.name)).toEqual(['Bulbo A', 'Torre B']);
    const html = renderToStaticMarkup(createElement(MassasNodes, { massas: massas(p) }));
    expect(html).toContain('data-node="ms:ms_a"');
    expect(html).toContain('data-node="ms:ms_b"');
    expect(html.indexOf('Bulbo A')).toBeLessThan(html.indexOf('Torre B'));
    // o ícone do cubo e o resumo (seções e altura na unidade do projeto) vão no nó
    expect(html).toContain('<svg class="ic"');
    expect(html).toContain('3 seções');
  });

  it('a categoria aparece em Famílias, com o texto de vazio quando não há massa', () => {
    atual = createEmptyProject();
    const html = renderToStaticMarkup(createElement(MassasCategory));
    expect(html).toContain('data-node="cat:mass"');
    expect(html).toContain('Massas');
    atual = createEmptyProject();
    expect(renderToStaticMarkup(createElement(FamiliesTree))).toContain('data-node="cat:mass"');
  });

  it('clique seleciona a massa; duplo clique seleciona e abre as propriedades', () => {
    selecionarMassa('ms_a');
    expect(useUi.getState().selection).toEqual(['ms_a']);
    useUi.setState({ propsOpen: false });
    abrirPropriedadesDaMassa('ms_b');
    expect(useUi.getState()).toMatchObject({ selection: ['ms_b'], propsOpen: true });
  });
});
