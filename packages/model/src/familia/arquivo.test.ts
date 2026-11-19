import { describe, expect, it } from 'vitest';
import { ARQUIVO_MAX_CARACTERES, ARQUIVO_MAX_FAMILIAS, exportarFamilias, importarFamilias, lerArquivo, serializar } from './arquivo.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia } from './tipos.ts';

const clone = <T>(x: T): T => structuredClone(x);
const arquivo = (familias: unknown[], extra: Record<string, unknown> = {}) => ({ formato: FAMILIA_FORMATO, versao: FAMILIA_VERSAO, familias, ...extra });

describe('exportarFamilias e serializar', () => {
  it('copia profundo e carimba formato e versão atuais', () => {
    const a = exportarFamilias([FAMILIA_ARMARIO]);
    expect(a).toMatchObject({ formato: FAMILIA_FORMATO, versao: FAMILIA_VERSAO });
    expect(a.familias[0]).toEqual(FAMILIA_ARMARIO);
    expect(a.familias[0]).not.toBe(FAMILIA_ARMARIO);
    expect(a.familias[0]!.pecas[0]).not.toBe(FAMILIA_ARMARIO.pecas[0]);
    a.familias[0]!.nome = 'mudou';
    expect(FAMILIA_ARMARIO.nome).toBe('Armário baixo');
  });
  it('serializar gera JSON com 2 espaços que volta igual', () => {
    const texto = serializar(exportarFamilias([FAMILIA_ARMARIO]));
    expect(texto).toContain('\n  "formato": "hestia-familia"');
    expect(JSON.parse(texto)).toEqual(exportarFamilias([FAMILIA_ARMARIO]));
  });
});

describe('importarFamilias', () => {
  it('ida e volta sem perda', () => {
    const r = importarFamilias(JSON.parse(serializar(exportarFamilias([FAMILIA_ARMARIO]))));
    expect(r.ignoradas).toEqual([]);
    expect(r.familias).toEqual([FAMILIA_ARMARIO]);
  });
  it('lança nos casos fatais', () => {
    for (const ruim of [null, 5, 'texto', [], arquivo([], { formato: 'outro' }), arquivo([], { versao: undefined }), arquivo([], { versao: 1.5 }), arquivo([], { versao: 0 }), arquivo([], { familias: 'x' }), { formato: FAMILIA_FORMATO, versao: 1 }]) {
      expect(() => importarFamilias(ruim), JSON.stringify(ruim)).toThrow(Error);
    }
    expect(() => importarFamilias(arquivo([], { versao: FAMILIA_VERSAO + 1 }))).toThrow(/mais novo/);
    expect(() => importarFamilias(arquivo(Array.from({ length: ARQUIVO_MAX_FAMILIAS + 1 }, () => ({}))))).toThrow(Error);
  });
  it('ignora a família ruim e importa as boas, dizendo o motivo', () => {
    const semNome = clone(FAMILIA_ARMARIO) as unknown as Record<string, unknown>;
    semNome.id = 'outra1';
    delete semNome.nome;
    const quebrada = clone(FAMILIA_ARMARIO);
    quebrada.id = 'quebrada';
    quebrada.pecas[0]!.espessura = '+';
    const boa = clone(FAMILIA_ARMARIO);
    boa.id = 'boa';
    boa.nome = 'Boa';
    const r = importarFamilias(arquivo([semNome, 7, quebrada, boa]));
    expect(r.familias.map((f) => f.id)).toEqual(['boa']);
    expect(r.ignoradas).toHaveLength(3);
    expect(r.ignoradas.map((i) => i.nome)).toContain('(sem nome)');
    const q = r.ignoradas.find((i) => i.nome === 'Armário baixo');
    expect(q?.motivo).toContain('peca:');
  });
  it('id repetido no arquivo: a segunda é ignorada', () => {
    const r = importarFamilias(arquivo([clone(FAMILIA_ARMARIO), clone(FAMILIA_ARMARIO)]));
    expect(r.familias).toHaveLength(1);
    expect(r.ignoradas).toHaveLength(1);
    expect(r.ignoradas[0]!.motivo).toMatch(/repet|duplic/i);
  });
  it('descarta chaves desconhecidas de primeiro nível e carimba formato e versão', () => {
    const f = { ...clone(FAMILIA_ARMARIO), lixo: 'x', outroLixo: { a: 1 }, versao: 1 } as unknown as Familia;
    const r = importarFamilias(arquivo([f]));
    expect(r.familias).toHaveLength(1);
    expect(Object.keys(r.familias[0]!)).not.toContain('lixo');
    expect(r.familias[0]!.versao).toBe(FAMILIA_VERSAO);
    expect(r.familias[0]!.formato).toBe(FAMILIA_FORMATO);
  });
  it('recusa chave perigosa em qualquer nível (poluição de protótipo)', () => {
    const texto = serializar(exportarFamilias([FAMILIA_ARMARIO])).replace('"nome": "Armário baixo",', '"nome": "Armário baixo", "__proto__": {"polui": true},');
    const r = lerArquivo(texto);
    expect(r.familias).toHaveLength(0);
    expect(r.ignoradas[0]!.motivo).toContain('chave proibida');
    expect(({} as Record<string, unknown>).polui).toBeUndefined();
    const fundo = JSON.parse(serializar(exportarFamilias([FAMILIA_ARMARIO])));
    fundo.familias[0].pecas[0].constructor = { x: 1 };
    expect(importarFamilias(fundo).familias).toHaveLength(0);
  });
  it('é cópia: mudar o resultado não muda a entrada', () => {
    const entrada = arquivo([clone(FAMILIA_ARMARIO)]);
    const r = importarFamilias(entrada);
    r.familias[0]!.nome = 'x';
    expect((entrada.familias[0] as Familia).nome).toBe('Armário baixo');
  });
});

describe('lerArquivo', () => {
  it('lê texto válido e recusa JSON ruim ou grande demais', () => {
    expect(lerArquivo(serializar(exportarFamilias([FAMILIA_ARMARIO]))).familias).toHaveLength(1);
    expect(() => lerArquivo('{ não é json')).toThrow(/Arquivo inválido/);
    expect(() => lerArquivo(' '.repeat(ARQUIVO_MAX_CARACTERES + 1))).toThrow(/Arquivo inválido/);
  });
});

describe('conectores e escolhas atravessam o arquivo (regressão da onda 0)', () => {
  it('exportar e importar preservam conectores e escolhas', async () => {
    const { exportarFamilias, importarFamilias } = await import('./arquivo.ts');
    const { FAMILIA_ARMARIO } = await import('./exemplos.ts');
    const f = structuredClone(FAMILIA_ARMARIO);
    f.conectores = [{ id: 'cesq', nome: 'Lateral esquerda', lado: 'esquerda', etiqueta: 'base', aceita: ['base'] }];
    const porta = f.pecas.find((q) => q.id === 'porta')!;
    porta.grupo = 'portas';
    f.escolhas = [{ id: 'e1', nome: 'Porta', parametro: 'nPortas', zona: 'portas' }];
    const lido = importarFamilias(JSON.parse(JSON.stringify(exportarFamilias([f]))));
    expect(lido.familias[0]?.conectores).toEqual(f.conectores);
    expect(lido.familias[0]?.escolhas).toEqual(f.escolhas);
  });
});
