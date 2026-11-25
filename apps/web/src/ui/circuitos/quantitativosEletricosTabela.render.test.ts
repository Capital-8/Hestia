import { createEmptyProject, familiaDaBiblioteca, type Component, type Project } from '@hestia/model';
import { quantitativosEletricosDoProjeto } from '@hestia/engine';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuantitativosEletricosTabela } from './QuantitativosEletricosTabela.tsx';
import { linhasQuantitativoEletrico } from './quantitativosEletricosTexto.ts';

/* Tabela do diálogo Quantitativos elétricos renderizada no servidor: cabeçalho, linhas do projeto e do circuito, e o estado vazio. */
const html = (p: Project): string => renderToStaticMarkup(createElement(QuantitativosEletricosTabela, { linhas: linhasQuantitativoEletrico(quantitativosEletricosDoProjeto(p)) }));

describe('tabela de quantitativos elétricos', () => {
  it('projeto vazio mostra o aviso e nenhuma tabela', () => {
    const h = html(createEmptyProject('vazio'));
    expect(h).toContain('Nenhum componente elétrico no projeto');
    expect(h).not.toContain('<table');
  });
  it('cabeçalho com Escopo, Grupo, Item, Quantidade e Medida (sem a coluna Unidade, que vai no CSV)', () => {
    const p = projetoComCircuito();
    const h = html(p);
    expect(h).toContain('<table');
    for (const t of ['Escopo', 'Grupo', 'Item', 'Quantidade', 'Medida']) expect(h).toContain(`>${t}</th>`);
    expect(h).not.toContain('>Unidade</th>');
  });
  it('mostra o eletroduto do projeto com o comprimento de cada peça e o circuito C1 com o VA', () => {
    const h = html(projetoComCircuito());
    expect(h).toContain('>DN 20</td>');
    expect(h).toContain('>6 m</td>');
    expect(h).toContain('>C1</td>');
    expect(h).toContain('>900 VA</td>');
  });
  it('o eletroduto do circuito conta cada peça uma vez: 6 m no projeto e 6 m no circuito', () => {
    const h = html(projetoComCircuito());
    expect(h.match(/>6 m</g)?.length).toBe(2);
  });
  it('a tabela renderiza a mesma quantidade de linhas que o módulo de linhas gera', () => {
    const p = projetoComCircuito();
    const linhas = linhasQuantitativoEletrico(quantitativosEletricosDoProjeto(p));
    const h = html(p);
    expect(h.match(/<tr>/g)?.length).toBe(linhas.length + 1);
  });
});

/** Projeto mínimo: uma caixa 4x4 ligada por um eletroduto DN 20 de 6 m ao quadro, e um circuito C1 com a tomada. */
function projetoComCircuito(): Project {
  const base = createEmptyProject('t');
  const familias = ['fam_quadro_distribuicao_eletrico', 'fam_eletroduto_rigido', 'fam_caixa_4x4', 'fam_tomada_2p_t'];
  const componentes: Component[] = [
    comp('qd', 'fam_quadro_distribuicao_eletrico', { ligacoes: { a: { componenteId: 't1', ligacaoId: 'a' } } }),
    comp('t1', 'fam_eletroduto_rigido', { typeId: 'dn20', values: { L: 6000 }, ligacoes: { a: { componenteId: 'qd', ligacaoId: 'a' }, b: { componenteId: 'tom', ligacaoId: 'a' } } }),
    comp('tom', 'fam_tomada_2p_t', { ligacoes: { a: { componenteId: 't1', ligacaoId: 'b' } } }),
  ];
  return {
    ...base,
    componentFamilies: Object.fromEntries(familias.map((id) => [id, structuredClone(familiaDaBiblioteca(id)!)])),
    elements: Object.fromEntries(componentes.map((c) => [c.id, c])),
    circuitosEletricos: { cir_1: { id: 'cir_1', nome: 'C1', tipo: 'tomadas_uso_geral', quadroId: 'qd', tensao: 127, cor: '#d9480f', pontos: [{ componenteId: 'tom', potenciaVA: 900 }] } },
  };
}

function comp(id: string, familyId: string, extra: Partial<Component> = {}): Component {
  return { id, kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 0, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, ...extra };
}
