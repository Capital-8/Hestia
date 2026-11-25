import { consultarCircuitos, createEmptyProject, familiaDaBiblioteca, ID_QUADRO_ELETRICO, ProjectStore, type Component } from '@hestia/model';
import { comprimentoDoCircuito } from '@hestia/engine';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { atribuirSelecionados, novoCircuito } from './circuitosAcoes.ts';
import { CircuitosView, type AcoesCircuitos } from './CircuitosView.tsx';

/* Comprimento pela rede de eletrodutos no painel Circuitos (C5): só informação, sem cálculo elétrico. */
const nada = (): void => undefined;
const acoes: AcoesCircuitos = { onNovo: nada, onRenomear: nada, onTipo: nada, onTensao: nada, onCor: nada, onQuadro: nada, onAtribuir: nada, onApagar: nada, onPotencia: nada, onTirar: nada, onRenomearQuadro: nada };
const comp = (id: string, familyId: string, typeId: string | null, extra: Partial<Component> = {}): Omit<Component, 'order'> => ({ id, kind: 'component', familyId, typeId, levelId: 'lv_0', x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, ...extra });
const FAMS = [ID_QUADRO_ELETRICO, 'fam_krona_eletrica_tubo_corte', 'fam_tomada'];
const tipo = (f: string): string | null => familiaDaBiblioteca(f)!.tipos[0]?.id ?? null;

function loja(ligar: boolean): { s: ProjectStore; id: string } {
  const s = new ProjectStore(createEmptyProject('t'));
  for (const f of FAMS) s.exec({ type: 'upsertFamily', family: structuredClone(familiaDaBiblioteca(f)!) });
  s.exec({ type: 'addComponent', component: comp('qd1', ID_QUADRO_ELETRICO, 'dn25') });
  s.exec({ type: 'addComponent', component: comp('t1', 'fam_krona_eletrica_tubo_corte', tipo('fam_krona_eletrica_tubo_corte'), { values: { L: 3000 } }) });
  s.exec({ type: 'addComponent', component: comp('tom1', 'fam_tomada', tipo('fam_tomada')) });
  if (ligar) {
    s.exec({ type: 'connectComponents', a: 'qd1', ligacaoA: 'a', b: 't1', ligacaoB: 'a' });
    s.exec({ type: 'connectComponents', a: 't1', ligacaoA: 'b', b: 'tom1', ligacaoB: 'eletroduto' });
  }
  const id = novoCircuito(s);
  atribuirSelecionados(s, id, ['tom1'], 100);
  return { s, id };
}
const html = (s: ProjectStore, id: string): string => renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: 0, acoes, comprimentos: { [id]: comprimentoDoCircuito(s.project, s.project.circuitosEletricos![id]!).comprimentoM } }));

describe('painel Circuitos: comprimento pela rede (C5)', () => {
  it('rede ligada: soma dos eletrodutos do caminho, em m', () => {
    const { s, id } = loja(true);
    expect(html(s, id)).toMatch(/data-comprimento="cir_1">Eletrodutos até o ponto mais distante: 3 m/);
  });
  it('rede desligada: "sem caminho", nada inventado', () => {
    const { s, id } = loja(false);
    expect(html(s, id)).toContain('sem caminho');
  });
  it('sem a propriedade (vista da C4) nenhuma linha de comprimento aparece', () => {
    const { s } = loja(true);
    const h = renderToStaticMarkup(createElement(CircuitosView, { consulta: consultarCircuitos(s.project), selecionados: 0, acoes }));
    expect(h).not.toContain('data-comprimento');
  });
  it('nenhum número de dimensionamento aparece no painel (corrente, seção, disjuntor, queda)', () => {
    const { s, id } = loja(true);
    expect(html(s, id)).not.toMatch(/Corrente|Seção do condutor|Disjuntor|Queda de tensão|CONFERIR/);
  });
});
