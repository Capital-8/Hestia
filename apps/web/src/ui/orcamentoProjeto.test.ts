import { applyCommand as aplicar, createEmptyProject, makeLevel, type Command, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { ferragensParaTabela, mostraSemComponentes, nivelOptions, nomeArquivoOrcamento, rotuloNivel } from './orcamentoProjeto.ts';

const aplicarCopia = (p: Project, c: Command): Project => { const q = structuredClone(p); aplicar(q, c); return q; };

describe('orcamentoProjeto (parte lógica da janela)', () => {
  it('nivelOptions: "Todos os níveis" primeiro, depois os níveis do projeto', () => {
    let p = createEmptyProject('casa');
    p = aplicarCopia(p, { type: 'upsertLevel', level: makeLevel({ id: 'n2', name: 'Nível 2', elevation: 3 }) });
    const opcoes = nivelOptions(p);
    expect(opcoes[0]).toEqual({ id: null, rotulo: 'Todos os níveis' });
    expect(opcoes.slice(1)).toEqual(p.levels.map((l) => ({ id: l.id, rotulo: l.name })));
    expect(opcoes).toHaveLength(p.levels.length + 1);
  });

  it('ferragensParaTabela preserva id, nome e quantidade e preenche o resto como vazio', () => {
    const tabela = ferragensParaTabela([
      { id: 'dobradica', nome: 'Dobradiça', quantidade: 24 },
      { id: 'pino', nome: 'Pino de prateleira', quantidade: 12 },
    ]);
    expect(tabela).toEqual([
      { id: 'dobradica', nome: 'Dobradiça', codigo: null, custo: null, quantidade: 24 },
      { id: 'pino', nome: 'Pino de prateleira', codigo: null, custo: null, quantidade: 12 },
    ]);
  });

  it('nomeArquivoOrcamento: orcamento-<projeto>.csv sem acentos', () => {
    expect(nomeArquivoOrcamento(createEmptyProject('Casa da Praça'))).toBe('orcamento-casa-da-praca.csv');
    expect(nomeArquivoOrcamento(createEmptyProject(''))).toBe('orcamento-projeto.csv');
  });

  it('mostraSemComponentes: vazio sem móveis e sem avisos; avisos contam como conteúdo', () => {
    const vazio = { moveis: [], linhas: [], resumo: { totalPecas: 0, areaM2: 0, porChapa: [], fitaMetros: [], usinagens: { furos: 0, rasgos: 0, recortes: 0 } }, custo: { chapas: 0, fitas: 0, ferragens: 0, total: 0 }, ferragens: [], avisos: [] };
    expect(mostraSemComponentes(vazio)).toBe(true);
    expect(mostraSemComponentes({ ...vazio, avisos: ['Componente c1: sem família.'] })).toBe(false);
    expect(mostraSemComponentes({ ...vazio, moveis: [{ familiaId: 'f', tipoId: null, nome: 'A', quantidade: 1, ids: ['c1'], pecas: 3, custo: 10 }] })).toBe(false);
  });

  it('rotuloNivel: todos, nome do nível e nível removido', () => {
    const p = createEmptyProject('casa');
    expect(rotuloNivel(p, null)).toBe('todos os níveis');
    expect(rotuloNivel(p, p.levels[0]!.id)).toBe(p.levels[0]!.name);
    expect(rotuloNivel(p, 'sumido')).toBe('nível removido');
  });
});
