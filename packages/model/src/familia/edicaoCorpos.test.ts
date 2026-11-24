import { describe, expect, it } from 'vitest';
import {
  adicionarCorpo,
  adicionarPontoCaminho,
  criarCorpoPadrao,
  definirPerfil,
  definirRaio,
  duplicarCorpo,
  editarCorpo,
  excluirCorpo,
  moverPontoCaminho,
  removerPontoCaminho,
  reordenarCorpo,
} from './edicao.ts';
import { validarCorpos } from './validarCorpos.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { HistoricoFamilia } from './historico.ts';
import { LIMITES_CORPO, type Caminho, type Corpo, type FormaCorpo, type Perfil } from './tiposCorpo.ts';
import type { Aninhado, Familia } from './tipos.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);

/** Família com um corpo de varredura `tubo` (caminho em L, raio 100 no vértice 1). */
const comTubo = (): Familia => {
  const f = nova();
  expect(adicionarCorpo(f, criarCorpoPadrao('varredura', 'tubo'))).toBeNull();
  return f;
};

/** Caminho do corpo `tubo` da família (falha o teste se a forma não for varredura). */
const caminhoDe = (f: Familia, id: string): Caminho => {
  const forma = f.corpos?.find((c) => c.id === id)?.forma;
  if (forma?.tipo !== 'varredura') throw new Error('não é varredura');
  return forma.caminho;
};

/** A operação recusa, e a família fica exatamente como estava. */
const intacta = (f: Familia, fn: (g: Familia) => string | null): string => {
  const antes = JSON.stringify(f);
  const resultado = fn(f);
  expect(resultado).not.toBeNull();
  expect(JSON.stringify(f)).toBe(antes);
  return resultado!;
};

const aninhado = (): Aninhado => ({
  id: 'mod',
  nome: 'Módulo',
  familiaId: 'fam_gaveta',
  valores: {},
  origem: ['0', '0', '0'],
});

describe('criarCorpoPadrao', () => {
  it('cria um corpo válido para cada forma, com objetos independentes', () => {
    const tipos: FormaCorpo['tipo'][] = ['extrusao', 'revolucao', 'varredura', 'transicao'];
    for (const tipo of tipos) {
      const f = nova();
      const corpo = criarCorpoPadrao(tipo, `c_${tipo}`);
      expect(corpo.id).toBe(`c_${tipo}`);
      expect(corpo.forma.tipo).toBe(tipo);
      expect(adicionarCorpo(f, corpo)).toBeNull();
      expect(validarCorpos(f).filter((p) => p.nivel === 'erro')).toEqual([]);
    }
    const a = criarCorpoPadrao('extrusao', 'x');
    const b = criarCorpoPadrao('extrusao', 'y');
    expect(a.forma).not.toBe(b.forma);
    expect(a.quadro.origem).not.toBe(b.quadro.origem);
  });

  it('usa as medidas padrão da ficha (extrusão Ø50 × 500; transição Ø100 → Ø50)', () => {
    const ext = criarCorpoPadrao('extrusao', 'e');
    expect(ext.forma).toEqual({ tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '50' }, comprimento: '500' });
    const tra = criarCorpoPadrao('transicao', 't');
    expect(tra.forma).toMatchObject({ tipo: 'transicao', perfilA: { diametro: '100' }, perfilB: { diametro: '50' } });
  });
});

describe('adicionarCorpo', () => {
  it('acrescenta ao fim e cria a lista quando ela não existe', () => {
    const f = nova();
    expect(adicionarCorpo(f, criarCorpoPadrao('extrusao', 'a'))).toBeNull();
    expect(adicionarCorpo(f, criarCorpoPadrao('extrusao', 'b'))).toBeNull();
    expect(f.corpos?.map((c) => c.id)).toEqual(['a', 'b']);

    const semLista = { ...nova(), corpos: undefined } as unknown as Familia;
    expect(adicionarCorpo(semLista, criarCorpoPadrao('extrusao', 'c'))).toBeNull();
    expect(semLista.corpos?.map((c) => c.id)).toEqual(['c']);
  });

  it('recusa, nesta ordem, objeto inválido, lista corrompida, id vazio, id repetido, nome vazio', () => {
    const f = nova();
    expect(intacta(f, (g) => adicionarCorpo(g, null as unknown as Corpo))).toMatch(/inválido/);

    const corrompida = { ...nova(), corpos: 42 } as unknown as Familia;
    expect(intacta(corrompida, (g) => adicionarCorpo(g, criarCorpoPadrao('extrusao', 'x')))).toMatch(/lista de corpos/);

    expect(intacta(f, (g) => adicionarCorpo(g, criarCorpoPadrao('extrusao', '   ')))).toMatch(/id não vazio/);

    expect(intacta(f, (g) => adicionarCorpo(g, criarCorpoPadrao('extrusao', 'latE')))).toMatch(/id repetido: “latE”/);

    const comAninhado = nova();
    comAninhado.aninhados = [aninhado()];
    expect(intacta(comAninhado, (g) => adicionarCorpo(g, criarCorpoPadrao('extrusao', 'mod')))).toMatch(/id repetido: “mod”/);

    const semNome = { ...criarCorpoPadrao('extrusao', 'x'), nome: ' ' };
    expect(intacta(f, (g) => adicionarCorpo(g, semNome))).toMatch(/nome/);
  });

  it('recusa forma, perfil e caminho inválidos, pela validação de A2', () => {
    const f = nova();
    const perfilZero = criarCorpoPadrao('extrusao', 'z');
    perfilZero.forma = { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '0' }, comprimento: '500' };
    expect(intacta(f, (g) => adicionarCorpo(g, perfilZero))).toMatch(/diametro|medida|perfil/i);

    const formulaRuim = criarCorpoPadrao('extrusao', 'q');
    formulaRuim.forma = { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '50' }, comprimento: 'L +' };
    expect(intacta(f, (g) => adicionarCorpo(g, formulaRuim))).toMatch(/fórmula/);

    const caminhoCurto = criarCorpoPadrao('varredura', 'v');
    caminhoCurto.forma = { tipo: 'varredura', perfil: { tipo: 'circulo', diametro: '50' }, caminho: { pontos: [['0', '0', '0']] } };
    expect(intacta(f, (g) => adicionarCorpo(g, caminhoCurto))).toMatch(/2 pontos/);
  });

  it('recusa passar do limite de corpos', () => {
    const f = nova();
    f.corpos = Array.from({ length: LIMITES_CORPO.corpos }, (_, i) => criarCorpoPadrao('extrusao', `c${i}`));
    expect(intacta(f, (g) => adicionarCorpo(g, criarCorpoPadrao('extrusao', 'extra')))).toMatch(/limite/);
  });
});

describe('editarCorpo', () => {
  it('troca os campos do patch e remove os que vêm como undefined', () => {
    const f = nova();
    adicionarCorpo(f, { ...criarCorpoPadrao('extrusao', 'tubo'), quando: 'L > 100' });
    expect(editarCorpo(f, 'tubo', { nome: 'Tubo Ø50', quando: undefined, grupo: 'Hidráulica' })).toBeNull();
    const corpo = f.corpos?.find((c) => c.id === 'tubo');
    expect(corpo).toMatchObject({ id: 'tubo', nome: 'Tubo Ø50', grupo: 'Hidráulica' });
    expect(corpo && 'quando' in corpo).toBe(false);
  });

  it('recusa patch com id, nome vazio, corpo inexistente e forma inválida, deixando tudo intacto', () => {
    const f = comTubo();
    expect(intacta(f, (g) => editarCorpo(g, 'tubo', { id: 'outro' } as Partial<Corpo>))).toMatch(/id/);
    expect(intacta(f, (g) => editarCorpo(g, 'tubo', { nome: '' }))).toMatch(/nome/);
    expect(intacta(f, (g) => editarCorpo(g, 'nao_existe', { nome: 'x' }))).toMatch(/não existe/);
    const formaRuim: FormaCorpo = { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '-5' }, comprimento: '500' };
    expect(intacta(f, (g) => editarCorpo(g, 'tubo', { forma: formaRuim }))).toMatch(/medida|diametro|perfil/i);
  });
});

describe('excluirCorpo, duplicarCorpo e reordenarCorpo', () => {
  it('exclui o corpo e recusa o que não existe', () => {
    const f = comTubo();
    expect(excluirCorpo(f, 'tubo')).toBeNull();
    expect(f.corpos).toEqual([]);
    expect(intacta(f, (g) => excluirCorpo(g, 'tubo'))).toMatch(/não existe/);
  });

  it('duplica logo depois do original, com id livre e nome "(cópia)", em cópia profunda', () => {
    const f = comTubo();
    adicionarCorpo(f, criarCorpoPadrao('extrusao', 'fim'));
    expect(duplicarCorpo(f, 'tubo')).toBeNull();
    expect(duplicarCorpo(f, 'tubo')).toBeNull();
    expect(f.corpos?.map((c) => c.id)).toEqual(['tubo', 'tubo_3', 'tubo_2', 'fim']);
    expect(f.corpos?.[1]?.nome).toBe('Varredura (cópia)');
    expect(f.corpos?.[1]?.forma).not.toBe(f.corpos?.[0]?.forma);
    expect(intacta(f, (g) => duplicarCorpo(g, 'nao_existe'))).toMatch(/não existe/);
  });

  it('reordena limitado às pontas e não muda nada com delta 0', () => {
    const f = nova();
    for (const id of ['a', 'b', 'c']) adicionarCorpo(f, criarCorpoPadrao('extrusao', id));
    expect(reordenarCorpo(f, 'a', 1)).toBeNull();
    expect(f.corpos?.map((c) => c.id)).toEqual(['b', 'a', 'c']);
    expect(reordenarCorpo(f, 'c', 10)).toBeNull();
    expect(f.corpos?.map((c) => c.id)).toEqual(['b', 'a', 'c']);
    expect(reordenarCorpo(f, 'a', -5)).toBeNull();
    expect(f.corpos?.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(intacta(f, (g) => reordenarCorpo(g, 'nao_existe', 1))).toMatch(/não existe/);
  });
});

describe('definirPerfil', () => {
  it('troca o perfil de extrusão e de varredura', () => {
    const f = nova();
    adicionarCorpo(f, criarCorpoPadrao('extrusao', 'e'));
    const quadrado: Perfil = { tipo: 'retangulo', largura: '30', altura: '30' };
    expect(definirPerfil(f, 'e', quadrado)).toBeNull();
    expect(f.corpos?.[0]?.forma).toMatchObject({ tipo: 'extrusao', perfil: quadrado, comprimento: '500' });
  });

  it('na transição exige o lado e troca só o perfil indicado', () => {
    const f = nova();
    adicionarCorpo(f, criarCorpoPadrao('transicao', 't'));
    expect(intacta(f, (g) => definirPerfil(g, 't', { tipo: 'circulo', diametro: '20' }))).toMatch(/lado A ou B/);
    expect(definirPerfil(f, 't', { tipo: 'circulo', diametro: '20' }, 'B')).toBeNull();
    expect(f.corpos?.[0]?.forma).toMatchObject({ perfilA: { diametro: '100' }, perfilB: { diametro: '20' } });
  });

  it('recusa perfil inválido e corpo inexistente, deixando tudo intacto', () => {
    const f = comTubo();
    expect(intacta(f, (g) => definirPerfil(g, 'tubo', { tipo: 'circulo', diametro: '0' }))).toMatch(/medida|diametro|perfil/i);
    expect(intacta(f, (g) => definirPerfil(g, 'nao_existe', { tipo: 'circulo', diametro: '10' }))).toMatch(/não existe/);
  });
});

describe('caminho da varredura', () => {
  it('acrescentar no fim mantém a curva do vértice 1 e cria raio 0 no novo vértice interior', () => {
    const f = comTubo();
    expect(adicionarPontoCaminho(f, 'tubo', ['500', '500', '500'])).toBeNull();
    expect(caminhoDe(f, 'tubo').raios).toEqual(['100', '0']);
    expect(caminhoDe(f, 'tubo').pontos).toHaveLength(4);
  });

  it('acrescentar no meio desloca os raios; posição fora do caminho é recusada', () => {
    const f = comTubo();
    expect(adicionarPontoCaminho(f, 'tubo', ['250', '0', '0'], 1)).toBeNull();
    expect(caminhoDe(f, 'tubo').raios).toEqual(['0', '100']);
    expect(intacta(f, (g) => adicionarPontoCaminho(g, 'tubo', ['1', '1', '1'], 9))).toMatch(/fora do caminho/);
    expect(intacta(f, (g) => adicionarPontoCaminho(g, 'tubo', ['1', '1'] as unknown as [string, string, string]))).toMatch(/3 coordenadas/);
  });

  it('mover troca as coordenadas e mantém os raios; ponto inexistente é recusado', () => {
    const f = comTubo();
    expect(moverPontoCaminho(f, 'tubo', 1, ['400', '20', '0'])).toBeNull();
    expect(caminhoDe(f, 'tubo')).toMatchObject({ pontos: [['0', '0', '0'], ['400', '20', '0'], ['500', '500', '0']], raios: ['100'] });
    expect(intacta(f, (g) => moverPontoCaminho(g, 'tubo', 7, ['0', '0', '0']))).toMatch(/não existe/);
  });

  it('remover um ponto leva cada raio para o vértice que sobrevive', () => {
    const f = comTubo();
    adicionarPontoCaminho(f, 'tubo', ['500', '500', '500']);
    expect(definirRaio(f, 'tubo', 2, '50')).toBeNull();
    expect(caminhoDe(f, 'tubo').raios).toEqual(['100', '50']);

    expect(removerPontoCaminho(f, 'tubo', 0)).toBeNull();
    expect(caminhoDe(f, 'tubo').pontos).toHaveLength(3);
    expect(caminhoDe(f, 'tubo').raios).toEqual(['50']);
  });

  it('remover até restar um ponto só é recusado, e a família fica intacta', () => {
    const f = comTubo();
    expect(removerPontoCaminho(f, 'tubo', 0)).toBeNull();
    expect(caminhoDe(f, 'tubo').raios).toEqual([]);
    expect(intacta(f, (g) => removerPontoCaminho(g, 'tubo', 0))).toMatch(/2 pontos/);
  });

  it('operações de caminho recusam corpo que não é varredura', () => {
    const f = nova();
    adicionarCorpo(f, criarCorpoPadrao('extrusao', 'e'));
    expect(intacta(f, (g) => adicionarPontoCaminho(g, 'e', ['1', '1', '1']))).toMatch(/não é uma varredura/);
    expect(intacta(f, (g) => definirRaio(g, 'e', 1, '10'))).toMatch(/não é uma varredura/);
  });
});

describe('definirRaio', () => {
  it('define só o vértice interior indicado e completa os raios com 0', () => {
    const f = comTubo();
    adicionarPontoCaminho(f, 'tubo', ['500', '500', '500']);
    expect(definirRaio(f, 'tubo', 1, '')).toBeNull();
    expect(caminhoDe(f, 'tubo').raios).toEqual(['0', '0']);
    expect(definirRaio(f, 'tubo', 2, 'L / 10')).toBeNull();
    expect(caminhoDe(f, 'tubo').raios).toEqual(['0', 'L / 10']);
  });

  it('recusa vértice que não é interior e raio negativo, sem mudar nada', () => {
    const f = comTubo();
    expect(intacta(f, (g) => definirRaio(g, 'tubo', 0, '10'))).toMatch(/interior/);
    expect(intacta(f, (g) => definirRaio(g, 'tubo', 2, '10'))).toMatch(/interior/);
    expect(intacta(f, (g) => definirRaio(g, 'tubo', 1, '-3'))).toMatch(/negativo/);
  });
});

describe('histórico', () => {
  it('adicionar, editar e excluir desfazem e refazem como um passo cada', () => {
    const h = new HistoricoFamilia<Familia>(nova());
    h.exec('Adicionar corpo', (d) => {
      const erro = adicionarCorpo(d, criarCorpoPadrao('varredura', 'tubo'));
      if (erro !== null) throw new Error(erro);
    });
    h.exec('Mover ponto', (d) => {
      const erro = moverPontoCaminho(d, 'tubo', 2, ['500', '300', '0']);
      if (erro !== null) throw new Error(erro);
    });
    expect(h.atual.corpos?.[0]?.forma).toMatchObject({ caminho: { pontos: [['0', '0', '0'], ['500', '0', '0'], ['500', '300', '0']] } });

    expect(h.desfazer()).toBe(true);
    expect(h.atual.corpos?.[0]?.forma).toMatchObject({ caminho: { pontos: [['0', '0', '0'], ['500', '0', '0'], ['500', '500', '0']] } });
    expect(h.desfazer()).toBe(true);
    expect(h.atual.corpos ?? []).toEqual([]);

    expect(h.refazer()).toBe(true);
    expect(h.refazer()).toBe(true);
    expect(h.atual.corpos?.[0]?.forma).toMatchObject({ caminho: { pontos: [['0', '0', '0'], ['500', '0', '0'], ['500', '300', '0']] } });
  });

  it('erro dentro de exec não cria passo nem altera o estado', () => {
    const h = new HistoricoFamilia<Familia>(nova());
    const antes = h.atual;
    expect(() => h.exec('Duplicar', (d) => {
      const erro = duplicarCorpo(d, 'nao_existe');
      if (erro !== null) throw new Error(erro);
    })).toThrow(/lista de corpos/);
    expect(h.atual).toBe(antes);
    expect(h.podeDesfazer).toBe(false);
  });
});
