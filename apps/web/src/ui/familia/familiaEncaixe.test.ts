import {
  FAMILIA_ARMARIO,
  HistoricoFamilia,
  adicionarConector,
  adicionarEscolha,
  editarConector,
  editarEscolha,
  excluirConector,
  excluirEscolha,
  type Escolha,
  type Familia,
  type Parametro,
  type Peca,
} from '@hestia/model';
import { describe, expect, it } from 'vitest';
import {
  LADOS_CONECTOR,
  ROTULO_LADO,
  aceitaDoTexto,
  escolhaNova,
  conectorNovo,
  escreverFolga,
  motivoNovoEscolha,
  opcoesDeParametro,
  parametrosParaEscolha,
  proximoIdConector,
  proximoIdEscolha,
  textoDeAceita,
  zonasDaFamilia,
} from './familiaEncaixe.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const peca = (f: Familia, id: string): Peca => f.pecas.find((p) => p.id === id)!;
const param = (f: Familia, id: string): Parametro => f.parametros.find((p) => p.id === id)!;

describe('lados e rótulos', () => {
  it('os seis lados da validação, cada um com rótulo', () => {
    expect(LADOS_CONECTOR).toEqual(['esquerda', 'direita', 'frente', 'fundo', 'base', 'topo']);
    expect(LADOS_CONECTOR.map((l) => ROTULO_LADO[l])).toEqual(['Esquerda', 'Direita', 'Frente', 'Fundo', 'Base', 'Topo']);
  });
});

describe('parametrosParaEscolha', () => {
  it('só enum, booleano e inteiro sem fórmula', () => {
    const f = nova();
    f.parametros.push({ id: 'flag', nome: 'Flag', tipo: 'booleano', escopo: 'tipo', padrao: false });
    const ids = parametrosParaEscolha(f).map((p) => p.id);
    expect(ids).toEqual(['montagem', 'fundo', 'tampo', 'nPrat', 'nPortas', 'flag']);
    expect(ids).not.toContain('corpo');
    expect(ids).not.toContain('L');
  });

  it('exclui parâmetro com fórmula e família sem nenhum', () => {
    const f = nova();
    expect(parametrosParaEscolha(f).some((p) => p.id === 'esp')).toBe(false);
    const vazio = nova();
    vazio.parametros = [];
    expect(parametrosParaEscolha(vazio)).toEqual([]);
  });
});

describe('zonasDaFamilia', () => {
  it('grupos das peças sem repetição e na ordem de aparição', () => {
    const f = nova();
    expect(zonasDaFamilia(f)).toEqual([]);
    peca(f, 'base').grupo = 'corpo';
    peca(f, 'prat').grupo = 'prateleiras';
    peca(f, 'trF').grupo = 'corpo';
    expect(zonasDaFamilia(f)).toEqual(['corpo', 'prateleiras']);
  });

  it('ignora grupo vazio', () => {
    const f = nova();
    peca(f, 'base').grupo = '';
    expect(zonasDaFamilia(f)).toEqual([]);
  });
});

describe('motivoNovoEscolha', () => {
  it('aponta o que falta; null quando há parâmetro e zona', () => {
    const f = nova();
    expect(motivoNovoEscolha(f)).toMatch('grupo');
    peca(f, 'base').grupo = 'corpo';
    expect(motivoNovoEscolha(f)).toBeNull();

    const semParam = nova();
    semParam.parametros = semParam.parametros.filter((p) => p.tipo !== 'enum' && p.tipo !== 'booleano' && p.tipo !== 'inteiro');
    expect(motivoNovoEscolha(semParam)).toMatch('parâmetro');
  });
});

describe('opcoesDeParametro', () => {
  it('enum usa rótulos, booleano Sim/Não, inteiro com faixa a sequência', () => {
    const f = nova();
    expect(opcoesDeParametro(param(f, 'montagem'))).toEqual(['Laterais sobre a base', 'Base entre as laterais']);
    expect(opcoesDeParametro(param(f, 'nPrat'))).toEqual(['0', '1', '2', '3', '4', '5', '6']);

    const semRotulo: Parametro = { id: 'e', nome: 'E', tipo: 'enum', escopo: 'tipo', padrao: 'a', opcoes: [{ valor: 'a' }, { valor: 'b' }] };
    expect(opcoesDeParametro(semRotulo)).toEqual(['a', 'b']);

    const flag: Parametro = { id: 'flag', nome: 'Flag', tipo: 'booleano', escopo: 'tipo', padrao: false };
    expect(opcoesDeParametro(flag)).toEqual(['Sim', 'Não']);
  });

  it('bordas: enum sem opções, inteiro sem faixa, fora de escolha e faixa enorme listam vazio', () => {
    const semOpcoes: Parametro = { id: 'e', nome: 'E', tipo: 'enum', escopo: 'tipo', padrao: '', opcoes: [] };
    expect(opcoesDeParametro(semOpcoes)).toEqual([]);

    const livre: Parametro = { id: 'n', nome: 'N', tipo: 'inteiro', escopo: 'tipo', padrao: 0 };
    expect(opcoesDeParametro(livre)).toEqual([]);

    const invertida: Parametro = { ...livre, min: 5, max: 2 };
    expect(opcoesDeParametro(invertida)).toEqual([]);

    const gigante: Parametro = { ...livre, min: 0, max: 1_000_000 };
    expect(opcoesDeParametro(gigante)).toEqual([]);

    const texto: Parametro = { id: 't', nome: 'T', tipo: 'texto', escopo: 'tipo', padrao: '' };
    expect(opcoesDeParametro(texto)).toEqual([]);
  });
});

describe('aceita: texto ↔ lista', () => {
  it('texto vazio ou só vírgulas vira lista vazia e volta a vazio', () => {
    expect(aceitaDoTexto('')).toEqual([]);
    expect(aceitaDoTexto(' , ,')).toEqual([]);
    expect(textoDeAceita([])).toBe('');
    expect(textoDeAceita(undefined)).toBe('');
  });

  it('separa por vírgula, apara, descarta vazios e repetidos', () => {
    expect(aceitaDoTexto(' base ,aereo, base ,, torre ')).toEqual(['base', 'aereo', 'torre']);
    expect(textoDeAceita(['base', 'aereo'])).toBe('base, aereo');
  });
});

describe('ids e objetos novos', () => {
  it('proximoId evita colisões inclusive com ids manuais', () => {
    const f = nova();
    expect(proximoIdConector(f)).toBe('conector_1');
    expect(adicionarConector(f, conectorNovo('conector_1', 'Um', 'esquerda'))).toBeNull();
    f.conectores!.push(conectorNovo('manual', 'Manual', 'topo'));
    expect(proximoIdConector(f)).toBe('conector_2');

    expect(proximoIdEscolha(f)).toBe('escolha_1');
    const e: Escolha = escolhaNova('escolha_1', 'Uma', 'montagem', 'corpo');
    expect(adicionarEscolha(f, e)).toBeNull();
    expect(proximoIdEscolha(f)).toBe('escolha_2');
    expect(e).toEqual({ id: 'escolha_1', nome: 'Uma', parametro: 'montagem', zona: 'corpo' });
  });

  it('conector novo nasce sem aceita nem folga', () => {
    expect(conectorNovo('c1', 'Um', 'frente')).toEqual({ id: 'c1', nome: 'Um', lado: 'frente', etiqueta: '' });
  });
});

describe('escreverFolga', () => {
  it('texto grava pela operação e vazio remove o campo', () => {
    const f = nova();
    expect(adicionarConector(f, conectorNovo('c', 'C', 'direita'))).toBeNull();
    expect(escreverFolga(f, 'c', ' 2 ')).toBeNull();
    expect(f.conectores![0]!.folga).toBe('2');
    expect(escreverFolga(f, 'c', '  ')).toBeNull();
    expect('folga' in f.conectores![0]!).toBe(false);
  });

  it('recusa conector inexistente e fórmula longa sem alterar', () => {
    const f = nova();
    expect(escreverFolga(f, 'nao_existe', '2')).toMatch('não existe');
    expect(adicionarConector(f, conectorNovo('c', 'C', 'direita'))).toBeNull();
    const antes = JSON.stringify(f.conectores);
    expect(escreverFolga(f, 'c', 'x'.repeat(513))).toMatch('512');
    expect(JSON.stringify(f.conectores)).toBe(antes);
  });
});

describe('operações pelo HistoricoFamilia (desfazer/refazer)', () => {
  /** Mesma mecânica do `executar` da store: recusa lança e o histórico não ganha passo. */
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

  const comConector = (): HistoricoFamilia<Familia> => {
    const h = new HistoricoFamilia<Familia>(nova());
    h.exec('Novo conector', (rascunho) => {
      adicionarConector(rascunho as unknown as Familia, conectorNovo('c', 'Lado direito', 'direita'));
    });
    return h;
  };

  it('adicionar, editar e excluir conector num passo cada, com desfazer e refazer', () => {
    const h = comConector();
    expect(h.atual.conectores).toHaveLength(1);

    expect(executar(h, 'Renomear conector', (f) => editarConector(f, 'c', { nome: 'Direita' }))).toBeNull();
    expect(h.atual.conectores![0]!.nome).toBe('Direita');
    expect(h.desfazer()).toBe(true);
    expect(h.atual.conectores![0]!.nome).toBe('Lado direito');
    expect(h.refazer()).toBe(true);
    expect(h.atual.conectores![0]!.nome).toBe('Direita');

    expect(executar(h, 'Excluir conector', (f) => excluirConector(f, 'c'))).toBeNull();
    expect(h.atual.conectores).toHaveLength(0);
    expect(h.desfazer()).toBe(true);
    expect(h.atual.conectores![0]!.nome).toBe('Direita');
  });

  it('recusa não cria passo: desfazer continua no último passo bom', () => {
    const h = comConector();
    const versaoAntes = h.versao;
    const motivo = executar(h, 'Novo conector', (f) => adicionarConector(f, conectorNovo('c', 'Repetido', 'base')));
    expect(motivo).not.toBeNull();
    expect(h.versao).toBe(versaoAntes);
    expect(h.atual.conectores).toHaveLength(1);

    expect(executar(h, 'Editar inexistente', (f) => editarConector(f, 'zz', { nome: 'X' }))).toMatch('não existe');
    expect(h.rotuloDesfazer).toBe('Novo conector');
  });

  it('escolhas: adicionar, editar e excluir com desfazer e refazer', () => {
    const f0 = nova();
    peca(f0, 'porta').grupo = 'frentes';
    const h = new HistoricoFamilia<Familia>(f0);
    const e = escolhaNova('e1', 'Porta', 'fundo', 'frentes');

    expect(executar(h, 'Nova escolha', (f) => adicionarEscolha(f, e))).toBeNull();
    expect(h.atual.escolhas).toHaveLength(1);

    expect(executar(h, 'Editar escolha', (f) => editarEscolha(f, 'e1', { zona: 'frentes', nome: 'Fundo' }))).toBeNull();
    expect(h.atual.escolhas![0]!.nome).toBe('Fundo');

    expect(executar(h, 'Excluir escolha', (f) => excluirEscolha(f, 'e1'))).toBeNull();
    expect(h.atual.escolhas).toHaveLength(0);
    expect(h.desfazer()).toBe(true);
    expect(h.atual.escolhas![0]!.nome).toBe('Fundo');
    expect(h.refazer()).toBe(true);
    expect(h.atual.escolhas).toHaveLength(0);
  });
});
