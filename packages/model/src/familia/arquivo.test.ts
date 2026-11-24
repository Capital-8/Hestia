import { describe, expect, it } from 'vitest';
import { DISCIPLINES } from '../planView.ts';
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

describe('disciplina da família atravessa o arquivo (adendo 1 do ADR 0060)', () => {
  it('família antiga, sem o campo, não ganha a chave e volta idêntica', () => {
    const texto = serializar(exportarFamilias([FAMILIA_ARMARIO]));
    expect(texto).not.toContain('"disciplina"');
    const r = importarFamilias(JSON.parse(texto));
    expect(r.ignoradas).toEqual([]);
    expect(r.familias).toEqual([FAMILIA_ARMARIO]);
    expect(Object.keys(r.familias[0]!)).not.toContain('disciplina');
  });

  it('as cinco disciplinas voltam como foram gravadas', () => {
    const familias = DISCIPLINES.map((d) => {
      const f = clone(FAMILIA_ARMARIO);
      f.id = `fam_${d}`;
      f.nome = `Família ${d}`;
      f.disciplina = d;
      return f;
    });
    const r = importarFamilias(JSON.parse(serializar(exportarFamilias(familias))));
    expect(r.ignoradas).toEqual([]);
    expect(r.familias.map((f) => f.disciplina)).toEqual(['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac']);
    expect(r.familias).toEqual(familias);
  });

  it('disciplina fora das cinco é erro: a família é ignorada com o motivo', () => {
    const f = clone(FAMILIA_ARMARIO);
    (f as { disciplina?: string }).disciplina = 'piscina';
    const r = importarFamilias(arquivo([f]));
    expect(r.familias).toEqual([]);
    expect(r.ignoradas).toHaveLength(1);
    expect(r.ignoradas[0]!.motivo).toMatch(/disciplina/i);
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

describe('versão 2 do arquivo (ficha A9, CONTRATO.md §9)', () => {
  it('arquivo v1 antigo abre igual e não ganha chaves novas', () => {
    const v1 = { formato: FAMILIA_FORMATO, versao: 1, familias: [clone(FAMILIA_ARMARIO)] };
    const r = importarFamilias(v1);
    expect(r.ignoradas).toEqual([]);
    expect(r.familias).toEqual([FAMILIA_ARMARIO]);
    for (const chave of ['corpos', 'ligacoes', 'simbolos', 'detalhes', 'tabelas', 'verificacoes', 'ifc']) {
      expect(Object.keys(r.familias[0]!)).not.toContain(chave);
    }
  });

  it('v2 com todas as chaves novas faz ida e volta idêntica', () => {
    const f = clone(FAMILIA_ARMARIO);
    f.corpos = [{ id: 'c1', nome: 'Tubo', papel: 'tubo', forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '50' }, comprimento: 'L' }, quadro: { origem: ['0', '0', '0'] } }];
    f.ligacoes = [{ id: 'l1', nome: 'Entrada', dominio: 'agua_fria', secao: 'redonda', posicao: ['0', '0', '0'], direcao: ['0', '0', '1'], diametro: '15', fluxo: 'entrada' }];
    f.simbolos = [{ id: 's1', nome: 'Símbolo', vistas: ['planta'], plano: 'xy', primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['L', '0'] }] }];
    f.detalhes = [{ id: 'd1', nome: 'Corte', vista: 'corte', escala: 50, cotas: [{ id: 'c1', de: { tipo: 'plano', id: 'p1' }, ate: { tipo: 'plano', id: 'p2' } }] }];
    f.tabelas = [{ id: 't1', nome: 'Tabela', porTipo: true, colunas: [{ titulo: 'Largura', valor: 'L', unidade: 'mm' }] }];
    f.verificacoes = [{ id: 'v1', severidade: 'aviso', condicao: 'L > 2000', mensagem: 'Vão longo' }];
    f.ifc = { classe: 'IFCPIPESEGMENT', tipoPredefinido: 'RIGIDSEGMENT' };
    const r = importarFamilias(JSON.parse(serializar(exportarFamilias([f]))));
    expect(r.ignoradas).toEqual([]);
    expect(r.familias).toEqual([f]);
    expect(r.familias[0]!.versao).toBe(2);
  });

  it('v3 é recusado como arquivo mais novo', () => {
    expect(() => importarFamilias({ formato: FAMILIA_FORMATO, versao: 3, familias: [] })).toThrow(/mais novo/);
  });

  it('chave proibida dentro de uma chave nova faz a família ser ignorada, com o motivo', () => {
    const f = clone(FAMILIA_ARMARIO);
    f.corpos = [{ id: 'c1', nome: 'Tubo', papel: 'tubo', forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '50' }, comprimento: 'L' }, quadro: { origem: ['0', '0', '0'] } }];
    const texto = serializar(exportarFamilias([f])).replace('"papel": "tubo",', '"papel": "tubo", "__proto__": {"polui": true},');
    const r = lerArquivo(texto);
    expect(r.familias).toHaveLength(0);
    expect(r.ignoradas[0]!.motivo).toContain('chave proibida');
    expect(({} as Record<string, unknown>).polui).toBeUndefined();
  });
});
