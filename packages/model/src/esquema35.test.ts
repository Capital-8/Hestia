import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, SchemaError, createEmptyProject, migrateProject, type CircuitoEletrico, type QuadroEletrico } from './index.ts';

/*
 * Esquema 35 (autorizado pelo dono, 2026-11-26): `circuitosEletricos`, `quadrosEletricos` (C4), `Corpo.furar` (D2) e
 * `Ligacao.flexivel` (F2). A migração 34 → 35 é identidade; o bump existe para um programa antigo RECUSAR o arquivo em vez de
 * apagar os circuitos ao salvar.
 */

const circuito = (id: string, nome: string, quadroId?: string): CircuitoEletrico => ({
  id, nome, tipo: 'tomadas_uso_geral', quadroId, tensao: 127, cor: '#1c7ed6', tipoManual: true, notas: 'nota',
  pontos: [{ componenteId: 'c1', potenciaVA: 100 }, { componenteId: 'c2', potenciaVA: 600, fator: 0.5 }],
});
const quadros: Record<string, QuadroEletrico> = { q1: { id: 'q1', nome: 'QDC Principal' } };
const circuitos = { cir_1: circuito('cir_1', 'C1', 'q1'), cir_2: circuito('cir_2', 'C2') };

/** Arquivo gravado pelo programa da versão 34, já com circuitos e quadros (campos opcionais sem bump). */
function arquivoV34(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 34;
  p.circuitosEletricos = circuitos;
  p.quadrosEletricos = quadros;
  return p;
}

describe('esquema 35 (circuitos e quadros elétricos)', () => {
  it('a versão atual é 35 e o projeto novo sai na 35 sem circuitos nem quadros', () => {
    expect(SCHEMA_VERSION).toBe(35);
    const p = createEmptyProject();
    expect(p.schemaVersion).toBe(35);
    expect('circuitosEletricos' in p).toBe(false);
    expect('quadrosEletricos' in p).toBe(false);
  });

  it('arquivo 34 com circuitos e quadros abre como 35 e preserva tudo', () => {
    const p = migrateProject(arquivoV34());
    expect(p.schemaVersion).toBe(35);
    expect(p.circuitosEletricos).toEqual(circuitos);
    expect(p.quadrosEletricos).toEqual(quadros);
  });

  it('a migração 34 → 35 só troca a versão: o resto do arquivo é byte a byte o mesmo', () => {
    const raw = arquivoV34();
    const esperado = JSON.stringify({ ...raw, schemaVersion: 35 });
    expect(JSON.stringify(migrateProject(raw))).toBe(esperado);
  });

  it('arquivo 34 sem circuitos abre na 35 sem inventar os campos', () => {
    const raw = arquivoV34();
    delete raw.circuitosEletricos;
    delete raw.quadrosEletricos;
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(35);
    expect(p.circuitosEletricos).toBeUndefined();
    expect(p.quadrosEletricos).toBeUndefined();
  });

  it('a migração é idempotente: migrar o resultado de novo não muda nada', () => {
    const uma = migrateProject(arquivoV34());
    const texto = JSON.stringify(uma);
    expect(JSON.stringify(migrateProject(JSON.parse(texto)))).toBe(texto);
  });

  it('ida e volta JSON do arquivo 35 não perde circuitos nem quadros', () => {
    const p = migrateProject(arquivoV34());
    const volta = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(volta.schemaVersion).toBe(35);
    expect(volta.circuitosEletricos).toEqual(circuitos);
    expect(volta.quadrosEletricos).toEqual(quadros);
    expect(volta.circuitosEletricos!.cir_2!.quadroId).toBeUndefined();
  });

  it('arquivo gravado já na 35 abre sem perda', () => {
    const raw = { ...arquivoV34(), schemaVersion: 35 };
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(35);
    expect(p.circuitosEletricos).toEqual(circuitos);
  });

  it('arquivo de versão futura (36) é recusado com SchemaError citando 36 e 35', () => {
    const raw = { ...arquivoV34(), schemaVersion: 36 };
    expect(() => migrateProject(raw)).toThrow(SchemaError);
    expect(() => migrateProject(raw)).toThrow('versão 36');
    expect(() => migrateProject(raw)).toThrow('(35)');
  });

  it('migra em cadeia: arquivo 33 com circuitos chega à 35 com os circuitos intactos', () => {
    const raw = { ...arquivoV34(), schemaVersion: 33 };
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(35);
    expect(p.circuitosEletricos).toEqual(circuitos);
  });
});
