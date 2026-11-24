import { BIBLIOTECA_BASE, BIBLIOTECA_MEP, FAMILIA_ARMARIO } from '@hestia/model';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  agruparPorDisciplina,
  CATEGORIAS,
  criarCopiaDeFamilia,
  DISCIPLINAS_GALERIA,
  disciplinaDaFamilia,
  filtrarFamilias,
  normalizarTexto,
  proximoIdDeUsuario,
  reiniciarIdsAbertos,
} from './familiaNovo.ts';
import { PT_MODELOS } from '../../editor/i18n/areas/familiasModelos.ts';
import { modelosBase } from './modelosBase.ts';

beforeEach(() => reiniciarIdsAbertos());

describe('categorias novas da galeria (ADR 0061)', () => {
  const NOVAS = [
    'tubulacao', 'conexao_tubo', 'terminal_hidraulico', 'reservatorio', 'eletroduto',
    'dispositivo_eletrico', 'luminaria', 'duto', 'terminal_ar', 'perfil_estrutural', 'chapa_estrutural',
  ];

  it('aparecem na árvore, antes de "Meus modelos", e as antigas seguem na frente', () => {
    const ids = CATEGORIAS.map((c) => c.id);
    for (const id of NOVAS) expect(ids).toContain(id);
    expect(ids.slice(0, 5)).toEqual(['marcenaria', 'mobiliario', 'loucas', 'equipamento', 'generico']);
    expect(ids[ids.length - 1]).toBe('meus');
  });

  it('cada categoria nova tem rótulo pt-BR não vazio', () => {
    for (const c of CATEGORIAS.filter((o) => NOVAS.includes(o.id))) {
      expect(c.rotulo.trim().length).toBeGreaterThan(0);
    }
  });

  it('filtra pela categoria nova e não mostra as antigas', () => {
    const luminaria = { ...structuredClone(FAMILIA_ARMARIO), id: 'fam_teste_luz', categoria: 'luminaria' as const };
    const lista = [FAMILIA_ARMARIO, luminaria];
    expect(filtrarFamilias(lista, 'luminaria', '').map((f) => f.id)).toEqual(['fam_teste_luz']);
    expect(filtrarFamilias(lista, 'marcenaria', '').map((f) => f.id)).toEqual([FAMILIA_ARMARIO.id]);
  });

  it('a biblioteca base continua sem categorias novas (galeria atual intacta)', () => {
    const todas = filtrarFamilias(BIBLIOTECA_BASE, 'todas', '');
    expect(todas).toHaveLength(BIBLIOTECA_BASE.length);
    expect(todas.every((f) => !NOVAS.includes(f.categoria))).toBe(true);
  });
});

describe('normalizarTexto e filtrarFamilias', () => {
  it('tira acento e caixa', () => {
    expect(normalizarTexto('  Cômoda BAIXA ')).toBe('comoda baixa');
  });

  it('limita pela categoria e por "todas"', () => {
    const moveis = filtrarFamilias(BIBLIOTECA_BASE, 'mobiliario', '');
    expect(moveis.length).toBeGreaterThan(0);
    expect(moveis.every((f) => f.categoria === 'mobiliario')).toBe(true);
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', '')).toHaveLength(BIBLIOTECA_BASE.length);
  });

  it('busca sem acento no nome e na descrição', () => {
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', 'comoda').map((f) => f.id)).toContain('fam_comoda');
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', 'CARCA').map((f) => f.id)).toContain('fam_comoda');
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', 'zzz_inexistente')).toEqual([]);
  });

  it('a categoria "meus" não filtra por categoria', () => {
    const lista = [FAMILIA_ARMARIO, ...BIBLIOTECA_BASE.filter((f) => f.categoria === 'mobiliario').slice(0, 2)];
    expect(filtrarFamilias(lista, 'meus', '')).toHaveLength(lista.length);
  });
});

describe('proximoIdDeUsuario', () => {
  it('começa em 1 e pula os ocupados', () => {
    expect(proximoIdDeUsuario([])).toBe('fam_usuario_1');
    expect(proximoIdDeUsuario(['fam_usuario_1'])).toBe('fam_usuario_2');
    expect(proximoIdDeUsuario(['fam_usuario_1', 'fam_usuario_3'])).toBe('fam_usuario_2');
    expect(proximoIdDeUsuario(['outra_familia'])).toBe('fam_usuario_1');
  });
});

describe('criarCopiaDeFamilia', () => {
  it('copia fundo, renomeia e dá ids em sequência', () => {
    const a = criarCopiaDeFamilia(FAMILIA_ARMARIO);
    const b = criarCopiaDeFamilia(FAMILIA_ARMARIO);
    expect(a.id).toBe('fam_usuario_1');
    expect(b.id).toBe('fam_usuario_2');
    expect(a.nome).toBe(`${FAMILIA_ARMARIO.nome} (nova)`);
    expect(a.parametros).not.toBe(FAMILIA_ARMARIO.parametros);
    expect(a.pecas).not.toBe(FAMILIA_ARMARIO.pecas);
    a.nome = 'outro';
    expect(FAMILIA_ARMARIO.nome).not.toBe('outro');
  });

  it('mantém os aninhados apontando para as famílias da biblioteca', () => {
    const original = BIBLIOTECA_BASE.find((f) => f.aninhados.length > 0);
    expect(original).toBeDefined();
    const copia = criarCopiaDeFamilia(original!);
    expect(copia.aninhados.map((a) => a.familiaId)).toEqual(original!.aninhados.map((a) => a.familiaId));
  });
});

describe('filtro por disciplina e agrupamento da galeria (ficha G1)', () => {
  const galeria = agruparPorDisciplina([...modelosBase((c) => PT_MODELOS[c]), ...BIBLIOTECA_BASE, ...BIBLIOTECA_MEP]);

  it('as disciplinas vêm de DISCIPLINA_DA_CATEGORIA, sem repetição', () => {
    expect(DISCIPLINAS_GALERIA).toEqual(['arquitetura', 'hidrossanitario', 'eletrico', 'hvac', 'estrutura']);
  });

  it('disciplina ausente na família cai na padrão da categoria', () => {
    expect(disciplinaDaFamilia(FAMILIA_ARMARIO)).toBe('arquitetura');
    const semDisciplina = { ...structuredClone(FAMILIA_ARMARIO), categoria: 'luminaria' as const, disciplina: undefined };
    expect(disciplinaDaFamilia(semDisciplina)).toBe('eletrico');
  });

  it('filtra pela disciplina, e o padrão "todas" não filtra', () => {
    const hidro = filtrarFamilias(galeria, 'todas', '', 'hidrossanitario');
    expect(hidro.length).toBeGreaterThan(0);
    expect(hidro.every((f) => disciplinaDaFamilia(f) === 'hidrossanitario')).toBe(true);
    expect(filtrarFamilias(galeria, 'todas', '')).toHaveLength(galeria.length);
    expect(filtrarFamilias(galeria, 'todas', '', 'todas')).toHaveLength(galeria.length);
  });

  it('a disciplina combina com a categoria e com a busca', () => {
    const tubos = filtrarFamilias(galeria, 'tubulacao', '', 'hidrossanitario');
    expect(tubos.map((f) => f.id)).toContain('fam_modelo_tubo');
    expect(filtrarFamilias(galeria, 'tubulacao', '', 'eletrico')).toEqual([]);
    expect(filtrarFamilias(galeria, 'todas', 'tubo reto', 'hidrossanitario').map((f) => f.id)).toContain('fam_modelo_tubo');
  });

  it('agrupa: as disciplinas aparecem em blocos contínuos, na ordem da galeria', () => {
    const posicoes = galeria.map((f) => DISCIPLINAS_GALERIA.indexOf(disciplinaDaFamilia(f)));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });
});
