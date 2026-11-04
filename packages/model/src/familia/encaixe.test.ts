import { describe, expect, it } from 'vitest';
import {
  adicionarConector,
  adicionarEscolha,
  adicionarParametro,
  editarConector,
  editarEscolha,
  excluirConector,
  excluirEscolha,
  excluirParametro,
  renomearParametro,
} from './edicao.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { HistoricoFamilia } from './historico.ts';
import type { Conector, Escolha, Familia, Peca } from './tipos.ts';
import { validarFamilia, type CodigoProblema } from './validar.ts';

/*
 * Ficha ESC-modelo: validação (`validarEncaixe.ts`) e edição (`edicaoEncaixe.ts`) de conectores e escolhas.
 */

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const peca = (f: Familia, id: string): Peca => f.pecas.find((p) => p.id === id)!;
const achar = (f: Familia, codigo: CodigoProblema, onde?: string): number =>
  validarFamilia(f).filter((p) => p.codigo === codigo && (onde === undefined || p.onde === onde)).length;
const limpa = (f: Familia): void => expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
const intacta = (f: Familia, fn: (f: Familia) => string | null): string => {
  const antes = JSON.stringify(f);
  const r = fn(f);
  expect(r).not.toBeNull();
  expect(JSON.stringify(f)).toBe(antes);
  return r!;
};

const con = (extra: Partial<Conector> = {}): Conector => ({ id: 'esq', nome: 'União esquerda', lado: 'esquerda', etiqueta: 'modulo', ...extra });
const escol = (extra: Partial<Escolha> = {}): Escolha => ({ id: 'fundoTipo', nome: 'Tipo de fundo', parametro: 'fundo', zona: 'traseira', ...extra });

/** Família de exemplo com uma zona de peça e um encaixe mínimo válido (um conector com folga e uma escolha). */
const comEncaixe = (): Familia => {
  const f = nova();
  peca(f, 'fundo').grupo = 'traseira';
  f.conectores = [con({ folga: 'esp / 2', aceita: ['modulo', 'parede'] })];
  f.escolhas = [escol()];
  return f;
};

describe('validarEncaixe: conectores', () => {
  it('passa sem conectores e com conectores válidos (folga usando parâmetro e chapa.esp)', () => {
    limpa(nova());
    limpa(comEncaixe());
    const f = comEncaixe();
    f.conectores!.push(con({ id: 'dir', lado: 'direita', folga: 'corpo.esp + 1' }));
    limpa(f);
  });
  it('recusa id vazio, id repetido, lado inválido e etiqueta vazia', () => {
    const a = comEncaixe();
    a.conectores![0]!.id = '';
    expect(achar(a, 'obrigatorio', 'conector:')).toBe(1);
    const b = comEncaixe();
    b.conectores!.push(con());
    expect(achar(b, 'id_duplicado', 'conector:esq')).toBe(1);
    const c = comEncaixe();
    c.conectores![0]!.lado = 'tras' as Conector['lado'];
    expect(achar(c, 'tipo', 'conector:esq.lado')).toBe(1);
    const d = comEncaixe();
    d.conectores![0]!.etiqueta = '  ';
    expect(achar(d, 'obrigatorio', 'conector:esq.etiqueta')).toBe(1);
  });
  it('folga: precisa compilar e só pode referenciar parâmetros existentes', () => {
    const a = comEncaixe();
    a.conectores![0]!.folga = '1 +';
    expect(achar(a, 'formula', 'conector:esq.folga')).toBe(1);
    const b = comEncaixe();
    b.conectores![0]!.folga = 'inexistente * 2';
    expect(achar(b, 'referencia', 'conector:esq.folga')).toBe(1);
    const c = comEncaixe();
    c.conectores![0]!.folga = 'pDir';
    expect(achar(c, 'referencia', 'conector:esq.folga')).toBe(1);
    const d = comEncaixe();
    d.conectores![0]!.folga = 'i + 1';
    expect(achar(d, 'referencia', 'conector:esq.folga')).toBe(1);
  });
  it('entrada estranha: item que não é objeto vira problema, não exceção', () => {
    const f = comEncaixe();
    f.conectores = [con(), 'lixo' as unknown as Conector];
    expect(achar(f, 'tipo', 'conector:?')).toBe(1);
  });
});

describe('validarEncaixe: escolhas', () => {
  it('passa com enum, booleano e inteiro apontando para zona com peça', () => {
    limpa(comEncaixe());
    const f = comEncaixe();
    expect(adicionarParametro(f, { id: 'ativo', nome: 'Ativo', tipo: 'booleano', escopo: 'tipo', padrao: false })).toBeNull();
    expect(adicionarParametro(f, { id: 'nivel', nome: 'Niveis', tipo: 'inteiro', escopo: 'tipo', padrao: 1, min: 0, max: 3, passo: 1 })).toBeNull();
    f.escolhas!.push(escol({ id: 'ativoTipo', parametro: 'ativo' }));
    f.escolhas!.push(escol({ id: 'nivelTipo', parametro: 'nivel' }));
    limpa(f);
  });
  it('recusa id vazio ou repetido, parâmetro inexistente, tipo errado e zona sem peça', () => {
    const a = comEncaixe();
    a.escolhas!.push(escol());
    expect(achar(a, 'id_duplicado', 'escolha:fundoTipo')).toBe(1);
    const b = comEncaixe();
    b.escolhas![0]!.id = '';
    expect(achar(b, 'obrigatorio', 'escolha:')).toBe(1);
    const c = comEncaixe();
    c.escolhas![0]!.parametro = 'naoExiste';
    expect(achar(c, 'referencia', 'escolha:fundoTipo.parametro')).toBe(1);
    const d = comEncaixe();
    d.escolhas![0]!.parametro = 'L';
    expect(achar(d, 'tipo', 'escolha:fundoTipo.parametro')).toBe(1);
    const e = comEncaixe();
    e.escolhas![0]!.zona = 'inexistente';
    expect(achar(e, 'referencia', 'escolha:fundoTipo.zona')).toBe(1);
  });
});

describe('edição de conectores', () => {
  it('adicionar: cria a lista; recusa id vazio/repetido, objeto inválido e lista estranha', () => {
    const f = nova();
    expect(f.conectores).toBeUndefined();
    expect(adicionarConector(f, con())).toBeNull();
    expect(f.conectores).toHaveLength(1);
    limpa(f);
    intacta(f, (g) => adicionarConector(g, con()));
    intacta(f, (g) => adicionarConector(g, con({ id: '  ' })));
    intacta(f, (g) => adicionarConector(g, 'lixo' as unknown as Conector));
    const g = nova();
    (g as { conectores?: unknown }).conectores = 'x';
    expect(adicionarConector(g, con())).toBe('a família não tem lista de conectores');
  });
  it('editar: troca só os campos do patch; recusa conector inexistente', () => {
    const f = comEncaixe();
    expect(editarConector(f, 'esq', { nome: 'Troca esquerda', aceita: ['torre'] })).toBeNull();
    expect(f.conectores![0]!.nome).toBe('Troca esquerda');
    expect(f.conectores![0]!.aceita).toEqual(['torre']);
    expect(f.conectores![0]!.lado).toBe('esquerda');
    expect(f.conectores![0]!.folga).toBe('esp / 2');
    expect(editarConector(f, 'esq', { lado: 'topo', etiqueta: 'tampo', folga: '4' })).toBeNull();
    limpa(f);
    intacta(comEncaixe(), (h) => editarConector(h, 'naoExiste', { nome: 'x' }));
    intacta(f, (h) => editarConector(h, 'esq', null as unknown as Partial<Conector>));
  });
  it('excluir: remove; recusa inexistente e família sem lista', () => {
    const f = comEncaixe();
    expect(excluirConector(f, 'esq')).toBeNull();
    expect(f.conectores).toHaveLength(0);
    intacta(f, (g) => excluirConector(g, 'esq'));
    intacta(nova(), (g) => excluirConector(g, 'esq'));
  });
});

describe('edição de escolhas', () => {
  it('adicionar, editar e excluir com as mesmas recusas de id', () => {
    const f = nova();
    peca(f, 'fundo').grupo = 'traseira';
    expect(adicionarEscolha(f, escol())).toBeNull();
    expect(f.escolhas).toHaveLength(1);
    intacta(f, (g) => adicionarEscolha(g, escol()));
    intacta(f, (g) => adicionarEscolha(g, escol({ id: '' })));
    intacta(f, (g) => adicionarEscolha(g, 0 as unknown as Escolha));
    expect(editarEscolha(f, 'fundoTipo', { zona: 'frontal' })).toBeNull();
    expect(f.escolhas![0]!.zona).toBe('frontal');
    intacta(f, (g) => editarEscolha(g, 'x', { nome: 'y' }));
    expect(excluirEscolha(f, 'fundoTipo')).toBeNull();
    expect(f.escolhas).toHaveLength(0);
    intacta(f, (g) => excluirEscolha(g, 'fundoTipo'));
    intacta(nova(), (g) => excluirEscolha(g, 'x'));
  });
});

describe('renomear e excluir parâmetro com encaixe', () => {
  it('renomear atualiza escolhas[].parametro e as referências da folga', () => {
    const f = comEncaixe();
    expect(renomearParametro(f, 'fundo', 'tipoFundo')).toBeNull();
    expect(f.escolhas![0]!.parametro).toBe('tipoFundo');
    expect(renomearParametro(f, 'esp', 'espCorpo')).toBeNull();
    expect(f.conectores![0]!.folga).toBe('espCorpo / 2');
    limpa(f);
  });
  it('recusa excluir parâmetro usado por escolha (a mensagem cita a escolha)', () => {
    const f = comEncaixe();
    expect(adicionarParametro(f, { id: 'estilo', nome: 'Estilo', tipo: 'enum', escopo: 'tipo', padrao: 'lisa', opcoes: [{ valor: 'lisa' }, { valor: 'vidro' }] })).toBeNull();
    expect(adicionarEscolha(f, escol({ id: 'estiloPorta', parametro: 'estilo' }))).toBeNull();
    const motivo = intacta(f, (g) => excluirParametro(g, 'estilo'));
    expect(motivo).toContain('escolha:estiloPorta');
  });
  it('recusa excluir parâmetro usado na folga de um conector', () => {
    const f = comEncaixe();
    expect(adicionarParametro(f, { id: 'junta', nome: 'Junta', tipo: 'comprimento', escopo: 'tipo', padrao: 2, min: 0, max: 10, passo: 1 })).toBeNull();
    expect(editarConector(f, 'esq', { folga: 'junta * 2' })).toBeNull();
    const motivo = intacta(f, (g) => excluirParametro(g, 'junta'));
    expect(motivo).toContain('conector:esq.folga');
  });
});

describe('HistoricoFamilia.exec com encaixe', () => {
  it('operações funcionam no rascunho do immer com desfazer e refazer', () => {
    const h = new HistoricoFamilia<Familia>(comEncaixe());
    let motivo: string | null = 'nada';
    h.exec('Novo conector', (d) => { motivo = adicionarConector(d, con({ id: 'dir', lado: 'direita' })); });
    expect(motivo).toBeNull();
    expect(h.atual.conectores).toHaveLength(2);
    h.exec('Renomeia fundo', (d) => { motivo = renomearParametro(d, 'fundo', 'tipoFundo'); });
    expect(motivo).toBeNull();
    expect(h.atual.escolhas?.[0]?.parametro).toBe('tipoFundo');
    expect(h.rotuloDesfazer).toBe('Renomeia fundo');
    expect(h.desfazer()).toBe(true);
    expect(h.atual.escolhas?.[0]?.parametro).toBe('fundo');
    expect(h.refazer()).toBe(true);
    expect(h.atual.escolhas?.[0]?.parametro).toBe('tipoFundo');
    expect(h.desfazer()).toBe(true);
    expect(h.desfazer()).toBe(true);
    expect(h.atual.conectores).toHaveLength(1);
    h.exec('Excluir escolha', (d) => { motivo = excluirEscolha(d, 'fundoTipo'); });
    expect(motivo).toBeNull();
    expect(h.atual.escolhas).toHaveLength(0);
  });
  it('recusa dentro do exec não cria passo de desfazer nem muda o rascunho', () => {
    const h = new HistoricoFamilia<Familia>(comEncaixe());
    const antes = JSON.stringify(h.atual);
    let motivo: string | null = null;
    h.exec('Duplicado', (d) => { motivo = adicionarConector(d, con()); });
    expect(motivo).toBe('id repetido: “esq”');
    expect(h.podeDesfazer).toBe(false);
    expect(JSON.stringify(h.atual)).toBe(antes);
    h.exec('Excluir inexistente', (d) => { motivo = excluirConector(d, 'naoExiste'); });
    expect(motivo).toBe('conector “naoExiste” não existe');
    expect(h.podeDesfazer).toBe(false);
  });
});
