import { FAMILIA_ARMARIO, adicionarParametro, validarFamilia, type Familia, type Parametro } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import {
  ROTULO_TIPO,
  TIPOS_PARAMETRO,
  aceitaFormula,
  adicionarOpcao,
  alterarOpcao,
  lerNumeroOpcional,
  parametroNovo,
  padraoInicial,
  removerOpcao,
  temFaixa,
  temOpcoes,
  valorDoTipo,
} from './familiaDialogos.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const param = (f: Familia, id: string): Parametro => f.parametros.find((p) => p.id === id)!;

describe('rótulos e capacidades por tipo', () => {
  it('tem rótulo para todos os tipos', () => {
    expect(TIPOS_PARAMETRO.map((t) => ROTULO_TIPO[t])).toEqual([
      'Comprimento', 'Número', 'Inteiro', 'Sim/Não', 'Texto', 'Enumeração', 'Chapa', 'Material',
    ]);
  });

  it('faixa, fórmula e opções valem para os tipos certos', () => {
    expect(TIPOS_PARAMETRO.filter(temFaixa)).toEqual(['comprimento', 'numero', 'inteiro']);
    expect(TIPOS_PARAMETRO.filter(aceitaFormula)).toEqual(['comprimento', 'numero', 'inteiro', 'booleano']);
    expect(TIPOS_PARAMETRO.filter(temOpcoes)).toEqual(['enum', 'chapa']);
  });
});

describe('padrão inicial e parâmetro novo', () => {
  it('0, false, texto vazio, primeira opção e material não vazio', () => {
    expect(padraoInicial('comprimento')).toBe(0);
    expect(padraoInicial('numero')).toBe(0);
    expect(padraoInicial('inteiro')).toBe(0);
    expect(padraoInicial('booleano')).toBe(false);
    expect(padraoInicial('texto')).toBe('');
    expect(padraoInicial('material')).not.toBe('');
    expect(padraoInicial('enum', [{ valor: 'a' }, { valor: 'b' }])).toBe('a');
    expect(padraoInicial('chapa', [{ valor: 'mdf18', esp: 18 }])).toBe('mdf18');
  });

  it('gera opções iniciais para enumeração e chapa, com esp na chapa', () => {
    const e = parametroNovo('nova', 'Nova', 'enum', 'tipo');
    expect(e.opcoes).toHaveLength(1);
    expect(e.padrao).toBe(e.opcoes![0]!.valor);
    expect(e.opcoes![0]!.esp).toBeUndefined();

    const c = parametroNovo('chapa_nova', 'Chapa nova', 'chapa', 'tipo');
    expect(c.opcoes).toHaveLength(1);
    expect(c.opcoes![0]!.esp).toBe(18);
    expect(c.padrao).toBe(c.opcoes![0]!.valor);
  });

  it('preenche o nome com o id e aceita os 8 tipos em adicionarParametro', () => {
    const semNome = parametroNovo(' altura_nova ', '', 'comprimento', 'tipo');
    expect(semNome.id).toBe('altura_nova');
    expect(semNome.nome).toBe('altura_nova');

    for (const tipo of TIPOS_PARAMETRO) {
      const f = nova();
      expect(adicionarParametro(f, parametroNovo(`novo_${tipo}`, 'Novo', tipo, 'tipo'))).toBeNull();
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
    }
  });
});

describe('valorDoTipo', () => {
  it('devolve o valor do tipo e marca quando não define', () => {
    const f = nova();
    const a60 = f.tipos.find((t) => t.id === 'A60')!;
    expect(valorDoTipo(a60, param(f, 'L'))).toEqual({ valor: 600, definido: true });
    expect(valorDoTipo(a60, param(f, 'A'))).toEqual({ valor: 720, definido: false });
  });
});

describe('lerNumeroOpcional', () => {
  it('vazio some, inválido recusa e aceita vírgula', () => {
    expect(lerNumeroOpcional('  ')).toBeUndefined();
    expect(lerNumeroOpcional('18,5')).toBe(18.5);
    expect(lerNumeroOpcional('18.5')).toBe(18.5);
    expect(lerNumeroOpcional('abc')).toBeNull();
  });
});

describe('opções: alterar', () => {
  it('troca o valor e acompanha padrão e valores dos tipos', () => {
    const f = nova();
    const corpo = param(f, 'corpo');
    expect(corpo.padrao).toBe('mdf18');
    const indice18 = corpo.opcoes!.findIndex((o) => o.valor === 'mdf18');
    const indice25 = corpo.opcoes!.findIndex((o) => o.valor === 'mdf25');

    expect(alterarOpcao(f, 'corpo', indice18, 'valor', 'mdf20')).toBeNull();
    expect(param(f, 'corpo').padrao).toBe('mdf20');
    expect(param(f, 'corpo').opcoes![indice18]!.valor).toBe('mdf20');

    expect(alterarOpcao(f, 'corpo', indice25, 'valor', 'mdf30')).toBeNull();
    expect(f.tipos.find((t) => t.id === 'A120')!.valores.corpo).toBe('mdf30');
  });

  it('recusa valor vazio ou repetido sem alterar', () => {
    const f = nova();
    const antes = JSON.stringify(f);
    expect(alterarOpcao(f, 'corpo', 0, 'valor', '')).not.toBeNull();
    expect(alterarOpcao(f, 'corpo', 0, 'valor', 'mdf18')).not.toBeNull();
    expect(JSON.stringify(f)).toBe(antes);
  });

  it('rótulo vazio remove; esp só em chapa e maior que zero', () => {
    const f = nova();
    expect(alterarOpcao(f, 'corpo', 1, 'rotulo', '  ')).toBeNull();
    expect(param(f, 'corpo').opcoes![1]!.rotulo).toBeUndefined();
    expect(alterarOpcao(f, 'corpo', 1, 'esp', '20')).toBeNull();
    expect(param(f, 'corpo').opcoes![1]!.esp).toBe(20);
    expect(alterarOpcao(f, 'corpo', 1, 'esp', '0')).not.toBeNull();
    expect(alterarOpcao(f, 'corpo', 1, 'esp', '')).not.toBeNull();
    expect(alterarOpcao(f, 'montagem', 0, 'esp', '10')).not.toBeNull();
    expect(alterarOpcao(f, 'L', 0, 'valor', 'x')).not.toBeNull();
  });
});

describe('opções: adicionar e remover', () => {
  it('acrescenta com valor único e, se for a primeira, vira o padrão', () => {
    const f = nova();
    const antes = param(f, 'montagem').opcoes!.length;
    expect(adicionarOpcao(f, 'montagem')).toBeNull();
    expect(param(f, 'montagem').opcoes).toHaveLength(antes + 1);
    expect(new Set(param(f, 'montagem').opcoes!.map((o) => o.valor)).size).toBe(antes + 1);

    const g = nova();
    const vazio: Parametro = { id: 'lista', nome: 'Lista', tipo: 'enum', escopo: 'tipo', padrao: '', opcoes: [] };
    g.parametros.push(vazio);
    expect(adicionarOpcao(g, 'lista')).toBeNull();
    expect(param(g, 'lista').padrao).toBe(param(g, 'lista').opcoes![0]!.valor);
  });

  it('recusa remover a opção padrão e limpa os tipos que usavam a removida', () => {
    const f = nova();
    const corpo = param(f, 'corpo');
    const indicePadrao = corpo.opcoes!.findIndex((o) => o.valor === corpo.padrao);
    expect(removerOpcao(f, 'corpo', indicePadrao)).not.toBeNull();

    const indice25 = corpo.opcoes!.findIndex((o) => o.valor === 'mdf25');
    expect(removerOpcao(f, 'corpo', indice25)).toBeNull();
    expect(param(f, 'corpo').opcoes!.some((o) => o.valor === 'mdf25')).toBe(false);
    expect(f.tipos.find((t) => t.id === 'A120')!.valores).not.toHaveProperty('corpo');
  });
});
