import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import {
  CLASSE_IFC_DA_CATEGORIA,
  classeIfcDaFamilia,
  DISCIPLINA_DA_CATEGORIA,
  ROTULO_CATEGORIA,
} from './categorias.ts';
import type { CategoriaFamilia } from './tipos.ts';

/** Tabela do CONTRATO §6, linha por linha (categoria → classe IFC padrão). */
const TABELA_IFC: Record<CategoriaFamilia, string> = {
  marcenaria: 'IFCFURNITURE',
  mobiliario: 'IFCFURNITURE',
  generico: 'IFCFURNITURE',
  loucas: 'IFCSANITARYTERMINAL',
  terminal_hidraulico: 'IFCSANITARYTERMINAL',
  equipamento: 'IFCFLOWTERMINAL',
  tubulacao: 'IFCPIPESEGMENT',
  conexao_tubo: 'IFCPIPEFITTING',
  reservatorio: 'IFCTANK',
  eletroduto: 'IFCCABLECARRIERSEGMENT',
  dispositivo_eletrico: 'IFCOUTLET',
  luminaria: 'IFCLIGHTFIXTURE',
  duto: 'IFCDUCTSEGMENT',
  terminal_ar: 'IFCAIRTERMINAL',
  perfil_estrutural: 'IFCMEMBER',
  chapa_estrutural: 'IFCPLATE',
};

const CATEGORIAS_NOVAS: CategoriaFamilia[] = [
  'tubulacao', 'conexao_tubo', 'terminal_hidraulico', 'reservatorio', 'eletroduto',
  'dispositivo_eletrico', 'luminaria', 'duto', 'terminal_ar', 'perfil_estrutural', 'chapa_estrutural',
];

describe('classeIfcDaFamilia (CONTRATO §6)', () => {
  it('a tabela de classes cobre as 16 categorias e bate com o contrato', () => {
    expect(CLASSE_IFC_DA_CATEGORIA).toEqual(TABELA_IFC);
  });

  it('cada categoria, numa família sem sobrescrita, sai com a classe da tabela', () => {
    for (const [categoria, classe] of Object.entries(TABELA_IFC)) {
      const familia = { ...FAMILIA_ARMARIO, categoria: categoria as CategoriaFamilia };
      expect(classeIfcDaFamilia(familia)).toBe(classe);
    }
  });

  it('Familia.ifc sobrescreve a classe da categoria (interruptor fora da tomada)', () => {
    const interruptor = {
      ...FAMILIA_ARMARIO,
      categoria: 'dispositivo_eletrico' as const,
      ifc: { classe: 'IFCSWITCHINGDEVICE' as const },
    };
    expect(classeIfcDaFamilia(interruptor)).toBe('IFCSWITCHINGDEVICE');
    expect(classeIfcDaFamilia({ ...interruptor, ifc: undefined })).toBe('IFCOUTLET');
  });

  it('categorias antigas mantêm a classe de hoje (marcenaria, mobiliário, genérico → IFCFURNITURE)', () => {
    expect(classeIfcDaFamilia({ ...FAMILIA_ARMARIO, categoria: 'marcenaria' })).toBe('IFCFURNITURE');
    expect(classeIfcDaFamilia({ ...FAMILIA_ARMARIO, categoria: 'mobiliario' })).toBe('IFCFURNITURE');
    expect(classeIfcDaFamilia({ ...FAMILIA_ARMARIO, categoria: 'generico' })).toBe('IFCFURNITURE');
    expect(classeIfcDaFamilia({ ...FAMILIA_ARMARIO, categoria: 'equipamento' })).toBe('IFCFLOWTERMINAL');
  });
});

describe('disciplina e rótulo', () => {
  it('disciplina padrão por categoria segue a ficha E1', () => {
    expect(DISCIPLINA_DA_CATEGORIA.marcenaria).toBe('arquitetura');
    expect(DISCIPLINA_DA_CATEGORIA.mobiliario).toBe('arquitetura');
    for (const c of ['tubulacao', 'conexao_tubo', 'terminal_hidraulico', 'reservatorio'] as const) {
      expect(DISCIPLINA_DA_CATEGORIA[c]).toBe('hidrossanitario');
    }
    for (const c of ['eletroduto', 'dispositivo_eletrico', 'luminaria'] as const) {
      expect(DISCIPLINA_DA_CATEGORIA[c]).toBe('eletrico');
    }
    for (const c of ['duto', 'terminal_ar'] as const) {
      expect(DISCIPLINA_DA_CATEGORIA[c]).toBe('hvac');
    }
    for (const c of ['perfil_estrutural', 'chapa_estrutural'] as const) {
      expect(DISCIPLINA_DA_CATEGORIA[c]).toBe('estrutura');
    }
  });

  it('todas as categorias novas têm rótulo em pt-BR não vazio', () => {
    for (const c of CATEGORIAS_NOVAS) {
      expect(ROTULO_CATEGORIA[c].trim().length).toBeGreaterThan(0);
    }
    expect(ROTULO_CATEGORIA.tubulacao).toBe('Tubulação');
  });
});
