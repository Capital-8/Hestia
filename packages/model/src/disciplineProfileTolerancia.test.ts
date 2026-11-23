import { describe, expect, it } from 'vitest';
import {
  DISCIPLINES,
  createEmptyProject,
  disciplinaDaCategoria,
  disciplinasDoProjeto,
  migrateProject,
  planOf,
  tomDaCategoria,
  type Project,
} from './index.ts';

/** Projeto cru da versão 33 com dado inválido de disciplina em todos os campos (como um arquivo editado à mão). */
function projetoComDadoInvalido(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
  p.schemaVersion = 33;
  p.disciplineProfiles = { estrutura: { wall: 'x', inexistente: 'hidden' } };
  p.disciplines = [
    { id: '', name: 'x' },
    { id: 'arquitetura', name: 'dup' },
    { id: 'paisagismo', name: 'Paisagismo' },
  ];
  p.categoryDiscipline = { wall: 'nao-existe' };
  const levels = p.levels as Array<Record<string, unknown>>;
  levels[0]!.discipline = ' ';
  return p;
}

describe('tolerância a dado inválido de disciplina (leitura ignora, escrita preserva)', () => {
  it('perfil com tom e categoria inválidos não lança e a categoria cai no predefinido (halftone)', () => {
    const p = projetoComDadoInvalido() as unknown as Project;
    expect(() => tomDaCategoria(p, { discipline: 'estrutura' }, 'wall')).not.toThrow();
    expect(tomDaCategoria(p, { discipline: 'estrutura' }, 'wall')).toBe('halftone');
  });

  it('disciplinas do projeto ignoram id vazio e duplicata de embutida e aceitam só a nova', () => {
    const p = projetoComDadoInvalido() as unknown as Project;
    const efetivas = disciplinasDoProjeto(p);
    expect(efetivas).toHaveLength(DISCIPLINES.length + 1);
    expect(efetivas.map((d) => d.id)).toEqual([...DISCIPLINES, 'paisagismo']);
    expect(efetivas.at(-1)).toEqual({ id: 'paisagismo', name: 'Paisagismo' });
  });

  it('remapeamento para disciplina inexistente cai na origem do registro (arquitetura)', () => {
    const p = projetoComDadoInvalido() as unknown as Project;
    expect(disciplinaDaCategoria(p, 'wall')).toBe('arquitetura');
  });

  it('Level.discipline só com espaço cai em arquitetura na planta padrão', () => {
    const p = projetoComDadoInvalido() as unknown as Project;
    expect(planOf(p, p.levels[0]!.id).discipline).toBe('arquitetura');
  });

  it('o arquivo com esses dados inválidos salva e reabre com os MESMOS bytes', () => {
    const texto = JSON.stringify(projetoComDadoInvalido());
    const volta = migrateProject(JSON.parse(texto));
    expect(volta.schemaVersion).toBe(33);
    expect(JSON.stringify(volta)).toBe(texto);
    expect(JSON.stringify(migrateProject(JSON.parse(JSON.stringify(volta))))).toBe(texto);
  });
});
