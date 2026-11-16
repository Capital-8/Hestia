/// <reference types="vite/client" />
/**
 * Regressão numérica da importação IFC contra o oráculo independente (`scripts/ifc-oraculo.mjs`).
 *
 * O oráculo lê o arquivo como texto e conta as entidades por classe; este teste confere se o importador trouxe o número
 * de elementos que o IFC promete quando a conversão é 1:1. Se uma contagem não fechar, a mensagem do `expect` diz qual
 * fixture, qual classe e os dois números — para a divergência ser investigada no importador, não "consertada" no teste.
 *
 * Para regravar os esperados (depois de conferir a contagem no IFC):
 *   node scripts/ifc-oraculo.mjs --todos
 * Para só verificar:
 *   node scripts/ifc-oraculo.mjs --todos --verificar
 */
import { describe, expect, it } from 'vitest';
import { validateProject } from '@hestia/model';
import { importIfc } from '@hestia/io';
import paredeJanela from './fixtures/parede-janela.ifc?raw';
import predioSimples from './fixtures/predio-simples.ifc?raw';
import casaPequena from './fixtures/casa-pequena.ifc?raw';
import fzkHaus from './fixtures/fzk-haus.ifc?raw';
import esperadoParedeJanela from './esperado/parede-janela.json';
import esperadoPredioSimples from './esperado/predio-simples.json';
import esperadoCasaPequena from './esperado/casa-pequena.json';
import esperadoFzkHaus from './esperado/fzk-haus.json';

interface Esperado {
  schema: string;
  classes: Record<string, number>;
  storeys: number;
}

interface Fixture {
  nome: string;
  texto: string;
  esperado: Esperado;
}

const FIXTURES: Fixture[] = [
  { nome: 'parede-janela.ifc', texto: paredeJanela, esperado: esperadoParedeJanela },
  { nome: 'predio-simples.ifc', texto: predioSimples, esperado: esperadoPredioSimples },
  { nome: 'casa-pequena.ifc', texto: casaPequena, esperado: esperadoCasaPequena },
  { nome: 'fzk-haus.ifc', texto: fzkHaus, esperado: esperadoFzkHaus },
];

/** Famílias IFC que o importador trata como uma classe só (as variantes *STANDARDCASE/*ELEMENTEDCASE não são tipos). */
const PAREDES = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'] as const;
const PORTAS = ['IFCDOOR', 'IFCDOORSTANDARDCASE'] as const;
const JANELAS = ['IFCWINDOW', 'IFCWINDOWSTANDARDCASE'] as const;
const PISOS_LAJES_FORROS = [
  'IFCSLAB',
  'IFCSLABSTANDARDCASE',
  'IFCSLABELEMENTEDCASE',
  'IFCCOVERING',
  'IFCCOVERINGSTANDARDCASE',
] as const;

/** Soma as entidades das classes informadas no esperado. */
const contar = (esperado: Esperado, classes: readonly string[]): number =>
  classes.reduce((total, classe) => total + (esperado.classes[classe] ?? 0), 0);

/** Caminhos dos números não finitos, para apontar onde apareceu o NaN/Infinity. */
function naoFinitos(valor: unknown, caminho = 'projeto'): string[] {
  if (typeof valor === 'number') return Number.isFinite(valor) ? [] : [`${caminho}=${valor}`];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => naoFinitos(v, `${caminho}[${i}]`));
  if (valor && typeof valor === 'object') return Object.entries(valor).flatMap(([k, v]) => naoFinitos(v, `${caminho}.${k}`));
  return [];
}

describe.each(FIXTURES)('regressão IFC — $nome', ({ nome, texto, esperado }) => {
  const { project, report } = importIfc(texto);

  it('schema e pavimentos conferem com o oráculo', () => {
    expect(report.schema, `${nome}: schema do relatório diverge do FILE_SCHEMA do oráculo`).toBe(esperado.schema);
    expect(report.levels, `${nome}: níveis — o IFC tem ${esperado.storeys} IFCBUILDINGSTOREY, o importador criou ${report.levels}`).toBe(
      esperado.storeys,
    );
  });

  it('conta as paredes como os IFCWALL* do arquivo', () => {
    const noIfc = contar(esperado, PAREDES);
    const importadas = report.imported.paredes ?? 0;
    expect(
      importadas,
      `${nome}: paredes — IFC tem ${noIfc} IFCWALL/IFCWALLSTANDARDCASE/IFCWALLELEMENTEDCASE; o importador trouxe ${importadas}`,
    ).toBe(noIfc);
  });

  it('conta portas e janelas como os IFCDOOR/IFCWINDOW preenchidos por IFCRELFILLSELEMENT', () => {
    const portasNoIfc = contar(esperado, PORTAS);
    const janelasNoIfc = contar(esperado, JANELAS);
    const fills = esperado.classes.IFCRELFILLSELEMENT ?? 0;
    expect(
      portasNoIfc + janelasNoIfc,
      `${nome}: aberturas — IFC tem ${portasNoIfc} porta(s) + ${janelasNoIfc} janela(s), mas ${fills} IFCRELFILLSELEMENT; a conversão não é 1:1`,
    ).toBe(fills);
    const portas = report.imported.portas ?? 0;
    const janelas = report.imported.janelas ?? 0;
    expect(portas, `${nome}: portas — IFC tem ${portasNoIfc} IFCDOOR preenchida(s) por IFCRELFILLSELEMENT; o importador trouxe ${portas}`).toBe(
      portasNoIfc,
    );
    expect(janelas, `${nome}: janelas — IFC tem ${janelasNoIfc} IFCWINDOW preenchida(s) por IFCRELFILLSELEMENT; o importador trouxe ${janelas}`).toBe(
      janelasNoIfc,
    );
  });

  it('conta pisos, lajes e forros como os IFCSLAB/IFCCOVERING do arquivo', () => {
    const noIfc = contar(esperado, PISOS_LAJES_FORROS);
    const pisos = report.imported.pisos ?? 0;
    const lajes = report.imported.lajes ?? 0;
    const forros = report.imported.forros ?? 0;
    // `IFCSLAB` de telhado (`.ROOF.`) entra como telhado nativo (uma água), não como laje horizontal.
    const telhados = report.imported.telhados ?? 0;
    expect(
      pisos + lajes + forros + telhados,
      `${nome}: pisos/lajes/forros/telhados — IFC tem ${noIfc} IFCSLAB/IFCCOVERING; o importador trouxe ${pisos} piso(s) + ${lajes} laje(s) + ${forros} forro(s) + ${telhados} telhado(s)`,
    ).toBe(noIfc);
  });

  it('conta os ambientes como os IFCSPACE do arquivo', () => {
    const noIfc = esperado.classes.IFCSPACE ?? 0;
    const ambientes = report.imported.ambientes ?? 0;
    expect(ambientes, `${nome}: ambientes — IFC tem ${noIfc} IFCSPACE; o importador trouxe ${ambientes}`).toBe(noIfc);
  });

  it('conta os objetos genéricos dentro do que existe no IFC', () => {
    const objetos = report.imported.objetos ?? 0;
    const genericos = Object.values(report.generic).reduce((total, n) => total + n, 0);
    expect(objetos, `${nome}: objetos — o relatório importou ${objetos} objeto(s), mas generic soma ${genericos}`).toBe(genericos);

    // Cada objeto genérico vem de uma classe real do arquivo; o total por classe nunca pode passar do que o IFC tem.
    for (const [classe, n] of Object.entries(report.generic)) {
      const noIfc = esperado.classes[classe] ?? 0;
      expect(noIfc, `${nome}: objetos genéricos — o relatório cita ${classe}, que não existe no oráculo do arquivo`).toBeGreaterThan(0);
      expect(n, `${nome}: objetos genéricos de ${classe} — IFC tem ${noIfc}; o importador converteu ${n}`).toBeLessThanOrEqual(noIfc);
    }
    // O que foi convertido + o que foi ignorado de uma classe também não pode passar do total dessa classe no IFC.
    const classesCitadas = new Set([...Object.keys(report.generic), ...Object.keys(report.skipped)]);
    for (const classe of classesCitadas) {
      if (!(classe in esperado.classes)) continue; // "duplicado"/"parede-forma-livre" não são classes IFC
      const total = (report.generic[classe] ?? 0) + (report.skipped[classe] ?? 0);
      expect(
        total,
        `${nome}: ${classe} — IFC tem ${esperado.classes[classe]}; relatório conta ${total} entre genéricos e ignorados`,
      ).toBeLessThanOrEqual(esperado.classes[classe]!);
    }
  });

  it('não perde entidade STEP e não deixa número não finito no projeto', () => {
    expect(report.broken, `${nome}: o tokenizador STEP contou ${report.broken} entidade(s) ilegível(is)`).toBe(0);
    const ruins = naoFinitos(project);
    expect(ruins, `${nome}: números não finitos no projeto importado: ${ruins.join(', ')}`).toEqual([]);
  });

  it('validateProject não acusa opening-out-of-wall', () => {
    const codigos = validateProject(project).map((issue) => issue.code);
    const fora = codigos.filter((codigo) => codigo === 'opening-out-of-wall').length;
    expect(codigos, `${nome}: validateProject acusou opening-out-of-wall ${fora} vez(es)`).not.toContain('opening-out-of-wall');
  });

  it('importa o mesmo texto com resultado idêntico (determinismo)', () => {
    const outra = importIfc(texto);
    expect(JSON.stringify(outra.project), `${nome}: duas importações do mesmo texto deram projetos diferentes`).toBe(
      JSON.stringify(project),
    );
    expect(JSON.stringify(outra.report), `${nome}: duas importações do mesmo texto deram relatórios diferentes`).toBe(JSON.stringify(report));
  });
});
