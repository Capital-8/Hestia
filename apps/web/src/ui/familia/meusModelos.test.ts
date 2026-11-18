import { exportarFamilias, FAMILIA_ARMARIO, importarFamilias, lerArquivo, serializar, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { CHAVE_MEUS_MODELOS, guardarModelo, lerMeusModelos, mesclarMeusModelos, removerModelo, type Armazenamento } from './meusModelos.ts';

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
  }, 30000);

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

describe('exportar e importar "Meus modelos" (arquivo hestia-familia)', () => {
  it('ida e volta pelo arquivo preserva id, nome e parâmetros', () => {
    const storage = memoria();
    guardarModelo(storage, clone());
    const texto = serializar(exportarFamilias(lerMeusModelos(storage)));
    const r = lerArquivo(texto);
    expect(r.ignoradas).toEqual([]);
    expect(r.familias).toHaveLength(1);
    const lida = r.familias[0]!;
    expect(lida.id).toBe('fam_armario_baixo');
    expect(lida.nome).toBe('Armário baixo');
    expect(lida.parametros[0]).toMatchObject({ id: 'L', nome: 'Largura', padrao: 800 });
    expect(lida.parametros.find((p) => p.id === 'corpo')).toMatchObject({ nome: 'Chapa do corpo', padrao: 'mdf18' });
  });

  it('importação mescla: a de mesmo id é substituída e as demais ficam', () => {
    const storage = memoria();
    const antiga = clone();
    antiga.nome = 'Versão antiga';
    guardarModelo(storage, antiga);
    const outra = clone();
    outra.id = 'fam_mesa';
    outra.nome = 'Mesa';
    const lista = mesclarMeusModelos(storage, [clone(), outra]);
    expect(lista.map((f) => f.id)).toEqual(['fam_armario_baixo', 'fam_mesa']);
    expect(lerMeusModelos(storage).map((f) => f.nome)).toEqual(['Armário baixo', 'Mesa']);
  });

  it('arquivo de outro formato ou JSON quebrado é recusado com mensagem', () => {
    expect(() => lerArquivo('{quebrado')).toThrow('Arquivo inválido');
    expect(() => lerArquivo(JSON.stringify({ formato: 'outro', versao: 1, familias: [] }))).toThrow('O arquivo não é de famílias do Hestia.');
  });

  it('família ruim dentro de arquivo válido é ignorada e as boas entram', () => {
    const texto = JSON.stringify({ formato: 'hestia-familia', versao: 1, familias: [{ id: 'x' }, clone()] });
    const r = importarFamilias(JSON.parse(texto));
    expect(r.familias.map((f) => f.id)).toEqual(['fam_armario_baixo']);
    expect(r.ignoradas).toHaveLength(1);
    expect(r.ignoradas[0]!.nome).toBe('(sem nome)');
  });
});
