import { describe, expect, it } from 'vitest';
import { adicionarParametro, adicionarPeca, adicionarTipo, arranjoLinear, CAMPOS_PECA, definirValorDeTipo, duplicarPeca, duplicarTipo, escreverCampo, espelharPecaEmX, excluirParametro, excluirPeca, excluirTipo, lerCampo, moverPecaNaLista, promoverParaParametro, renomearParametro, usosDoNome } from './edicao.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { renomearNoTexto } from './expressao.ts';
import { LIMITES, type Familia, type Parametro, type Peca } from './tipos.ts';
import { validarFamilia } from './validar.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const peca = (f: Familia, id: string): Peca => f.pecas.find((p) => p.id === id)!;
const param = (f: Familia, id: string): Parametro | undefined => f.parametros.find((p) => p.id === id);
const limpa = (f: Familia): void => expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
const intacta = (f: Familia, fn: (f: Familia) => string | null): string => {
  const antes = JSON.stringify(f);
  const r = fn(f);
  expect(r).not.toBeNull();
  expect(JSON.stringify(f)).toBe(antes);
  return r!;
};

describe('renomearNoTexto', () => {
  it('troca o nome e o membro, não mexe em nomes parecidos, mantém texto sem uso', () => {
    expect(renomearNoTexto('esp + esp2 + corpo.esp', 'esp', 'espessura')).toBe('(espessura + esp2) + corpo.esp');
    expect(renomearNoTexto('corpo.esp * 2', 'corpo', 'chapa')).toBe('chapa.esp * 2');
    expect(renomearNoTexto('a + b', 'x', 'y')).toBe('a + b');
    expect(renomearNoTexto('a +', 'a', 'b')).toBe('a +');
  });
});

describe('lerCampo e escreverCampo', () => {
  it('lê os 8 campos; repetir e quando ausentes dão undefined', () => {
    const p = peca(nova(), 'prat');
    expect(CAMPOS_PECA).toHaveLength(8);
    expect(lerCampo(p, 'origem0')).toBe('esp');
    expect(lerCampo(p, 'origem2')).toBe(p.origem[2]);
    expect(lerCampo(p, 'tamanho1')).toBe('yFundo - 20');
    expect(lerCampo(p, 'espessura')).toBe('esp');
    expect(lerCampo(p, 'repetir')).toBe('nPrat');
    expect(lerCampo(peca(nova(), 'base'), 'repetir')).toBeUndefined();
    expect(lerCampo(peca(nova(), 'base'), 'quando')).toBeUndefined();
  });
  it('escreve, remove repetir/quando com texto vazio e recusa vazio nos obrigatórios', () => {
    const f = nova();
    expect(escreverCampo(f, 'base', 'origem1', ' 10 ')).toBeNull();
    expect(peca(f, 'base').origem[1]).toBe('10');
    expect(escreverCampo(f, 'base', 'quando', 'L > 1')).toBeNull();
    expect(peca(f, 'base').quando).toBe('L > 1');
    expect(escreverCampo(f, 'base', 'quando', '  ')).toBeNull();
    expect('quando' in peca(f, 'base')).toBe(false);
    expect(escreverCampo(f, 'prat', 'repetir', '')).toBeNull();
    expect(peca(f, 'prat').repetir).toBeUndefined();
    expect(escreverCampo(f, 'base', 'origem0', '')).toMatch(/obrigat/);
    expect(escreverCampo(f, 'inexistente', 'origem0', '1')).toMatch(/inexist|não existe/i);
    expect(escreverCampo(f, 'base', 'espessura', 'x'.repeat(LIMITES.formula + 1))).not.toBeNull();
  });
  it('aceita fórmula que não compila (o editor mostra o erro)', () => {
    const f = nova();
    expect(escreverCampo(f, 'base', 'espessura', '1 +')).toBeNull();
    expect(peca(f, 'base').espessura).toBe('1 +');
  });
});

describe('usosDoNome', () => {
  it('acha fórmulas, planos, peças, ferragens, tipos e material', () => {
    const f = nova();
    const u = usosDoNome(f, 'esp');
    expect(u).toContain('parametro:zBase.formula');
    expect(u).toContain('peca:latE.espessura');
    expect(u).toContain('peca:base.origem[0]');
    expect(new Set(u).size).toBe(u.length);
    expect(usosDoNome(f, 'corpo')).toEqual(expect.arrayContaining(['parametro:esp.formula', 'peca:latE.material', 'tipo:A120.valores.corpo']));
    expect(usosDoNome(f, 'L')).toEqual(expect.arrayContaining(['plano:pDir.posicao', 'peca:latD.origem[0]', 'tipo:A60.valores.L']));
    expect(usosDoNome(f, 'nPortas')).toEqual(expect.arrayContaining(['ferragem:dobradica.quantidade', 'ferragem:dobradica.quando', 'peca:porta.repetir', 'peca:porta.quando']));
    expect(usosDoNome(f, 'naoExiste')).toEqual([]);
  });
  it('não confunde nomes parecidos e não conta o próprio parâmetro', () => {
    const f = nova();
    expect(usosDoNome(f, 'esp')).not.toContain('parametro:esp.formula');
    expect(usosDoNome(f, 'tampoEsp')).not.toContain('peca:base.origem[0]');
  });
});

describe('renomearParametro', () => {
  it('troca o id e reescreve fórmulas, membro, tipos e material', () => {
    const f = nova();
    expect(renomearParametro(f, 'corpo', 'chapaCorpo')).toBeNull();
    expect(param(f, 'corpo')).toBeUndefined();
    expect(param(f, 'chapaCorpo')).toBeDefined();
    expect(param(f, 'esp')!.formula).toBe('chapaCorpo.esp');
    expect(peca(f, 'latE').material).toBe('chapaCorpo');
    expect(f.tipos.find((t) => t.id === 'A120')!.valores).toHaveProperty('chapaCorpo', 'mdf25');
    expect(f.tipos.find((t) => t.id === 'A120')!.valores).not.toHaveProperty('corpo');
    limpa(f);
    expect(usosDoNome(f, 'corpo')).toEqual([]);
  });
  it('renomear esp e plano mexe nas fórmulas, e L, A, P e ids ruins são recusados sem alterar', () => {
    const f = nova();
    expect(renomearParametro(f, 'esp', 'espCorpo')).toBeNull();
    expect(peca(f, 'latD').origem[0]).toContain('espCorpo');
    expect(peca(f, 'latE').espessura).toBe('espCorpo');
    limpa(f);
    expect(renomearParametro(f, 'pDir', 'planoDireita')).toBeNull();
    expect(f.planos.find((p) => p.id === 'planoDireita')).toBeDefined();
    for (const [v, n] of [['L', 'Largura'], ['A', 'Alt'], ['P', 'Prof'], ['rodape', '9x'], ['rodape', 'i'], ['rodape', 'max'], ['rodape', 'esp'], ['naoExiste', 'x']] as const) {
      intacta(nova(), (g) => renomearParametro(g, v, n));
    }
  });
});

describe('adicionar e excluir parâmetro', () => {
  const novo = (extra: Partial<Parametro> = {}): Parametro => ({ id: 'gaveta', nome: 'Gaveta', tipo: 'comprimento', escopo: 'tipo', padrao: 150, ...extra });
  it('adiciona ao fim e valida id, tipo do padrão, repetição e limite', () => {
    const f = nova();
    expect(adicionarParametro(f, novo())).toBeNull();
    expect(f.parametros.at(-1)!.id).toBe('gaveta');
    limpa(f);
    intacta(f, (g) => adicionarParametro(g, novo()));
    intacta(nova(), (g) => adicionarParametro(g, novo({ id: '1x' })));
    intacta(nova(), (g) => adicionarParametro(g, novo({ id: 'i' })));
    intacta(nova(), (g) => adicionarParametro(g, novo({ id: 'pDir' })));
    intacta(nova(), (g) => adicionarParametro(g, novo({ padrao: 'texto' })));
    const cheia = nova();
    cheia.parametros = Array.from({ length: LIMITES.parametros }, (_, i) => novo({ id: `p${i}` }));
    intacta(cheia, (g) => adicionarParametro(g, novo()));
  });
  it('exclui parâmetro livre, recusa em uso (listando lugares) e recusa L, A, P', () => {
    const f = nova();
    adicionarParametro(f, novo());
    f.tipos[0]!.valores.gaveta = 200;
    expect(excluirParametro(f, 'gaveta')).toBeNull();
    expect(param(f, 'gaveta')).toBeUndefined();
    expect(f.tipos[0]!.valores).not.toHaveProperty('gaveta');
    const motivo = intacta(nova(), (g) => excluirParametro(g, 'esp'));
    expect(motivo).toContain('em uso');
    expect(motivo.split(',').length).toBeLessThanOrEqual(3 + 1);
    for (const id of ['L', 'A', 'P']) intacta(nova(), (g) => excluirParametro(g, id));
    intacta(nova(), (g) => excluirParametro(g, 'naoExiste'));
  });
});

describe('peças: adicionar, excluir, duplicar, mover', () => {
  const nova1: Peca = { id: 'divisoria', nome: 'Divisória', papel: 'divisoria', eixo: 'x', origem: ['L / 2', '0', 'zBase'], tamanho: ['profL', 'vao'], espessura: 'esp', material: 'corpo' };
  it('adicionar e excluir', () => {
    const f = nova();
    expect(adicionarPeca(f, nova1)).toBeNull();
    expect(f.pecas.at(-1)!.id).toBe('divisoria');
    limpa(f);
    intacta(f, (g) => adicionarPeca(g, nova1));
    intacta(nova(), (g) => adicionarPeca(g, { ...nova1, id: 'com espaço' }));
    expect(excluirPeca(f, 'divisoria')).toBeNull();
    expect(f.pecas.some((p) => p.id === 'divisoria')).toBe(false);
    intacta(nova(), (g) => excluirPeca(g, 'naoExiste'));
  });
  it('duplicar: logo depois, id e nome novos, cópia profunda', () => {
    const f = nova();
    const i = f.pecas.findIndex((p) => p.id === 'latE');
    expect(duplicarPeca(f, 'latE')).toBeNull();
    expect(f.pecas[i + 1]!.id).toBe('latE_2');
    expect(f.pecas[i + 1]!.nome).toBe('Lateral esquerda (cópia)');
    expect(f.pecas[i + 1]!.origem).toEqual(f.pecas[i]!.origem);
    expect(f.pecas[i + 1]!.origem).not.toBe(f.pecas[i]!.origem);
    expect(duplicarPeca(f, 'latE')).toBeNull();
    expect(f.pecas[i + 1]!.id).toBe('latE_3');
    limpa(f);
    intacta(nova(), (g) => duplicarPeca(g, 'x'));
  });
  it('mover na lista, com limite nas pontas', () => {
    const f = nova();
    const ids = (): string[] => f.pecas.map((p) => p.id);
    const original = ids();
    expect(moverPecaNaLista(f, 'latD', -1)).toBeNull();
    expect(ids().slice(0, 2)).toEqual(['latD', 'latE']);
    expect(moverPecaNaLista(f, 'latD', -5)).toBeNull();
    expect(ids()[0]).toBe('latD');
    expect(moverPecaNaLista(f, 'latD', 99)).toBeNull();
    expect(ids().at(-1)).toBe('latD');
    expect(moverPecaNaLista(f, 'latD', 0)).toBeNull();
    expect([...ids()].sort()).toEqual([...original].sort());
    intacta(nova(), (g) => moverPecaNaLista(g, 'x', 1));
  });
});

describe('espelhar e arranjo', () => {
  it('espelhar em X: origem refletida em torno de L/2, copia o resto, não muda a original', () => {
    const f = nova();
    const original = JSON.stringify(peca(f, 'latE'));
    expect(espelharPecaEmX(f, 'latE')).toBeNull();
    expect(JSON.stringify(peca(f, 'latE'))).toBe(original);
    const e = f.pecas[f.pecas.findIndex((p) => p.id === 'latE') + 1]!;
    expect(e.id).toBe('latE_esp');
    expect(e.nome).toBe('Lateral esquerda (espelhada)');
    expect(e.origem[0]).toBe('L - (0) - (esp)');
    expect(e.origem[1]).toBe('0');
    limpa(f);
    expect(espelharPecaEmX(f, 'base')).toBeNull();
    expect(f.pecas[f.pecas.findIndex((p) => p.id === 'base') + 1]!.origem[0]).toBe('L - (montagem == "base_entre_laterais" ? esp : 0) - (L)'.replace('(L)', `(${peca(nova(), 'base').tamanho[0]})`));
    expect(espelharPecaEmX(f, 'latE')).toBeNull();
    expect(f.pecas.some((p) => p.id === 'latE_esp2' || p.id === 'latE_esp_2')).toBe(true);
    intacta(nova(), (g) => espelharPecaEmX(g, 'x'));
  });
  it('espelhar recusa contorno poligonal em eixo y/z', () => {
    const f = nova();
    peca(f, 'base').contorno = { tipo: 'poligono', pontos: [['0', '0'], ['L', '0'], ['L', 'P']] };
    intacta(f, (g) => espelharPecaEmX(g, 'base'));
  });
  it('arranjo linear: repetir = n e origem no eixo ganha (i - 1) * passo; recusa peça que já repete', () => {
    const f = nova();
    expect(arranjoLinear(f, 'trF', 'y', '3', '100')).toBeNull();
    expect(peca(f, 'trF').repetir).toBe('3');
    expect(peca(f, 'trF').origem[1]).toBe('(0) + (i - 1) * (100)');
    expect(peca(f, 'trF').origem[0]).toBe('esp');
    limpa(f);
    intacta(f, (g) => arranjoLinear(g, 'trF', 'y', '2', '10'));
    intacta(nova(), (g) => arranjoLinear(g, 'prat', 'z', '2', '10'));
    intacta(nova(), (g) => arranjoLinear(g, 'trF', 'x', 'n', '10'));
    intacta(nova(), (g) => arranjoLinear(g, 'trF', 'x', '2 +', '10'));
    intacta(nova(), (g) => arranjoLinear(g, 'trF', 'x', '2', '10 +'));
    intacta(nova(), (g) => arranjoLinear(g, 'x', 'x', '2', '10'));
  });
});

describe('promoverParaParametro', () => {
  it('número vira comprimento do tipo; fórmula vira derivado; o campo passa a usar o id', () => {
    const f = nova();
    expect(promoverParaParametro(f, 'trF', 'tamanho1', 'larguraTravessa', 'Largura da travessa')).toBeNull();
    expect(peca(f, 'trF').tamanho[1]).toBe('larguraTravessa');
    expect(param(f, 'larguraTravessa')).toMatchObject({ tipo: 'comprimento', escopo: 'tipo', padrao: 80, nome: 'Largura da travessa', min: 0, max: 10000, passo: 1 });
    expect(promoverParaParametro(f, 'prat', 'tamanho1', 'profPrat', 'Profundidade da prateleira')).toBeNull();
    expect(param(f, 'profPrat')).toMatchObject({ tipo: 'numero', escopo: 'tipo', padrao: 0, formula: 'yFundo - 20', grupo: 'Derivados' });
    expect(peca(f, 'prat').tamanho[1]).toBe('profPrat');
    limpa(f);
  });
  it('erros: campo não medida, id ruim ou repetido, peça inexistente, sem alterar', () => {
    intacta(nova(), (g) => promoverParaParametro(g, 'prat', 'repetir', 'x1', 'X'));
    intacta(nova(), (g) => promoverParaParametro(g, 'prat', 'quando', 'x1', 'X'));
    intacta(nova(), (g) => promoverParaParametro(g, 'trF', 'tamanho1', '9x', 'X'));
    intacta(nova(), (g) => promoverParaParametro(g, 'trF', 'tamanho1', 'esp', 'X'));
    intacta(nova(), (g) => promoverParaParametro(g, 'naoExiste', 'tamanho1', 'x1', 'X'));
    intacta(nova(), (g) => promoverParaParametro(g, 'trF', 'tamanho0' as never, 'i', 'X'));
  });
});

describe('tipos', () => {
  it('adicionar: id normalizado e único; nome vazio e limite recusados', () => {
    const f = nova();
    expect(adicionarTipo(f, 'Armário 90 cm!')).toBeNull();
    expect(f.tipos.at(-1)).toEqual({ id: 'armario_90_cm', nome: 'Armário 90 cm!', valores: {} });
    expect(adicionarTipo(f, 'Armário 90 cm!')).toBeNull();
    expect(f.tipos.at(-1)!.id).toBe('armario_90_cm_2');
    intacta(nova(), (g) => adicionarTipo(g, '   '));
    const cheia = nova();
    cheia.tipos = Array.from({ length: LIMITES.tipos }, (_, i) => ({ id: `t${i}`, nome: `T${i}`, valores: {} }));
    intacta(cheia, (g) => adicionarTipo(g, 'mais um'));
  });
  it('duplicar e excluir (com tipoPadrao)', () => {
    const f = nova();
    expect(duplicarTipo(f, 'A100')).toBeNull();
    const i = f.tipos.findIndex((t) => t.id === 'A100');
    expect(f.tipos[i + 1]!.nome).toBe('Armário 100 (2 portas) (cópia)');
    expect(f.tipos[i + 1]!.valores).toEqual(f.tipos[i]!.valores);
    expect(f.tipos[i + 1]!.valores).not.toBe(f.tipos[i]!.valores);
    expect(f.tipos[i + 1]!.id).not.toBe('A100');
    expect(excluirTipo(f, 'A80')).toBeNull();
    expect(f.tipoPadrao).toBe(f.tipos[0]!.id);
    for (const t of [...f.tipos]) excluirTipo(f, t.id);
    expect(f.tipos).toEqual([]);
    expect('tipoPadrao' in f).toBe(false);
    intacta(nova(), (g) => duplicarTipo(g, 'x'));
    intacta(nova(), (g) => excluirTipo(g, 'x'));
  });
  it('definirValorDeTipo: grava, remove com undefined e valida', () => {
    const f = nova();
    expect(definirValorDeTipo(f, 'A60', 'L', 650)).toBeNull();
    expect(f.tipos.find((t) => t.id === 'A60')!.valores.L).toBe(650);
    expect(definirValorDeTipo(f, 'A60', 'L', undefined)).toBeNull();
    expect(f.tipos.find((t) => t.id === 'A60')!.valores).not.toHaveProperty('L');
    expect(definirValorDeTipo(f, 'A60', 'fundo', 'pregado')).toBeNull();
    limpa(f);
    intacta(nova(), (g) => definirValorDeTipo(g, 'x', 'L', 1));
    intacta(nova(), (g) => definirValorDeTipo(g, 'A60', 'x', 1));
    intacta(nova(), (g) => definirValorDeTipo(g, 'A60', 'esp', 18));
    intacta(nova(), (g) => definirValorDeTipo(g, 'A60', 'L', 'texto'));
    intacta(nova(), (g) => definirValorDeTipo(g, 'A60', 'L', 99999));
    intacta(nova(), (g) => definirValorDeTipo(g, 'A60', 'fundo', 'xyz'));
    intacta(nova(), (g) => definirValorDeTipo(g, 'A60', 'nPrat', 1.5));
  });
});

describe('entrada estranha nunca lança', () => {
  it('família com campos faltando', () => {
    const lixo = { ...nova(), parametros: undefined, pecas: undefined, tipos: undefined } as unknown as Familia;
    for (const fn of [() => usosDoNome(lixo, 'L'), () => excluirPeca(lixo, 'x'), () => adicionarTipo(lixo, 'x'), () => renomearParametro(lixo, 'a', 'b'), () => escreverCampo(lixo, 'x', 'origem0', '1')]) expect(fn).not.toThrow();
  });
});
