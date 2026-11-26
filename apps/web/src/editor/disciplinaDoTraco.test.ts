import { createEmptyProject } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { disciplinaParaTracar } from './disciplinaDoTraco.ts';

const p = createEmptyProject('t');
const nivel = p.levels[0]?.id ?? 'lv_0';
const planta = { minhaDisciplina: null, view: 'plan', levelId: nivel, planKind: 'floor', planViewId: null } as const;

describe('aviso de disciplina ao traçar rede (B9, defeito 5; decisão do dono: só avisa)', () => {
  it('Tubo numa planta de Arquitetura indica Hidrossanitário como disciplina necessária (sem trocá-la)', () => {
    expect(disciplinaParaTracar('tubo', planta, p)).toBe('hidrossanitario');
  });

  it('Eletroduto numa planta de Arquitetura indica Elétrico', () => {
    expect(disciplinaParaTracar('eletroduto', planta, p)).toBe('eletrico');
  });

  it('a função é pura: não altera o estado recebido nem o projeto', () => {
    const st = { ...planta };
    const antes = JSON.stringify(p);
    disciplinaParaTracar('tubo', st, p);
    expect(st).toEqual(planta);
    expect(JSON.stringify(p)).toBe(antes);
  });

  it('quem já escolheu uma disciplina pessoal não recebe aviso', () => {
    expect(disciplinaParaTracar('tubo', { ...planta, minhaDisciplina: 'arquitetura' }, p)).toBeNull();
    expect(disciplinaParaTracar('tubo', { ...planta, minhaDisciplina: 'hidrossanitario' }, p)).toBeNull();
  });

  it('outras ferramentas e a vista 3D não geram aviso', () => {
    expect(disciplinaParaTracar('wall', planta, p)).toBeNull();
    expect(disciplinaParaTracar('select', planta, p)).toBeNull();
    expect(disciplinaParaTracar('tubo', { ...planta, view: '3d' }, p)).toBeNull();
  });
});
