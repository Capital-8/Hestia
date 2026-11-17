import { describe, expect, it } from 'vitest';
import type { Material } from '@hestia/model';
import { agruparPorClasse, atualizarCampo, filtrarMateriais, formatPalavrasChave, limpaVazios, padraoEfetivoPrimeiro, parsePalavrasChave } from './materialsLogic.ts';

const cmp = (a: string, b: string): number => a.localeCompare(b, 'pt-BR', { numeric: true });

/** Material base, só com os campos antigos (sem blocos opcionais). */
function base(over: Partial<Material> & { id: string; name: string }): Material {
  return { color: '#b9a98f', hatch: 'none', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2', ...over };
}

describe('limpaVazios', () => {
  it('remove undefined, null, texto em branco, número não finito, lista e objeto vazios', () => {
    expect(limpaVazios(undefined)).toBeUndefined();
    expect(limpaVazios(null)).toBeUndefined();
    expect(limpaVazios('   ')).toBeUndefined();
    expect(limpaVazios(NaN)).toBeUndefined();
    expect(limpaVazios([])).toBeUndefined();
    expect(limpaVazios({ a: undefined, b: '' })).toBeUndefined();
  });

  it('apara texto e mantém zero e false (valores válidos)', () => {
    expect(limpaVazios('  madeira ')).toBe('madeira');
    expect(limpaVazios({ transparencia: 0, usarAparenciaRender: false })).toEqual({ transparencia: 0, usarAparenciaRender: false });
  });

  it('limpa recursivamente e tira objetos que ficam vazios', () => {
    expect(limpaVazios({ sombreamento: { cor: undefined }, superficie: { primeiroPlano: { padrao: 'cross' } } })).toEqual({
      superficie: { primeiroPlano: { padrao: 'cross' } },
    });
  });
});

describe('atualizarCampo', () => {
  it('grava um campo aninhado e cria o bloco quando não existia', () => {
    const m = base({ id: 'm1', name: 'Madeira' });
    const out = atualizarCampo(m, 'graficos', ['superficie', 'primeiroPlano', 'padrao'], 'diagonal');
    expect(out.graficos).toEqual({ superficie: { primeiroPlano: { padrao: 'diagonal' } } });
  });

  it('não muda o material original (imutável)', () => {
    const m = base({ id: 'm1', name: 'Madeira' });
    atualizarCampo(m, 'identidade', ['classe'], 'Madeira');
    expect(m.identidade).toBeUndefined();
  });

  it('grava só o bloco alterado: os demais blocos mantêm a mesma referência', () => {
    const m = base({
      id: 'm1',
      name: 'Madeira',
      identidade: { classe: 'Madeira' },
      fisico: { densidade: 500 },
    });
    const out = atualizarCampo(m, 'termico', ['emissividade'], 0.9);
    expect(out.identidade).toBe(m.identidade);
    expect(out.fisico).toBe(m.fisico);
    expect(out.termico).toEqual({ emissividade: 0.9 });
  });

  it('valor vazio remove o campo e, se o bloco ficar vazio, o bloco sai do material', () => {
    const m = base({ id: 'm1', name: 'Madeira', fisico: { densidade: 500 } });
    const semCampo = atualizarCampo(m, 'fisico', ['densidade'], undefined);
    expect('fisico' in semCampo).toBe(false);
    expect(semCampo.name).toBe('Madeira');
  });

  it('mantém os outros campos do bloco quando um é apagado', () => {
    const m = base({ id: 'm1', name: 'Madeira', fisico: { densidade: 500, dilatacao: 0.00001 } });
    const out = atualizarCampo(m, 'fisico', ['densidade'], undefined);
    expect(out.fisico).toEqual({ dilatacao: 0.00001 });
  });

  it('texto em branco numa palavra-chave remove a lista e o bloco identidade vazio', () => {
    const m = base({ id: 'm1', name: 'Madeira', identidade: { palavrasChave: ['pinus'] } });
    const out = atualizarCampo(m, 'identidade', ['palavrasChave'], []);
    expect('identidade' in out).toBe(false);
  });

  it('cor automática (undefined) grava o campo como ausente, não como texto', () => {
    const m = base({ id: 'm1', name: 'Madeira', graficos: { sombreamento: { cor: '#112233' } } });
    const out = atualizarCampo(m, 'graficos', ['sombreamento', 'cor'], undefined);
    expect('graficos' in out).toBe(false);
  });
});

describe('palavras-chave', () => {
  it('separa por vírgula, apara, descarta vazios e repetidos', () => {
    expect(parsePalavrasChave(' madeira, interna ,, madeira ,pinus ')).toEqual(['madeira', 'interna', 'pinus']);
  });

  it('texto vazio vira lista vazia', () => {
    expect(parsePalavrasChave('  ,  ')).toEqual([]);
  });

  it('formata a lista de volta para o campo', () => {
    expect(formatPalavrasChave(['madeira', 'pinus'])).toBe('madeira, pinus');
    expect(formatPalavrasChave(undefined)).toBe('');
  });
});

describe('agruparPorClasse', () => {
  const lista = [
    base({ id: 'a', name: 'Vidro', identidade: { classe: 'Vidro' } }),
    base({ id: 'b', name: 'Concreto', identidade: { classe: 'Concreto' } }),
    base({ id: 'c', name: 'Tijolo' }),
    base({ id: 'd', name: 'Aço', identidade: { classe: '  Concreto  ' } }),
    base({ id: 'e', name: 'Azulejo', identidade: { classe: '   ' } }),
    base({ id: 'f', name: 'Barro', identidade: { classe: 'Concreto' } }),
  ];

  it('agrupa por classe com classes em ordem e "sem classe" por último', () => {
    const grupos = agruparPorClasse(lista, cmp);
    expect(grupos.map((g) => g.classe)).toEqual(['Concreto', 'Vidro', null]);
  });

  it('classe aparada: "  Concreto  " entra no grupo Concreto; classe em branco vai para sem classe', () => {
    const grupos = agruparPorClasse(lista, cmp);
    expect(grupos[0]!.itens.map((m) => m.id).sort()).toEqual(['b', 'd', 'f']);
    expect(grupos[2]!.itens.map((m) => m.id)).toEqual(['e', 'c']);
  });

  it('dentro do grupo, os itens seguem o nome na ordem dada', () => {
    const grupos = agruparPorClasse(lista, cmp);
    expect(grupos[0]!.itens.map((m) => m.name)).toEqual(['Aço', 'Barro', 'Concreto']);
  });

  it('sem materiais devolve nenhum grupo', () => {
    expect(agruparPorClasse([], cmp)).toEqual([]);
  });
});

describe('filtrarMateriais', () => {
  const lista = [
    base({ id: 'a', name: 'Madeira Pinus', identidade: { classe: 'Madeira', palavrasChave: ['estrutural'] } }),
    base({ id: 'b', name: 'Vidro temperado', identidade: { fabricante: 'Acme' } }),
    base({ id: 'c', name: 'Concreto' }),
  ];

  it('busca em branco devolve tudo', () => {
    expect(filtrarMateriais(lista, '   ').map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('busca no nome, na classe, no fabricante e nas palavras-chave', () => {
    expect(filtrarMateriais(lista, 'pinus').map((m) => m.id)).toEqual(['a']);
    expect(filtrarMateriais(lista, 'madeira').map((m) => m.id)).toEqual(['a']);
    expect(filtrarMateriais(lista, 'acme').map((m) => m.id)).toEqual(['b']);
    expect(filtrarMateriais(lista, 'estrutural').map((m) => m.id)).toEqual(['a']);
  });

  it('ignora acento e caixa', () => {
    expect(filtrarMateriais(lista, 'VIDRO TEMPERADO').map((m) => m.id)).toEqual(['b']);
    expect(filtrarMateriais(lista, 'temperádo').map((m) => m.id)).toEqual(['b']);  });
});

describe('padraoEfetivoPrimeiro', () => {
  it('usa a hachura do material quando é um dos 5 padrões do editor', () => {
    expect(padraoEfetivoPrimeiro(base({ id: 'x', name: 'x', hatch: 'diagonal' }))).toBe('diagonal');
  });

  it('gesso (hachura do forro) não é oferecido no material: cai em none', () => {
    expect(padraoEfetivoPrimeiro(base({ id: 'x', name: 'x', hatch: 'gesso' }))).toBe('none');
  });
});
