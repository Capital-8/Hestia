import { dimensionarProjeto, mesclarTabelas, TABELAS_PROVISORIAS } from '@hestia/engine';
import { consultarCircuitos, createEmptyProject, familiaDaBiblioteca, ID_QUADRO_ELETRICO, ProjectStore, type Component } from '@hestia/model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { atribuirSelecionados, mudarDisjuntor, mudarFp, mudarSecao, novoCircuito, tentarAcao } from './circuitosAcoes.ts';
import { CircuitosView, type AcoesCircuitos } from './CircuitosView.tsx';
import { CHAVE_TABELAS, guardarTabelas, restaurarTabelas, tabelasEletricas } from './tabelasNavegador.ts';
import { TabelasEletricasDialog } from './TabelasEletricasDialog.tsx';

/* Cálculos no painel Circuitos e tabelas editáveis (ficha C5): vista no servidor, ações e armazenamento do navegador. */
const comp = (id: string, familyId: string, typeId: string): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id });
const nada = (): void => undefined;
const acoes: AcoesCircuitos = { onNovo: nada, onRenomear: nada, onTipo: nada, onTensao: nada, onCor: nada, onQuadro: nada, onAtribuir: nada, onApagar: nada, onPotencia: nada, onTirar: nada, onRenomearQuadro: nada, onTabelas: nada, onFp: nada, onSecao: nada, onDisjuntor: nada };

function loja(): ProjectStore {
  const s = new ProjectStore(createEmptyProject('t'));
  for (const fid of [ID_QUADRO_ELETRICO, 'fam_tomada']) s.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(fid)!) });
  s.exec({ type: 'addComponent', component: comp('qd1', ID_QUADRO_ELETRICO, 'dn25') });
  s.exec({ type: 'addComponent', component: comp('t1', 'fam_tomada', familiaDaBiblioteca('fam_tomada')!.tipos[0]!.id) });
  return s;
}
const html = (s: ProjectStore, t = TABELAS_PROVISORIAS): string =>
  renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: 0, acoes, dimensionamento: dimensionarProjeto(s.project, t) }));
/** Circuito de 1270 VA a 127 V (10 A), tipo iluminação, sem rede de eletroduto (sem comprimento). */
function comCircuito(va = 1270): { s: ProjectStore; id: string } {
  const s = loja();
  const id = novoCircuito(s);
  atribuirSelecionados(s, id, ['t1'], va);
  return { s, id };
}

beforeEach(() => {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } } });
  restaurarTabelas();
});

describe('painel Circuitos: cálculos (C5)', () => {
  it('mostra potência aplicada, corrente, seção, disjuntor e queda por circuito, com o selo CONFERIR', () => {
    const { s, id } = comCircuito();
    const h = html(s);
    expect(h).toContain(`data-calculo="${id}"`);
    expect(h).toMatch(/data-res="potencia">1\.270 VA/);
    expect(h).toMatch(/data-res="corrente"[^>]*>10,0 A/);
    expect(h).toMatch(/data-res="secao">1,5 mm2/);
    expect(h).toMatch(/data-res="disjuntor">10 A/);
    expect(h).toContain('data-conferir');
    expect(h).toContain('CONFERIR');
  });
  it('sem rede de eletroduto: "sem comprimento" e o aviso, sem inventar a queda', () => {
    const h = html(comCircuito().s);
    expect(h).toContain('sem comprimento');
    expect(h).toContain('Sem comprimento: a rede de eletrodutos');
    expect(h).toMatch(/data-res="queda"[^>]*>–/);
  });
  it('total por quadro: potência aplicada e soma das correntes', () => {
    const h = html(comCircuito().s);
    expect(h).toMatch(/data-calculo-quadro="qd1">aplicada 1\.270 VA, soma das correntes 10,0 A/);
  });
  it('botão Tabelas aparece quando há a ação; sem a ação a vista fica como na C4', () => {
    const { s } = comCircuito();
    expect(html(s)).toContain('>Tabelas<');
    const antigo = renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: 0, acoes: { ...acoes, onTabelas: undefined } }));
    expect(antigo).not.toContain('>Tabelas<');
    expect(antigo).not.toContain('data-calculo=');
  });
  it('tabela editada muda o número do painel: demanda de 0,5 leva 1270 VA a 635 VA', () => {
    const { s } = comCircuito();
    const t = mesclarTabelas(TABELAS_PROVISORIAS, { fatorDemanda: { ...TABELAS_PROVISORIAS.fatorDemanda, iluminacao: 0.5 } });
    expect(html(s, t)).toMatch(/data-res="potencia">635 VA/);
  });
  it('tabelas conferidas tiram o selo CONFERIR do painel', () => {
    const { s } = comCircuito();
    const t = { ...TABELAS_PROVISORIAS, estado: 'conferido' as const, conferidoPor: 'Ana' };
    expect(html(s, t)).not.toContain('data-conferir');
  });
  it('circuito sobrecarregado: corrente em destaque e "nenhuma seção serve"', () => {
    const h = html(comCircuito(40000).s);
    expect(h).toContain('nenhuma serve');
    expect(h).toContain('circ-ruim');
  });
  it('ações de fp, seção e disjuntor adotados gravam no circuito e null volta ao calculado', () => {
    const { s, id } = comCircuito();
    mudarFp(s, id, 0.8);
    mudarSecao(s, id, 4);
    mudarDisjuntor(s, id, 25);
    expect(s.project.circuitosEletricos![id]).toMatchObject({ fp: 0.8, secaoMm2: 4, disjuntorA: 25 });
    expect(html(s)).toContain('(adotada)');
    mudarFp(s, id, null);
    mudarSecao(s, id, null);
    mudarDisjuntor(s, id, null);
    expect(s.project.circuitosEletricos![id]!.secaoMm2).toBeUndefined();
    expect(tentarAcao(() => mudarFp(s, id, 1.5))).toContain('fator de potência');
    s.undo();
    expect(s.project.circuitosEletricos![id]).toBeDefined();
  });
});

describe('tabelas elétricas no navegador (C5)', () => {
  it('sem edição valem as provisórias (CONFERIR); editar grava e restaurar volta ao provisório', () => {
    expect(tabelasEletricas().estado).toBe('CONFERIR');
    guardarTabelas(mesclarTabelas(TABELAS_PROVISORIAS, { quedaMaximaPct: 2 }));
    expect(tabelasEletricas().quedaMaximaPct).toBe(2);
    expect(window.localStorage.getItem(CHAVE_TABELAS)).toContain('"quedaMaximaPct":2');
    restaurarTabelas();
    expect(tabelasEletricas().quedaMaximaPct).toBe(TABELAS_PROVISORIAS.quedaMaximaPct);
    expect(window.localStorage.getItem(CHAVE_TABELAS)).toBeNull();
  });
  it('conteúdo corrompido no armazenamento cai nas provisórias, sem lançar', () => {
    window.localStorage.setItem(CHAVE_TABELAS, '{não é json');
    expect(tabelasEletricas().secoes).toEqual(TABELAS_PROVISORIAS.secoes);
  });
  it('diálogo das tabelas lista seções, disjuntores, tipos, o aviso CONFERIR e o botão de restaurar', () => {
    const h = renderToStaticMarkup(createElement(TabelasEletricasDialog, { onClose: nada }));
    expect(h).toContain('Tabelas elétricas');
    expect(h).toContain('Restaurar o provisório');
    expect(h).toContain('não é norma verificada');
    expect(h).toContain('data-tabelas-estado="CONFERIR"');
    expect(h).toContain('data-secao="2.5"');
    expect(h).toContain('data-tipo="iluminacao"');
    expect(h).toContain('Marcar como conferido');
  });
});
