import { FAMILIA_ARMARIO, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { CHAVE_MEUS_MODELOS, guardarModelo, lerMeusModelos, removerModelo, type Armazenamento } from './meusModelos.ts';

interface Memoria extends Armazenamento {
  dados: Map<string, string>;
}

function memoria(inicial: Record<string, string> = {}): Memoria {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => { dados.set(chave, valor); },
  };
}

const clone = (): Familia => structuredClone(FAMILIA_ARMARIO);

describe('lerMeusModelos', () => {
  it('sem nada guardado devolve lista vazia', () => {
    expect(lerMeusModelos(memoria())).toEqual([]);
  });

  it('JSON corrompido vira lista vazia sem lançar', () => {
    expect(lerMeusModelos(memoria({ [CHAVE_MEUS_MODELOS]: '{quebrado' }))).toEqual([]);
    expect(lerMeusModelos(memoria({ [CHAVE_MEUS_MODELOS]: 'null' }))).toEqual([]);
  });

  it('armazenamento bloqueado vira lista vazia', () => {
    const storage: Armazenamento = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => undefined,
    };
    expect(lerMeusModelos(storage)).toEqual([]);
  });

  it('descarta família inválida e mantém as boas', () => {
    const texto = JSON.stringify({
      formato: 'hestia-familia',
      versao: 1,
      familias: [clone(), { id: 'sem_nome' }],
    });
    expect(lerMeusModelos(memoria({ [CHAVE_MEUS_MODELOS]: texto }))).toHaveLength(1);
  });
});

describe('guardarModelo e removerModelo', () => {
  it('guarda, relê e substitui a de mesmo id', () => {
    const storage = memoria();
    guardarModelo(storage, clone());
    expect(lerMeusModelos(storage)).toHaveLength(1);

    const outra = clone();
    outra.nome = 'Armário novo';
    guardarModelo(storage, outra);
    const lidas = lerMeusModelos(storage);
    expect(lidas).toHaveLength(1);
    expect(lidas[0]!.nome).toBe('Armário novo');
  });

  it('guarda uma cópia profunda', () => {
    const storage = memoria();
    const original = clone();
    guardarModelo(storage, original);
    original.nome = 'mexido';
    expect(lerMeusModelos(storage)[0]!.nome).not.toBe('mexido');
  });

  it('mantém no máximo 100 famílias, deixando sair a mais antiga', () => {
    const storage = memoria();
    for (let i = 1; i <= 101; i++) {
      const f = clone();
      f.id = `fam_teste_${i}`;
      f.nome = `Modelo ${i}`;
      guardarModelo(storage, f);
    }
    const lidas = lerMeusModelos(storage);
    expect(lidas).toHaveLength(100);
    expect(lidas[0]!.id).toBe('fam_teste_2');
    expect(lidas[lidas.length - 1]!.id).toBe('fam_teste_101');
  });

  it('remove pelo id', () => {
    const storage = memoria();
    const a = clone();
    const b = clone();
    b.id = 'fam_outra';
    b.nome = 'Outra';
    guardarModelo(storage, a);
    guardarModelo(storage, b);
    const restantes = removerModelo(storage, a.id);
    expect(restantes.map((f) => f.id)).toEqual(['fam_outra']);
    expect(lerMeusModelos(storage).map((f) => f.id)).toEqual(['fam_outra']);
  });
});
