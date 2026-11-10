import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeGuardaCorpo, type HospedeiroManual, normaDe, tiposGuardaCorpo, type PerfilNorma, type TipoGuardaCorpo } from '@hestia/model';
import { CODIGOS_GEOMETRIA_GC, CODIGO_AVISO_GC, guardaCorpoAvisosDeGeometria, guardaCorpoIssues, mensagemGeometria, guardaCorpoMedidasParaAvisos, guardaCorpoRegrasDoTipo, precisaConferir } from './guardaCorpoIssues.ts';
import { PAPEL_GC, guardaCorpoQuantities, type LinhaQuantGC } from './guardaCorpoQuantities.ts';
import { maiorEsfera } from './guardaCorpoRef/index.ts';

const tipos = Object.fromEntries(tiposGuardaCorpo('pt').map((x) => [x.id, x]));
const norma: PerfilNorma = structuredClone(normaDe(createEmptyProject(), null));
const manual: HospedeiroManual = { tipo: 'manual', uso: 'varanda', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 3, y: 4, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' };
const gc = (o: object = {}) => ({ ...makeGuardaCorpo({ id: 'g1', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: manual, ...o }), order: 1, ...(o as { order?: number }) });

describe('avisos de configuração do guarda-corpo', () => {
  it('gc-altura-baixa só quando a altura fica abaixo da norma', () => {
    const t = tipos.gct_balaustres!;
    const n = { ...norma, limites: { alturaMinima: 1.1 } };
    expect(guardaCorpoRegrasDoTipo(gc({ altura: 1.2 }), t, n).some((i) => i.code === 'gc-altura-baixa')).toBe(false);
    const baixo = guardaCorpoRegrasDoTipo(gc({ altura: 0.9 }), t, n).find((i) => i.code === 'gc-altura-baixa')!;
    expect(baixo.message).toContain('0.9');
    expect(baixo.severity).toBe('warning');
    expect(baixo.guardaId).toBe('g1');
  });

  it('o sufixo (norma a conferir) segue a fonte do campo', () => {
    const t = tipos.gct_balaustres!;
    const n: PerfilNorma = { ...norma, verificado: false, fontes: { alturaMinima: { norma: 'x', item: '1', verificado: false } }, limites: { alturaMinima: 1.1 } };
    expect(precisaConferir(n, 'alturaMinima')).toBe(true);
    expect(guardaCorpoRegrasDoTipo(gc({ altura: 0.9 }), t, n)[0]!.message).toContain('(norma a conferir)');
    const ok: PerfilNorma = { ...n, verificado: true, fontes: { alturaMinima: { norma: 'x', item: '1', verificado: true } } };
    expect(guardaCorpoRegrasDoTipo(gc({ altura: 0.9 }), t, ok)[0]!.message).not.toContain('conferir');
    expect(guardaCorpoRegrasDoTipo(gc({ altura: 0.9 }), t, ok, 'en')[0]!.message).toContain('Railing is');
  });

  it('corrimão: diâmetro, forma e afastamento', () => {
    const t: TipoGuardaCorpo = structuredClone(tipos.gct_balaustres!);
    t.corrimaos = [{ ...t.corrimaos[0]!, funcao: 'corrimao', afastamento: 0.02, perfil: { forma: 'circular', largura: 0.06, altura: 0.06 } }];
    const n: PerfilNorma = { ...norma, limites: { corrimaoDiametroMin: 0.038, corrimaoDiametroMax: 0.045, corrimaoAfastamentoMin: 0.04 } };
    const codes = guardaCorpoRegrasDoTipo(gc(), t, n).map((i) => i.code);
    expect(codes).toContain('gc-corrimao-diametro');
    expect(codes).toContain('gc-corrimao-afastamento');
    t.corrimaos[0]!.perfil = { forma: 'retangular', largura: 0.04, altura: 0.04 };
    expect(guardaCorpoRegrasDoTipo(gc(), t, n).some((i) => i.message.includes('não circular'))).toBe(true);
  });

  it('carga não declarada contra o limite do perfil', () => {
    const t = { ...tipos.gct_balaustres!, cargaLinear: null };
    const n: PerfilNorma = { ...norma, limites: { cargaLinearHorizontal: 730 } };
    expect(guardaCorpoRegrasDoTipo(gc(), t, n).some((i) => i.code === 'gc-carga-nao-declarada')).toBe(true);
    expect(guardaCorpoRegrasDoTipo(gc(), { ...t, cargaLinear: 1000 }, n)).toHaveLength(0);
  });

  it('guardaCorpoIssues percorre o projeto na ordem de criação', () => {
    const p = createEmptyProject();
    p.elements.g2 = gc({ id: 'g2', order: 2, altura: 0.5 });
    p.elements.g1 = gc({ id: 'g1', order: 1, altura: 0.5 });
    const ids = guardaCorpoIssues(p).filter((i) => i.code === 'gc-altura-baixa').map((i) => i.guardaId);
    expect(ids).toEqual(['g1', 'g2']);
  });
});

describe('medidas do Rust viram avisos', () => {
  it('cada código conhecido ganha texto; desconhecido é ignorado', () => {
    const base = { guardaId: 'g1', trecho: 0, indice: 0, x: 0, y: 0, z: 0 };
    const n: PerfilNorma = { ...norma, verificado: true, fontes: {} };
    const r = guardaCorpoMedidasParaAvisos(
      [
        { ...base, codigo: 1, medido: 0.12, limite: 0.11 },
        { ...base, codigo: 3, medido: 0.95, limite: 0.92 },
        { ...base, codigo: 4, medido: 0.2, limite: 0.3 },
        { ...base, codigo: 99, medido: 1, limite: 1 },
      ],
      n,
    );
    expect(r.map((i) => i.code)).toEqual(['gc-vao-grande', 'gc-corrimao-altura', 'gc-corrimao-extensao']);
    expect(r[0]!.message).toContain('0.12');
    expect(Object.values(CODIGO_AVISO_GC)).toHaveLength(17);
  });

  it('referência TS da esfera: vão de 120 mm passa 0,12 e o de 100 mm, 0,10', () => {
    const v = (vao: number) => {
      const passo = vao + 0.012;
      return { comprimento: 5 * passo + 0.012, altura: 1.1, verticais: [0, 1, 2, 3, 4, 5].map((k) => [k * passo, k * passo + 0.012] as [number, number]), horizontais: [[0, 0.05], [1.05, 1.1]] as Array<[number, number]> };
    };
    expect(maiorEsfera(v(0.12), 0.05, 1.05)!.diametro).toBeCloseTo(0.12, 9);
    expect(maiorEsfera(v(0.1), 0.05, 1.05)!.diametro).toBeCloseTo(0.1, 9);
  });
});

describe('avisos de geometria degenerada', () => {
  const base = { guardaId: 'g1', trecho: 0, indice: 0, x: 0, y: 0, z: 0 };
  const LANGS = ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const;

  it('cada código de geometria tem texto nos sete idiomas, com o valor medido, e nenhum igual ao português fora o próprio pt', () => {
    expect(CODIGOS_GEOMETRIA_GC).toHaveLength(12);
    for (const code of CODIGOS_GEOMETRIA_GC) {
      const pt = mensagemGeometria('pt', code, 0.123, 0.456);
      for (const lang of LANGS) {
        const m = mensagemGeometria(lang, code, 0.123, 0.456);
        expect(m, `${code} ${lang}`).not.toMatch(/{w+}/);
        expect(m.length).toBeGreaterThan(10);
        if (lang !== 'pt') expect(m, `${code} ${lang} igual ao pt`).not.toBe(pt);
      }
    }
  });

  it('as medidas de geometria do Rust viram avisos com código, guarda-corpo, trecho e mensagem, sem "a conferir"', () => {
    const n: PerfilNorma = { ...norma, verificado: false, fontes: {} };
    const r = guardaCorpoMedidasParaAvisos([{ ...base, codigo: 8, trecho: 2, medido: 0, limite: 1e-6 }, { ...base, codigo: 9, medido: 3, limite: 0 }], n);
    expect(r.map((i) => [i.code, i.guardaId, i.trecho])).toEqual([['gc-trecho-curto', 'g1', 2], ['gc-caminho-repetido', 'g1', 0]]);
    expect(r[1]!.message).toContain('3 vértice(s)');
    expect(r.every((i) => i.severity === 'warning' && !i.message.includes('a conferir'))).toBe(true);
  });

  it('a lista do projeto leva só os de geometria, de guarda-corpos que existem, e fica vazia sem kernel', () => {
    const p = createEmptyProject();
    p.elements['g1'] = gc() as never;
    const medidas = [{ ...base, codigo: 10, medido: 1, limite: 2 }, { ...base, codigo: 1, medido: 0.12, limite: 0.11 }, { ...base, guardaId: 'fantasma', codigo: 8, medido: 0, limite: 0 }];
    const r = guardaCorpoAvisosDeGeometria(p, medidas, 'en');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ code: 'gc-caminho-nulo', severity: 'warning', elementId: 'g1', ids: ['g1'] });
    expect(r[0]!.message).toContain('no segment');
    expect(guardaCorpoAvisosDeGeometria(p, null)).toEqual([]);
  });
});

describe('quantidades do guarda-corpo', () => {
  it('agrega contagens, volumes e custo a partir das linhas do Rust', () => {
    const p = createEmptyProject();
    p.elements.g1 = gc();
    p.tiposGuardaCorpo.gct_balaustres = { ...p.tiposGuardaCorpo.gct_balaustres!, cost: 100 };
    const l = (papel: number, nPecas: number, comprimento: number, volume: number, materialNum = 1): LinhaQuantGC => ({ guardaId: 'g1', papel, perfilNum: 0, materialNum, nPecas, comprimento, area: 2, volume, areaProjetada: 0 });
    const q = guardaCorpoQuantities(p, [l(PAPEL_GC.balaustre, 46, 46, 0.005), l(PAPEL_GC.poste, 2, 2.2, 0.004, 2), l(PAPEL_GC.painel, 3, 6, 0.07, 2)], [{ guardaId: 'g1', trechos: [[{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }]] }]);
    expect(q).toHaveLength(1);
    const x = q[0]!;
    expect(x.balaustres).toBe(46);
    expect(x.postes).toBe(2);
    expect(x.paineis).toBe(3);
    expect(x.areaPaineis).toBe(1);
    expect(x.comprimentoEixo).toBeCloseTo(5, 12);
    expect(x.comprimentoDesenvolvido).toBeCloseTo(5, 12);
    expect(x.custo).toBeCloseTo(500, 9);
    expect(x.volumeTotal).toBeCloseTo(0.079, 12);
    expect(x.volumePorMaterial[2]).toBeCloseTo(0.074, 12);
    expect(x.porPapel.map((r) => r.papel)).toEqual(['poste', 'balaustre', 'painel']);
  });

  it('guarda-corpo sem linhas nem eixo não aparece', () => {
    const p = createEmptyProject();
    p.elements.g1 = gc();
    expect(guardaCorpoQuantities(p, [])).toEqual([]);
  });
});
