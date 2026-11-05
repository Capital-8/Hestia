import { describe, expect, it } from 'vitest';
import { importIfc, type ImportReport } from '@hestia/io';
import paredeJanela from '../../../../tests/ifc/fixtures/parede-janela.ifc?raw';
import { importIfcText, nomeDoProjeto, resumoImportacao } from './ifcImport.ts';

/** Relatório como o importador entrega, com os campos que o teste quer mudar. */
const relatorio = (patch: Partial<ImportReport> = {}): ImportReport => ({
  schema: 'IFC4',
  broken: 0,
  levels: 2,
  imported: {},
  skipped: {},
  approximate: {},
  geometry: {},
  generic: {},
  warnings: [],
  ...patch,
});

describe('importação IFC fora da thread principal', () => {
  it('sem Worker (Node), o importIfcText cai no importIfc síncrono e devolve o mesmo projeto', async () => {
    expect(typeof Worker).toBe('undefined');
    const sincrono = importIfc(paredeJanela);
    const semWorker = await importIfcText(paredeJanela);
    expect(semWorker.project).toEqual(sincrono.project);
    expect(semWorker.report).toEqual(sincrono.report);
  });

  it('mantém o nome do projeto como x.hestia.json', () => {
    expect(nomeDoProjeto('x.ifc')).toBe('x.hestia.json');
  });

  it('informa o andamento de cada fase, em ordem crescente', async () => {
    const eventos: string[] = [];
    const fracoes: number[] = [];
    await importIfcText(paredeJanela, (p) => {
      eventos.push(p.fase);
      fracoes.push(p.fracao);
      expect(p.fracao).toBeGreaterThanOrEqual(0);
      expect(p.fracao).toBeLessThanOrEqual(1);
    });
    expect(eventos[0]).toBe('parse');
    expect(eventos[eventos.length - 1]).toBe('finish');
    expect(eventos).toEqual(expect.arrayContaining(['parse', 'relations', 'levels', 'finish']));
    expect(fracoes).toEqual([...fracoes].sort((a, b) => a - b));
  });
});

describe('resumo da importação IFC', () => {
  it('conta os elementos na ordem das categorias e fecha com os níveis', () => {
    const r = resumoImportacao(relatorio({ imported: { paredes: 13, portas: 5, janelas: 11 } }));
    expect(r.texto).toBe('13 paredes, 5 portas, 11 janelas · 2 níveis');
    expect(r.ignorados).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it('usa o singular para um elemento e para um nível', () => {
    expect(resumoImportacao(relatorio({ levels: 1, imported: { paredes: 1 } })).texto).toBe('1 parede · 1 nível');
  });

  it('mantém a ordem do modelo mesmo quando o relatório está fora de ordem', () => {
    const r = resumoImportacao(relatorio({ imported: { janelas: 2, grades: 4, paredes: 3, ambientes: 1 } }));
    expect(r.texto).toBe('3 paredes, 2 janelas, 1 ambiente, 4 grades · 2 níveis');
  });

  it('lista as classes ignoradas em ordem alfabética, com a contagem', () => {
    const r = resumoImportacao(relatorio({ imported: { paredes: 2 }, skipped: { IFCSTAIR: 3, IFCROOF: 1 } }));
    expect(r.ignorados).toEqual(['IFCROOF: 1', 'IFCSTAIR: 3']);
  });

  it('diz que nada foi reconhecido quando o relatório não traz elementos', () => {
    const r = resumoImportacao(relatorio({ levels: 1, imported: {}, skipped: { IFCTUBE: 2 } }));
    expect(r.texto).toBe('Nenhum elemento reconhecido · 1 nível');
    expect(r.ignorados).toEqual(['IFCTUBE: 2']);
  });

  it('junta as formas aproximadas e os avisos do importador', () => {
    const r = resumoImportacao(relatorio({ imported: { paredes: 3 }, approximate: { paredes: 2, pisos: 1 }, warnings: ['1 entidade(s) STEP ilegíveis foram ignoradas.'] }));
    expect(r.avisos).toEqual(['Formas aproximadas: 2 paredes, 1 piso', '1 entidade(s) STEP ilegíveis foram ignoradas.']);
  });

  it('traduz o resumo quando a interface está em inglês', () => {
    const r = resumoImportacao(relatorio({ levels: 1, imported: { paredes: 13, portas: 1 }, approximate: { janelas: 2 } }), 'en');
    expect(r.texto).toBe('13 walls, 1 door · 1 level');
    expect(r.avisos).toEqual(['Approximate shapes: 2 windows']);
  });
});
