import { validarFamilia, type Familia } from '@hestia/model';
import { resolverFamilia } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { PT_MODELOS } from '../../editor/i18n/areas/familiasModelos.ts';
import { DNS_MODELO, modelosBase } from './modelosBase.ts';

/*
 * Ficha G1: os sete modelos-base. Cada um tem de validar sem erro, resolver sem erro em todos os tipos e ter os corpos e as
 * ligações que a ficha pede. Os nomes vêm do dicionário em português (`PT_MODELOS`).
 */

const t = (chave: keyof typeof PT_MODELOS): string => PT_MODELOS[chave];
const modelos = modelosBase(t);

function achar(id: string): Familia {
  const f = modelos.find((m) => m.id === id);
  if (!f) throw new Error(`modelo ausente: ${id}`);
  return f;
}

/** Ids de tipo da família (ou `undefined` quando não há tipos). */
function tiposDe(f: Familia): Array<string | undefined> {
  return f.tipos.length > 0 ? f.tipos.map((x) => x.id) : [undefined];
}

describe('modelos-base (ficha G1)', () => {
  it('são sete, com ids únicos, uma categoria por modelo e disciplina da categoria', () => {
    expect(modelos).toHaveLength(7);
    expect(new Set(modelos.map((f) => f.id)).size).toBe(7);
    expect(modelos.map((f) => f.categoria)).toEqual(['tubulacao', 'conexao_tubo', 'reservatorio', 'luminaria', 'perfil_estrutural', 'equipamento', 'mobiliario']);
    expect(modelos.map((f) => f.disciplina)).toEqual(['hidrossanitario', 'hidrossanitario', 'hidrossanitario', 'eletrico', 'estrutura', 'arquitetura', 'arquitetura']);
  });

  for (const f of modelos) {
    it(`${f.id}: valida sem nenhum erro`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
    });

    it(`${f.id}: L, A e P são comprimento de escopo instância, sem fórmula`, () => {
      for (const id of ['L', 'A', 'P']) {
        const p = f.parametros.find((x) => x.id === id);
        expect(p, id).toBeDefined();
        expect(p?.tipo).toBe('comprimento');
        expect(p?.escopo).toBe('instancia');
        expect(p?.formula).toBeUndefined();
      }
    });

    it(`${f.id}: resolve sem erro em todos os tipos`, () => {
      for (const tipoId of tiposDe(f)) {
        const r = resolverFamilia(f, tipoId === undefined ? {} : { tipoId });
        expect(r.erros, `${f.id}/${tipoId ?? 'padrão'}`).toEqual([]);
        expect(r.corpos?.length ?? 0).toBe(f.corpos?.length ?? 0);
        expect(r.ligacoes?.length ?? 0).toBe(f.ligacoes?.length ?? 0);
      }
    });
  }

  it('tubo: um corpo de varredura reto e duas ligações nas pontas, com o DN', () => {
    const f = achar('fam_modelo_tubo');
    expect(f.corpos?.map((c) => c.forma.tipo)).toEqual(['varredura']);
    expect(f.ligacoes?.map((l) => l.id)).toEqual(['a', 'b']);
    const r = resolverFamilia(f, { tipoId: 'dn100' });
    expect(r.ligacoes?.map((l) => l.diametro)).toEqual([0.1, 0.1]);
    expect(r.ligacoes?.[0]?.posicao).toEqual([0, 0, 0]);
    expect(r.ligacoes?.[1]?.posicao[2]).toBeCloseTo(1, 9);
  });

  it('tubo: o diâmetro das ligações acompanha cada DN do enum', () => {
    const f = achar('fam_modelo_tubo');
    expect(f.parametros.find((p) => p.id === 'DN')?.opcoes?.map((o) => o.valor)).toEqual([...DNS_MODELO]);
    for (const dn of DNS_MODELO) {
      const r = resolverFamilia(f, { tipoId: `dn${dn}` });
      expect(r.ligacoes?.[0]?.diametro).toBeCloseTo(dn / 1000, 9);
    }
  });

  it('conexão em curva: um corpo de varredura com raio no vértice e duas ligações nas pontas', () => {
    const f = achar('fam_modelo_curva');
    expect(f.corpos?.map((c) => c.forma.tipo)).toEqual(['varredura']);
    expect(f.ligacoes).toHaveLength(2);
    const r = resolverFamilia(f);
    expect(r.erros).toEqual([]);
    expect(r.ligacoes).toHaveLength(2);
  });

  it('caixa: paredes (perfil oco) e tampa, como dois corpos de extrusão', () => {
    const f = achar('fam_modelo_caixa');
    expect(f.corpos?.map((c) => [c.id, c.papel, c.forma.tipo])).toEqual([
      ['paredes', 'corpo', 'extrusao'],
      ['tampa', 'tampa', 'extrusao'],
    ]);
    expect(f.ligacoes).toEqual([]);
  });

  it('luminária: corpo, símbolo em planta e uma ligação elétrica de entrada', () => {
    const f = achar('fam_modelo_luminaria');
    expect(f.corpos).toHaveLength(1);
    expect(f.simbolos?.map((s) => s.vistas)).toEqual([['planta']]);
    expect(f.ligacoes?.map((l) => [l.dominio, l.fluxo])).toEqual([['eletrica_forca', 'entrada']]);
    const r = resolverFamilia(f);
    expect(r.simbolos?.length).toBe(1);
    expect(r.erros).toEqual([]);
  });

  it('perfil metálico: extrusão de perfil I ao longo de L', () => {
    const f = achar('fam_modelo_perfil');
    const forma = f.corpos?.[0]?.forma;
    expect(forma?.tipo === 'extrusao' && forma.perfil.tipo).toBe('perfilI');
    expect(f.ligacoes).toEqual([]);
  });

  it('equipamento genérico: um sólido retangular e nenhuma ligação', () => {
    const f = achar('fam_modelo_equipamento');
    expect(f.corpos?.map((c) => c.papel)).toEqual(['corpo']);
    expect(f.ligacoes).toEqual([]);
  });

  it('móvel: a caixaria paramétrica de sempre, com peças e categoria de mobiliário', () => {
    const f = achar('fam_modelo_movel');
    expect(f.categoria).toBe('mobiliario');
    expect(f.pecas.length).toBeGreaterThan(0);
    expect(resolverFamilia(f).pecas.length).toBeGreaterThan(0);
  });

  it('cada chamada devolve objetos novos, e os nomes passam pelo tradutor', () => {
    const outra = modelosBase((c) => `[${c}]`);
    expect(outra[0]?.nome).toBe('[modelo_tubo_nome]');
    expect(outra[6]?.descricao).toBe('[modelo_movel_desc]');
    expect(modelosBase(t)[0]).not.toBe(modelosBase(t)[0]);
  });
});
