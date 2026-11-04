import { FAMILIA_ARMARIO, HistoricoFamilia, type Aninhado, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import {
  ROTACOES_ANINHADO,
  familiasParaAninhar,
  idLivreDeAninhado,
  montarAninhado,
  nomeDaFamilia,
  patchDoAninhado,
  rotacaoDeTexto,
  validarEntrada,
  type EntradaAninhado,
} from './familiaAninhado.ts';

/*
 * Testes puros da lógica do diálogo de módulo aninhado. As operações do modelo (`adicionarAninhado` etc.) ainda são
 * contrato em outra ficha, então aqui só funções puras e dublês — o orquestrador roda o conjunto integrado.
 */

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const familiaFalsa = (id: string, nome: string): Familia => {
  const f = nova();
  f.id = id;
  f.nome = nome;
  return f;
};
const entrada = (extra: Partial<EntradaAninhado> = {}): EntradaAninhado => ({
  familiaId: 'armario',
  tipoId: '',
  nome: '',
  id: 'aninhado_1',
  origem: ['', '', ''],
  rotacao: '',
  ...extra,
});

describe('familiasParaAninhar', () => {
  it('exclui a própria família em edição', () => {
    const base = [familiaFalsa('a', 'A'), familiaFalsa('b', 'B')];
    expect(familiasParaAninhar(base, [], 'a').map((f) => f.id)).toEqual(['b']);
  });

  it('mistura projeto e biblioteca sem repetir id', () => {
    const base = [familiaFalsa('a', 'A base'), familiaFalsa('b', 'B')];
    const projeto = [familiaFalsa('a', 'A do projeto'), familiaFalsa('c', 'C')];
    const ids = familiasParaAninhar(base, projeto, 'propria').map((f) => f.id);
    expect(ids).toEqual(['a', 'c', 'b']);
    expect(familiasParaAninhar(base, projeto, 'propria')[0]?.nome).toBe('A do projeto');
  });

  it('família sem id utilizável é ignorada', () => {
    const suja = [familiaFalsa('x', 'X'), undefined as unknown as Familia];
    expect(familiasParaAninhar(suja, [], 'x').map((f) => f.id)).toEqual([]);
  });
});

describe('nomeDaFamilia', () => {
  it('acha o nome na lista e cai no id quando a família não está lá', () => {
    const listas = [familiaFalsa('a', 'A')] as readonly Familia[];
    expect(nomeDaFamilia(listas, 'a')).toBe('A');
    expect(nomeDaFamilia(listas, 'desconhecida')).toBe('desconhecida');
  });
});

describe('idLivreDeAninhado', () => {
  it('começa em aninhado_1 e anda até o primeiro livre', () => {
    const f = nova();
    expect(idLivreDeAninhado(f)).toBe('aninhado_1');
    f.aninhados = [{ id: 'aninhado_1', nome: 'Um', familiaId: 'a', valores: {}, origem: ['0', '0', '0'] }];
    expect(idLivreDeAninhado(f)).toBe('aninhado_2');
  });

  it('também desvia dos ids das peças (o modelo recusa repetição entre aninhados e peças)', () => {
    const f = nova();
    f.aninhados = [];
    const colidido = f.pecas[0];
    if (colidido !== undefined) colidido.id = 'aninhado_1';
    expect(idLivreDeAninhado(f)).toBe('aninhado_2');
  });

  it('aninhado sem lista definida vira aninhado_1', () => {
    const f = nova();
    delete (f as Partial<Familia>).aninhados;
    expect(idLivreDeAninhado(f)).toBe('aninhado_1');
  });
});

describe('rotacaoDeTexto', () => {
  it('normaliza os graus do select como número em texto', () => {
    expect(rotacaoDeTexto('')).toBe('0');
    expect(rotacaoDeTexto('0')).toBe('0');
    expect(rotacaoDeTexto(' 90 ')).toBe('90');
    expect(rotacaoDeTexto('090')).toBe('90');
    expect(rotacaoDeTexto('270')).toBe('270');
  });

  it('texto que não é rotação válida vira 0', () => {
    expect(rotacaoDeTexto('abc')).toBe('0');
    expect(rotacaoDeTexto('45')).toBe('0');
    expect(rotacaoDeTexto('-90')).toBe('0');
    expect(ROTACOES_ANINHADO).toEqual([0, 90, 180, 270]);
  });
});

describe('validarEntrada', () => {
  it('família vazia é recusada com motivo', () => {
    expect(validarEntrada(entrada({ familiaId: '' }))).toMatch('família');
    expect(validarEntrada(entrada({ familiaId: '   ' }))).toMatch('família');
  });

  it('nome vazio é recusado com motivo', () => {
    expect(validarEntrada(entrada({ nome: '' }))).toMatch('nome');
    expect(validarEntrada(entrada({ nome: '  ' }))).toMatch('nome');
  });

  it('id vazio é recusado; entrada completa passa', () => {
    expect(validarEntrada(entrada({ id: '', nome: 'Um' }))).toMatch('id');
    expect(validarEntrada(entrada({ nome: 'Módulo' }))).toBeNull();
  });
});

describe('montarAninhado', () => {
  it('nome vazio ganha o nome da família escolhida', () => {
    const familias = [familiaFalsa('a', 'A')];
    expect(montarAninhado(entrada({ familiaId: 'a' }), familias).nome).toBe('A');
    expect(montarAninhado(entrada({ familiaId: 'a', nome: ' Torre ' }), familias).nome).toBe('Torre');
  });

  it('tipo "Padrão" fica ausente; tipo escolhido entra', () => {
    const familias = [familiaFalsa('a', 'A')];
    expect('tipoId' in montarAninhado(entrada({ familiaId: 'a' }), familias)).toBe(false);
    expect(montarAninhado(entrada({ familiaId: 'a', tipoId: 't1' }), familias).tipoId).toBe('t1');
  });

  it('origem vazia vira "0" e texto é aparado; valores nasce vazio', () => {
    const a = montarAninhado(entrada({ origem: ['', ' L / 2 ', ' 3 '] }), []);
    expect(a.origem).toEqual(['0', 'L / 2', '3']);
    expect(a.valores).toEqual({});
  });

  it('rotação sai como número em texto, com padrão 0', () => {
    expect(montarAninhado(entrada(), []).rotacao).toBe('0');
    expect(montarAninhado(entrada({ rotacao: '180' }), []).rotacao).toBe('180');
  });

  it('família inexistente não quebra e nome do aninhado sem família fica vazio', () => {
    const a = montarAninhado(entrada({ familiaId: 'zz' }), []);
    expect(a.familiaId).toBe('zz');
    expect(a.nome).toBe('');
  });
});

describe('patchDoAninhado', () => {
  it('não leva o id e mantém os valores atuais na edição', () => {
    const familias = [familiaFalsa('a', 'A')];
    const valores = { L: '900' };
    const patch = patchDoAninhado(entrada({ familiaId: 'a' }), familias, valores);
    expect('id' in patch).toBe(false);
    expect(patch.valores).toBe(valores);
    expect(patch.nome).toBe('A');
  });

  it('"Padrão" no tipo leva a chave presente para o modelo limpar o tipo antigo', () => {
    const patch = patchDoAninhado(entrada({ tipoId: '' }), []);
    expect('tipoId' in patch).toBe(true);
    expect(patch.tipoId).toBeUndefined();
  });
});

describe('criação pela store com dublês das operações do modelo', () => {
  /** Dublê fiel ao contrato de `adicionarAninhado`: id repetido (aninhados E peças) e família própria recusam. */
  const adicionarDuble = (f: Familia, a: Aninhado): string | null => {
    if (a.id.trim() === '') return 'o id não pode ficar vazio';
    if (a.familiaId.trim() === '') return 'a família aninhada precisa ser escolhida';
    if (a.familiaId === f.id) return 'uma família não pode se aninhar nela mesma';
    const repetido = [...(Array.isArray(f.aninhados) ? f.aninhados : []), ...f.pecas].some((x) => x?.id === a.id);
    if (repetido) return `id “${a.id}” já está em uso`;
    if (!Array.isArray(f.aninhados)) f.aninhados = [];
    f.aninhados.push(a);
    return null;
  };

  const executar = (h: HistoricoFamilia<Familia>, rotulo: string, receita: (f: Familia) => string | null): string | null => {
    try {
      h.exec(rotulo, (rascunho) => {
        const motivo = receita(rascunho as unknown as Familia);
        if (motivo !== null) throw new Error(motivo);
      });
      return null;
    } catch (erro) {
      return erro instanceof Error ? erro.message : String(erro);
    }
  };

  it('criar é um passo de desfazer e desfazer remove o aninhado', () => {
    const f = nova();
    f.aninhados = [];
    const h = new HistoricoFamilia<Familia>(f);
    const familias = [familiaFalsa('armario2', 'Armário pequeno')];
    const a = montarAninhado(entrada({ familiaId: 'armario2', id: idLivreDeAninhado(f) }), familias);

    expect(executar(h, 'Novo módulo aninhado', (rascunho) => adicionarDuble(rascunho, a))).toBeNull();
    expect(h.atual.aninhados).toHaveLength(1);
    expect(h.atual.aninhados[0]?.nome).toBe('Armário pequeno');
    expect(h.desfazer()).toBe(true);
    expect(h.atual.aninhados).toHaveLength(0);
    expect(h.refazer()).toBe(true);
    expect(h.atual.aninhados).toHaveLength(1);
  });

  it('recusa do modelo não cria passo e devolve o motivo', () => {
    const f = nova();
    f.aninhados = [{ id: 'aninhado_1', nome: 'Um', familiaId: 'x', valores: {}, origem: ['0', '0', '0'] }];
    const h = new HistoricoFamilia<Familia>(f);
    const versao = h.versao;
    const a = montarAninhado(entrada({ id: 'aninhado_1' }), []);
    expect(executar(h, 'Novo módulo aninhado', (rascunho) => adicionarDuble(rascunho, a))).toMatch('em uso');
    expect(h.versao).toBe(versao);
    expect(h.atual.aninhados).toHaveLength(1);
  });
});
