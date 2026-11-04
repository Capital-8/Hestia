/**
 * Testes das funções puras da ferramenta de mutação de Rust (scripts/mutar-rust-lib.mjs): edição na linha
 * certa trocando só a primeira ocorrência, validação da lista, classificação do resultado, retomada e
 * resumo. Nada de wasm, nada de Rust, nada de processo filho.
 */
import { describe, expect, it } from 'vitest';
import {
  classificarResultado,
  editarTexto,
  idsProcessados,
  montarResumo,
  parsearArgs,
  ultimasLinhas,
  uniaoTestes,
  validarLista,
} from '../scripts/mutar-rust-lib.mjs';

const ARQUIVO = 'fn f() { let membrana = l.espessura < ESPESSURA_DE_MEMBRANA; let outro = a < b; }\nsegunda linha\n';
const lerTexto = (a: string) => (a === 'src/x.rs' ? ARQUIVO : null);
const mutacaoOk = { id: 'm1', arquivo: 'src/x.rs', linha: 1, de: 'l.espessura < ESPESSURA', para: 'l.espessura <= ESPESSURA', teste: 'tests/a.test.ts' };

describe('editarTexto', () => {
  it('troca só a primeira ocorrência na linha certa', () => {
    const r = editarTexto('a < b < c\nsegunda', 1, '<', '<=');
    expect(r.texto).toBe('a <= b < c\nsegunda');
    expect(r.linhaAntes).toBe('a < b < c');
    expect(r.linhaDepois).toBe('a <= b < c');
  });

  it('edita a linha indicada (1-based), não as outras', () => {
    const r = editarTexto(ARQUIVO, 1, 'a < b', 'a <= b');
    expect(r.linhaDepois).toContain('a <= b');
    expect(r.texto.split('\n')[1]).toBe('segunda linha');
  });

  it('preserva CRLF ao reconstruir o texto', () => {
    const r = editarTexto('a < b\r\nsegunda\r\n', 1, '<', '<=');
    expect(r.texto).toBe('a <= b\r\nsegunda\r\n');
    expect(r.linhaDepois).toBe('a <= b\r');
  });

  it('erro claro quando a linha não existe', () => {
    expect(() => editarTexto('uma linha só', 2, 'a', 'b')).toThrow(/não existe/);
    expect(() => editarTexto('x', 0, 'x', 'y')).toThrow(/>= 1/);
    expect(() => editarTexto('x', 1.5, 'x', 'y')).toThrow(/>= 1/);
  });

  it('erro claro quando o trecho não está na linha ou `de` é vazio', () => {
    expect(() => editarTexto(ARQUIVO, 2, 'l.espessura < ESPESSURA', 'x')).toThrow(/não foi encontrado/);
    expect(() => editarTexto(ARQUIVO, 1, '', 'x')).toThrow(/não vazio/);
    expect(() => editarTexto(ARQUIVO, 1, 42 as unknown as string, 'x')).toThrow(/não vazio/);
  });
});

describe('classificarResultado', () => {
  it('exit 0 sem estouro é SOBREVIVEU', () => {
    expect(classificarResultado({ exitCode: 0, tempoEsgotado: false })).toBe('SOBREVIVEU');
  });
  it('exit diferente de 0 é MORTA', () => {
    expect(classificarResultado({ exitCode: 1, tempoEsgotado: false })).toBe('MORTA');
    expect(classificarResultado({ exitCode: 2, tempoEsgotado: false })).toBe('MORTA');
    expect(classificarResultado({ exitCode: null, tempoEsgotado: false })).toBe('MORTA');
  });
  it('estouro de tempo é TIMEOUT e vence o exit code', () => {
    expect(classificarResultado({ exitCode: 0, tempoEsgotado: true })).toBe('TIMEOUT');
    expect(classificarResultado({ exitCode: 1, tempoEsgotado: true })).toBe('TIMEOUT');
  });
});

describe('validarLista', () => {
  it('aceita uma lista correta', () => {
    expect(validarLista([mutacaoOk], lerTexto)).toEqual([]);
  });
  it('rejeita lista vazia ou não array', () => {
    expect(validarLista([], lerTexto).length).toBe(1);
    expect(validarLista('x', lerTexto).length).toBe(1);
  });
  it('ids duplicados dão erro', () => {
    const erros = validarLista([mutacaoOk, { ...mutacaoOk, id: 'm1' }], lerTexto);
    expect(erros.some((e) => /duplicado/.test(e))).toBe(true);
  });
  it('arquivo inexistente dá erro', () => {
    const erros = validarLista([{ ...mutacaoOk, arquivo: 'src/nao-existe.rs' }], lerTexto);
    expect(erros.some((e) => /não existe/.test(e))).toBe(true);
  });
  it('linha fora do intervalo ou trecho inexistente dão erro claro', () => {
    expect(validarLista([{ ...mutacaoOk, linha: 99 }], lerTexto).some((e) => /não existe no arquivo/.test(e))).toBe(true);
    expect(validarLista([{ ...mutacaoOk, de: 'trecho que não está lá' }], lerTexto).some((e) => /não foi encontrado/.test(e))).toBe(true);
  });
  it('exige campos mínimos e `teste` caminho-ou-lista', () => {
    expect(validarLista([{ ...mutacaoOk, de: '' }], lerTexto).some((e) => /`de`/.test(e))).toBe(true);
    expect(validarLista([{ ...mutacaoOk, para: undefined }], lerTexto).some((e) => /`para`/.test(e))).toBe(true);
    expect(validarLista([{ ...mutacaoOk, teste: 7 }], lerTexto).some((e) => /`teste`/.test(e))).toBe(true);
    expect(validarLista([{ ...mutacaoOk, recorte: 7 }], lerTexto).some((e) => /`recorte`/.test(e))).toBe(true);
    expect(validarLista([{ ...mutacaoOk, teste: ['tests/a.test.ts', 'tests/b.test.ts'], recorte: '(A)' }], lerTexto)).toEqual([]);
  });
});

describe('retomada e união de testes', () => {
  it('idsProcessados lê o jsonl e ignora linhas corrompidas ou vazias', () => {
    const texto = JSON.stringify({ id: 'm1' }) + '\n\nlinha quebrada {\n' + JSON.stringify({ id: 'm2' }) + '\n{"sem_id":1}\n';
    expect([...idsProcessados(texto)]).toEqual(['m1', 'm2']);
    expect(idsProcessados('').size).toBe(0);
  });
  it('uniaoTestes deduplica caminhos de teste e aceita string ou lista', () => {
    expect(uniaoTestes([
      { teste: 'tests/a.test.ts' },
      { teste: ['tests/b.test.ts', 'tests/a.test.ts'] },
      { teste: 'tests/b.test.ts' },
    ])).toEqual(['tests/a.test.ts', 'tests/b.test.ts']);
  });
});

describe('parsearArgs', () => {
  it('extrai lista, saida e defaults', () => {
    expect(parsearArgs(['--lista', 'a.json', '--saida', 'out'])).toEqual({ lista: 'a.json', saida: 'out', timeoutMin: 20, baseline: false, dry: false });
  });
  it('aceita flags e --timeout-min', () => {
    const o = parsearArgs(['--lista', 'a.json', '--saida', 'out', '--timeout-min', '5', '--baseline', '--dry']);
    expect(o.timeoutMin).toBe(5);
    expect(o.baseline).toBe(true);
    expect(o.dry).toBe(true);
  });
  it('recusa argumento desconhecido, valor faltando e números inválidos', () => {
    expect(() => parsearArgs(['--lista', 'a.json', '--saida', 'out', '--x'])).toThrow(/desconhecido/);
    expect(() => parsearArgs(['--saida', 'out'])).toThrow(/--lista/);
    expect(() => parsearArgs(['--lista', 'a.json'])).toThrow(/--saida/);
    expect(() => parsearArgs(['--lista', 'a.json', '--saida'])).toThrow(/exige um valor/);
    expect(() => parsearArgs(['--lista', 'a.json', '--saida', 'out', '--timeout-min', '0'])).toThrow(/> 0/);
  });
});

describe('montarResumo e ultimasLinhas', () => {
  const registros = [
    { id: 'm1', arquivo: 'src/x.rs', linha: 1, de: 'a < b', para: 'a <= b', resultado: 'MORTA', duracao_s: 12.3, linha_antes: 'a < b', linha_depois: 'a <= b' },
    { id: 'm2', arquivo: 'src/y.rs', linha: 4, de: 'c >= d', para: 'c > d', resultado: 'SOBREVIVEU', duracao_s: 45.6, linha_antes: 'x: c >= d,', linha_depois: 'x: c > d,' },
    { id: 'm3', arquivo: 'src/z.rs', linha: 5, de: 'e', para: 'f', resultado: 'COMPILA_ERRO', duracao_s: 3 },
    { id: 'm4', arquivo: 'src/w.rs', linha: 6, de: 'g', para: 'h', resultado: 'TIMEOUT', duracao_s: 1200 },
  ];
  const md = montarResumo(registros);
  it('monta a tabela com todas as linhas', () => {
    expect(md).toContain('| # | arquivo:linha | de -> para | resultado | duração |');
    expect(md).toContain('| 1 | src/x.rs:1 | a < b -> a <= b | MORTA | 12.3 s |');
    expect(md).toContain('TIMEOUT | 1200.0 s');
  });
  it('soma os totais das quatro classes', () => {
    expect(md).toContain('MORTA: 1 | SOBREVIVEU: 1 | COMPILA_ERRO: 1 | TIMEOUT: 1 | total: 4');
  });
  it('inclui o diff exato dos SOBREVIVEU e só deles', () => {
    expect(md).toContain('-x: c >= d,');
    expect(md).toContain('+x: c > d,');
    expect(md).not.toContain('-a < b');
  });
  it('ultimasLinhas devolve as n últimas', () => {
    expect(ultimasLinhas('l1\nl2\nl3\n', 2)).toBe('l2\nl3');
    expect(ultimasLinhas('única\n', 15)).toBe('única');
  });
});
