import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { LIMITES, type Familia, type Parametro, type Peca } from './tipos.ts';
import { validarFamilia, type CodigoProblema } from './validar.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const param = (f: Familia, id: string): Parametro => f.parametros.find((p) => p.id === id)!;
const peca = (f: Familia, id: string): Peca => f.pecas.find((p) => p.id === id)!;
const achar = (f: Familia, codigo: CodigoProblema, onde?: string) => validarFamilia(f).filter((p) => p.codigo === codigo && (onde === undefined || p.onde === onde));

describe('validarFamilia', () => {
  it('a família de exemplo é limpa (nem erro nem aviso)', () => {
    expect(validarFamilia(FAMILIA_ARMARIO)).toEqual([]);
  });
  it('não muda a família e é determinística', () => {
    const f = nova();
    const antes = JSON.stringify(f);
    param(f, 'L').id = '1ruim';
    const a = validarFamilia(f);
    expect(JSON.stringify(f)).not.toBe(antes);
    expect(validarFamilia(f)).toEqual(a);
  });

  it('1 obrigatorio: L, A e P', () => {
    const f = nova();
    f.parametros = f.parametros.filter((p) => p.id !== 'A');
    expect(achar(f, 'obrigatorio', 'parametro:A')).toHaveLength(1);
    const g = nova();
    param(g, 'P').escopo = 'tipo';
    expect(achar(g, 'obrigatorio', 'parametro:P')).toHaveLength(1);
    const h = nova();
    (h as { unidade: string }).unidade = 'cm';
    expect(achar(h, 'obrigatorio', 'familia').length).toBeGreaterThan(0);
  });
  it('2 limite: quantidade, tamanho de fórmula, nome e repetição literal', () => {
    const f = nova();
    f.pecas = Array.from({ length: LIMITES.pecas + 1 }, (_, i) => ({ ...peca(nova(), 'base'), id: `p${i}` }));
    expect(achar(f, 'limite', 'familia')).toHaveLength(1);
    const g = nova();
    peca(g, 'base').espessura = `esp + ${'1'.repeat(LIMITES.formula)}`;
    expect(achar(g, 'limite').length).toBeGreaterThan(0);
    const h = nova();
    peca(h, 'base').nome = 'x'.repeat(LIMITES.nome + 1);
    expect(achar(h, 'limite', 'peca:base.nome')).toHaveLength(1);
    const r = nova();
    peca(r, 'prat').repetir = String(LIMITES.repeticao + 1);
    expect(achar(r, 'limite', 'peca:prat.repetir')).toHaveLength(1);
  });
  it('3 id_invalido: formato e reservados', () => {
    const f = nova();
    param(f, 'rodape').id = '9rodape';
    peca(f, 'base').id = 'com espaço';
    expect(achar(f, 'id_invalido', 'parametro:9rodape')).toHaveLength(1);
    expect(achar(f, 'id_invalido', 'peca:com espaço')).toHaveLength(1);
    for (const reservado of ['i', 'n', 'max', 'sqrt']) {
      const g = nova();
      param(g, 'rodape').id = reservado;
      expect(achar(g, 'id_invalido', `parametro:${reservado}`), reservado).toHaveLength(1);
    }
  });
  it('4 id_duplicado: mesma categoria e nomes compartilhados entre parâmetros e planos', () => {
    const f = nova();
    f.pecas.push({ ...peca(nova(), 'base') });
    expect(achar(f, 'id_duplicado', 'peca:base')).toHaveLength(1);
    const g = nova();
    g.planos[0]!.id = 'L';
    expect(achar(g, 'id_duplicado', 'plano:L')).toHaveLength(1);
  });
  it('5 tipo e faixa dos parâmetros', () => {
    const f = nova();
    param(f, 'nPrat').padrao = 1.5;
    expect(achar(f, 'tipo', 'parametro:nPrat').length).toBeGreaterThan(0);
    const g = nova();
    param(g, 'fundo').padrao = 'inexistente';
    expect(achar(g, 'tipo', 'parametro:fundo').length).toBeGreaterThan(0);
    const h = nova();
    delete param(h, 'corpo').opcoes;
    expect(achar(h, 'tipo', 'parametro:corpo').length).toBeGreaterThan(0);
    const i = nova();
    param(i, 'corpo').opcoes![0]!.esp = 0;
    expect(achar(i, 'tipo', 'parametro:corpo').length).toBeGreaterThan(0);
    const j = nova();
    param(j, 'L').min = 2000;
    expect(achar(j, 'faixa', 'parametro:L').length).toBeGreaterThan(0);
    const k = nova();
    param(k, 'L').padrao = 5000;
    expect(achar(k, 'faixa', 'parametro:L').length).toBeGreaterThan(0);
    const l = nova();
    param(l, 'esp').escopo = 'instancia';
    expect(achar(l, 'tipo', 'parametro:esp').length).toBeGreaterThan(0);
    const m = nova();
    (peca(m, 'base') as { eixo: string }).eixo = 'w';
    expect(achar(m, 'tipo', 'peca:base.eixo')).toHaveLength(1);
  });
  it('6 formula: sintaxe em qualquer campo, com o lugar e o motivo', () => {
    const f = nova();
    peca(f, 'base').origem[1] = '0 +';
    peca(f, 'porta').quando = 'nPortas >';
    param(f, 'esp').formula = '((corpo.esp)';
    f.planos[1]!.posicao = '1 $ 2';
    f.ferragens[0]!.quantidade = '';
    expect(achar(f, 'formula', 'peca:base.origem[1]')).toHaveLength(1);
    expect(achar(f, 'formula', 'peca:porta.quando')).toHaveLength(1);
    expect(achar(f, 'formula', 'parametro:esp.formula')).toHaveLength(1);
    expect(achar(f, 'formula', 'plano:pDir.posicao')).toHaveLength(1);
    expect(achar(f, 'formula', 'ferragem:dobradica.quantidade')).toHaveLength(1);
    expect(achar(f, 'formula', 'peca:base.origem[1]')[0]!.mensagem.length).toBeGreaterThan(5);
  });
  it('6 formula: usinagem, contorno e aninhado', () => {
    const f = nova();
    peca(f, 'base').contorno = { tipo: 'poligono', pontos: [['0', '0'], ['L', '0']] };
    expect(achar(f, 'formula', 'peca:base.contorno')).toHaveLength(1);
    peca(f, 'base').contorno = { tipo: 'poligono', pontos: [['0', '0'], ['L', '0'], ['L', '??']] };
    expect(achar(f, 'formula', 'peca:base.contorno[2][1]')).toHaveLength(1);
    peca(f, 'base').usinagens = [{ id: 'u1', tipo: 'furo', face: 'a', posicao: ['10', 'x +'], diametro: '5', profundidade: 'passante' }];
    expect(achar(f, 'formula', 'peca:base.usinagem:u1.posicao[1]')).toHaveLength(1);
    f.aninhados.push({ id: 'n1', nome: 'Módulo', familiaId: 'outra', valores: { L: '(' }, origem: ['0', '0', '0'] });
    expect(achar(f, 'formula', 'aninhado:n1.valores.L')).toHaveLength(1);
  });
  it('7 referencia: nomes inexistentes, membro esp, i e n', () => {
    const f = nova();
    peca(f, 'base').espessura = 'espesura';
    expect(achar(f, 'referencia', 'peca:base.espessura')).toHaveLength(1);
    const g = nova();
    param(g, 'zBase').formula = 'rodape.esp + 1';
    expect(achar(g, 'referencia', 'parametro:zBase.formula')).toHaveLength(1);
    const h = nova();
    peca(h, 'base').origem[0] = 'i';
    expect(achar(h, 'referencia', 'peca:base.origem[0]')).toHaveLength(1);
    const i = nova();
    peca(i, 'prat').repetir = 'n';
    expect(achar(i, 'referencia', 'peca:prat.repetir')).toHaveLength(1);
    const j = nova();
    peca(j, 'prat').origem[2] = 'i * n';
    expect(achar(j, 'referencia', 'peca:prat.origem[2]')).toHaveLength(0);
  });
  it('7 referencia: tipos, tipoPadrao e material', () => {
    const f = nova();
    f.tipos[0]!.valores.naoExiste = 1;
    f.tipos[1]!.valores.esp = 18;
    f.tipos[2]!.valores.fundo = 'inexistente';
    f.tipoPadrao = 'T999';
    expect(achar(f, 'referencia', 'tipo:A60.valores.naoExiste')).toHaveLength(1);
    expect(achar(f, 'referencia', 'tipo:A80.valores.esp')).toHaveLength(1);
    expect(achar(f, 'referencia', 'tipo:A100.valores.fundo')).toHaveLength(1);
    expect(achar(f, 'referencia', 'familia')).toHaveLength(1);
    const g = nova();
    peca(g, 'base').material = 'nPrat';
    expect(achar(g, 'referencia', 'peca:base.material')).toHaveLength(1);
    const h = nova();
    peca(h, 'base').material = 'mat_qualquer_do_projeto';
    expect(achar(h, 'referencia', 'peca:base.material')).toHaveLength(0);
  });
  it('8 ciclo entre fórmulas', () => {
    const f = nova();
    param(f, 'esp').formula = 'zBase - rodape';
    const c = achar(f, 'ciclo', 'familia');
    expect(c).toHaveLength(1);
    expect(c[0]!.mensagem).toContain('esp');
    expect(c[0]!.mensagem).toContain('zBase');
  });
  it('todos os problemas vêm com nível, código, mensagem e onde preenchidos', () => {
    const f = nova();
    param(f, 'L').id = '1x';
    peca(f, 'base').espessura = '+';
    for (const p of validarFamilia(f)) {
      expect(['erro', 'aviso']).toContain(p.nivel);
      expect(p.codigo.length).toBeGreaterThan(0);
      expect(p.mensagem.length).toBeGreaterThan(3);
      expect(p.onde.length).toBeGreaterThan(0);
    }
  });
  it('lixo não derruba: campos ausentes viram problema, nunca exceção', () => {
    const lixo = { ...nova(), parametros: [{ id: 'L' }], pecas: [{ id: 'p' }], tipos: [null], planos: [], aninhados: [], ferragens: [] } as unknown as Familia;
    expect(() => validarFamilia(lixo)).not.toThrow();
    expect(validarFamilia(lixo).length).toBeGreaterThan(0);
  });
});
