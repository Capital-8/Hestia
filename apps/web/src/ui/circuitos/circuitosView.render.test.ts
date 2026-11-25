import { consultarCircuitos, createEmptyProject, familiaDaBiblioteca, ID_QUADRO_ELETRICO, ProjectStore, type Component } from '@hestia/model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { atribuirSelecionados, novoCircuito } from './circuitosAcoes.ts';
import { CircuitosView, type AcoesCircuitos } from './CircuitosView.tsx';

/* Vista do painel Circuitos (ficha C4) renderizada no servidor: lista, cor, totais por circuito e por quadro, avisos e botões. */
const comp = (id: string, familyId: string, typeId: string): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id });
const nada = (): void => undefined;
const acoes: AcoesCircuitos = { onNovo: nada, onRenomear: nada, onTipo: nada, onTensao: nada, onCor: nada, onQuadro: nada, onAtribuir: nada, onApagar: nada, onPotencia: nada, onTirar: nada, onRenomearQuadro: nada };

function projeto(comQuadro = true): ProjectStore {
  const s = new ProjectStore(createEmptyProject('t'));
  for (const fid of [ID_QUADRO_ELETRICO, 'fam_tomada', 'fam_luminaria_teto']) s.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(fid)!) });
  if (comQuadro) s.exec({ type: 'addComponent', component: comp('qd1', ID_QUADRO_ELETRICO, 'dn25') });
  s.exec({ type: 'addComponent', component: comp('t1', 'fam_tomada', familiaDaBiblioteca('fam_tomada')!.tipos[0]!.id) });
  s.exec({ type: 'addComponent', component: comp('l1', 'fam_luminaria_teto', familiaDaBiblioteca('fam_luminaria_teto')!.tipos[0]!.id) });
  return s;
}
const html = (s: ProjectStore, sel = 0, extra: { erro?: string; aviso?: string } = {}): string =>
  renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: sel, acoes, ...extra }));

describe('painel Circuitos: vista', () => {
  it('projeto sem circuito: orienta a criar e mostra o quadro com 0 VA', () => {
    const h = html(projeto());
    expect(h).toContain('Novo circuito');
    expect(h).toContain('Nenhum circuito');
    expect(h).toContain('QD 1');
    expect(h).toContain('0 VA');
  });
  it('sem quadro no projeto orienta a inserir o quadro', () => {
    expect(html(projeto(false))).toContain('Nenhum quadro no projeto');
  });
  it('mostra cada circuito com nome, cor, tipo, tensão, quadro e total em VA', () => {
    const s = projeto();
    const a = novoCircuito(s);
    atribuirSelecionados(s, a, ['t1', 'l1'], 250);
    const cor = s.project.circuitosEletricos![a]!.cor;
    const h = html(s);
    expect(h).toContain(`data-circuito="${a}"`);
    expect(h).toContain(`value="${cor}"`);
    expect(h).toContain('500 VA');
    expect(h).toContain('Tomadas de uso geral');
    expect(h).toContain('Iluminação');
    expect(h).toContain('(sem quadro)');
    expect(h).toContain('QD 1');
  });
  it('totais por quadro somam os circuitos do quadro e um circuito sem quadro avisa', () => {
    const s = projeto();
    const a = novoCircuito(s);
    const b = novoCircuito(s);
    atribuirSelecionados(s, a, ['t1'], 300);
    atribuirSelecionados(s, b, ['l1'], 120);
    expect(html(s)).toMatch(/data-total-quadro="qd1">420 VA/);
    s.exec({ type: 'moveCircuitoEletrico', id: b });
    const h = html(s);
    expect(h).toMatch(/data-total-quadro="qd1">300 VA/);
    expect(h).toContain('Circuito sem quadro');
    expect(h).toContain('Sem quadro: 120 VA');
  });
  it('lista cada ponto com a família, o id e a potência editável, e o botão Tirar', () => {
    const s = projeto();
    const a = novoCircuito(s);
    atribuirSelecionados(s, a, ['t1'], 180);
    const h = html(s);
    expect(h).toContain('data-ponto="t1"');
    expect(h).toContain('Tomada');
    expect(h).toContain('value="180"');
    expect(h).toContain('Tirar t1 do circuito C1');
  });
  it('Atribuir selecionados fica desabilitado sem seleção e mostra a contagem', () => {
    const s = projeto();
    novoCircuito(s);
    expect(html(s, 0)).toMatch(/<button[^>]*disabled=""[^>]*>Atribuir selecionados \(0\)/);
    const h = html(s, 2);
    expect(h).toContain('Atribuir selecionados (2)');
    expect(h).not.toMatch(/disabled=""[^>]*>Atribuir selecionados/);
  });
  it('mostra erro e aviso do último comando', () => {
    const s = projeto();
    expect(html(s, 0, { erro: 'Já existe um circuito chamado "C1".' })).toContain('role="alert"');
    expect(html(s, 0, { aviso: '2 ponto(s) atribuído(s).' })).toContain('2 ponto(s) atribuído(s).');
  });
  it('avisa quando um ponto aponta para um componente que não existe mais', () => {
    const s = projeto();
    const a = novoCircuito(s);
    atribuirSelecionados(s, a, ['t1'], 100);
    s.exec({ type: 'deleteElements', ids: ['l1'] });
    const p = structuredClone(s.project);
    p.circuitosEletricos![a]!.pontos.push({ componenteId: 'fantasma', potenciaVA: 50 });
    const h = renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(p), selecionados: 0, acoes }));
    expect(h).toContain('1 ponto(s) apontavam para componentes que não existem mais');
    expect(h).toContain('100 VA');
  });
});
