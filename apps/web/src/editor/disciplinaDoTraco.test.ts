import { createEmptyProject } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { disciplinaParaTracar } from './disciplinaDoTraco.ts';

const p = createEmptyProject('t');
const nivel = p.levels[0]?.id ?? 'lv_0';
const planta = { minhaDisciplina: null, view: 'plan', levelId: nivel, planKind: 'floor', planViewId: null } as const;

describe('disciplina de trabalho ao traçar rede (B9, defeito 5)', () => {
  it('Tubo numa planta de Arquitetura passa a disciplina pessoal para Hidrossanitário', () => {
    expect(disciplinaParaTracar('tubo', planta, p)).toBe('hidrossanitario');
  });

  it('Eletroduto numa planta de Arquitetura passa para Elétrico', () => {
    expect(disciplinaParaTracar('eletroduto', planta, p)).toBe('eletrico');
  });

  it('quem já escolheu uma disciplina pessoal não é trocado', () => {
    expect(disciplinaParaTracar('tubo', { ...planta, minhaDisciplina: 'arquitetura' }, p)).toBeNull();
    expect(disciplinaParaTracar('tubo', { ...planta, minhaDisciplina: 'hidrossanitario' }, p)).toBeNull();
  });

  it('outras ferramentas e a vista 3D ficam como estão', () => {
    expect(disciplinaParaTracar('wall', planta, p)).toBeNull();
    expect(disciplinaParaTracar('select', planta, p)).toBeNull();
    expect(disciplinaParaTracar('tubo', { ...planta, view: '3d' }, p)).toBeNull();
  });
});
