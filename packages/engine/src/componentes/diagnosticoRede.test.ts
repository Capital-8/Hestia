import { createEmptyProject, FAMILIA_ARMARIO, type Component, type Familia, type Ligacao, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { diagnosticarRede, type CodigoDiagnostico, type Diagnostico } from './diagnosticoRede.ts';

const BASE = createEmptyProject('t');

/** Tampão declarado na ligação (fecha a ponta de propósito). */
const TAMPAO: Partial<Ligacao> = { propriedades: { tampao: '1' } };

/** Família de trecho com duas ligações: `ini` na origem (entrada, para −X) e `fim` em (1000, 0, dz) mm (saída, para +X). */
function familia(id: string, opcoes: { dz?: string; dominio?: Ligacao['dominio']; diametro?: string; ini?: Partial<Ligacao>; fim?: Partial<Ligacao> } = {}): Familia {
  const base = { dominio: opcoes.dominio ?? 'esgoto', secao: 'redonda' as const, diametro: opcoes.diametro ?? '50' };
  return {
    ...structuredClone(FAMILIA_ARMARIO),
    id,
    nome: id,
    pecas: [], ferragens: [], conectores: [], planos: [], escolhas: [], tipos: [], tipoPadrao: undefined, corpos: [],
    parametros: [],
    ligacoes: [
      { id: 'ini', nome: 'ini', ...base, posicao: ['0', '0', '0'], direcao: ['-1', '0', '0'], fluxo: 'entrada', ...opcoes.ini },
      { id: 'fim', nome: 'fim', ...base, posicao: ['1000', '0', opcoes.dz ?? '0'], direcao: ['1', '0', '0'], fluxo: 'saida', ...opcoes.fim },
    ],
  };
}

/** Instância no mundo (x, 0, z) com as conexões dadas. */
function inst(id: string, x: number, z: number, familyId: string, ligacoes?: Component['ligacoes']): Component {
  return { id, kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 0, x, y: 0, z, rotation: 0, mirrored: false, mark: '', ligacoes };
}

/** Projeto com as famílias e as instâncias dadas. */
function projeto(instancias: Component[], familias: Familia[]): Project {
  return {
    ...BASE,
    componentFamilies: Object.fromEntries(familias.map((f) => [f.id, f])),
    elements: Object.fromEntries(instancias.map((c) => [c.id, c])),
  };
}

/** Diagnósticos de um código. */
const porCodigo = (lista: Diagnostico[], codigo: CodigoDiagnostico): Diagnostico[] => lista.filter((d) => d.codigo === codigo);

describe('diagnosticarRede', () => {
  const T = familia('t');

  it('ligação aberta: as duas pontas sem conexão e sem tampão', () => {
    const lista = diagnosticarRede(projeto([inst('a', 0, 0, 't')], [T]));
    expect(porCodigo(lista, 'ligacao_aberta').map((d) => d.ligacaoId)).toEqual(['ini', 'fim']);
  });

  it('ligação aberta: tampão declarado fecha a ponta', () => {
    const fechado = familia('t', { ini: TAMPAO, fim: TAMPAO });
    expect(porCodigo(diagnosticarRede(projeto([inst('a', 0, 0, 't')], [fechado])), 'ligacao_aberta')).toEqual([]);
  });

  it('conexão afastada: pontas a 6 mm uma da outra', () => {
    const a = inst('a', 0, 0, 't', { fim: { componenteId: 'b', ligacaoId: 'ini' } });
    const b = inst('b', 1.006, 0, 't', { ini: { componenteId: 'a', ligacaoId: 'fim' } });
    const afastadas = porCodigo(diagnosticarRede(projeto([a, b], [T])), 'conexao_afastada');
    expect(afastadas).toHaveLength(1);
    expect(afastadas[0]?.valor).toBeCloseTo(6, 6);
  });

  it('conexão a 4 mm: ainda se toca, sem aviso', () => {
    const a = inst('a', 0, 0, 't', { fim: { componenteId: 'b', ligacaoId: 'ini' } });
    const b = inst('b', 1.004, 0, 't', { ini: { componenteId: 'a', ligacaoId: 'fim' } });
    expect(porCodigo(diagnosticarRede(projeto([a, b], [T])), 'conexao_afastada')).toEqual([]);
  });

  it('incompatível: bitola diferente, e domínio diferente com o motivo do engine', () => {
    const b75 = familia('t75', { diametro: '75' });
    const pex = familia('pex', { dominio: 'agua_fria' });
    const a = inst('a', 0, 0, 't', { fim: { componenteId: 'b', ligacaoId: 'ini' } });
    const bitola = porCodigo(diagnosticarRede(projeto([a, inst('b', 1, 0, 't75', { ini: { componenteId: 'a', ligacaoId: 'fim' } })], [T, b75])), 'incompativel');
    expect(bitola.map((d) => d.motivo)).toEqual(['bitolas diferentes']);
    const dominio = porCodigo(diagnosticarRede(projeto([a, inst('b', 1, 0, 'pex', { ini: { componenteId: 'a', ligacaoId: 'fim' } })], [T, pex])), 'incompativel');
    expect(dominio.map((d) => d.motivo)).toEqual(['domínios incompatíveis']);
  });

  it('conexão inválida: a outra ponta não aponta de volta', () => {
    const a = inst('a', 0, 0, 't', { fim: { componenteId: 'b', ligacaoId: 'ini' } });
    const b = inst('b', 1, 0, 't');
    const invalidas = porCodigo(diagnosticarRede(projeto([a, b], [T])), 'conexao_invalida');
    expect(invalidas.map((d) => d.elementId)).toEqual(['a']);
    expect(invalidas[0]?.motivo).toBe('A conexão não é recíproca: a outra ponta não aponta de volta.');
  });

  it('inclinação fora do limite: esgoto DN 50 com 0,5 % (abaixo de 1 %) e com 6 % (acima de 5 %)', () => {
    const baixa = porCodigo(diagnosticarRede(projeto([inst('a', 0, 0, 'b')], [familia('b', { dz: '-5' })])), 'inclinacao_fora_limite');
    expect(baixa.map((d) => d.elementId)).toEqual(['a']);
    expect(baixa[0]?.valor).toBeCloseTo(0.5, 9);
    const alta = porCodigo(diagnosticarRede(projeto([inst('a', 0, 0, 'b')], [familia('b', { dz: '-60' })])), 'inclinacao_fora_limite');
    expect(alta[0]?.valor).toBeCloseTo(6, 9);
  });

  it('inclinação entre 1 % e 5 %, ou DN acima de 100 mm: sem aviso', () => {
    const ok = porCodigo(diagnosticarRede(projeto([inst('a', 0, 0, 'b')], [familia('b', { dz: '-30' })])), 'inclinacao_fora_limite');
    expect(ok).toEqual([]);
    const dn150 = porCodigo(diagnosticarRede(projeto([inst('a', 0, 0, 'b')], [familia('b', { dz: '-5', diametro: '150' })])), 'inclinacao_fora_limite');
    expect(dn150).toEqual([]);
  });

  it('rede sem saída: grupo conectado em que nenhuma ligação tem fluxo de saída', () => {
    const entradas = familia('e', { ini: { fluxo: 'entrada' }, fim: { fluxo: 'entrada' } });
    const a = inst('a', 0, 0, 'e', { fim: { componenteId: 'b', ligacaoId: 'fim' } });
    const b = inst('b', 0, 0, 'e', { fim: { componenteId: 'a', ligacaoId: 'fim' } });
    const sem = porCodigo(diagnosticarRede(projeto([a, b], [entradas])), 'rede_sem_saida');
    expect(sem).toEqual([{ codigo: 'rede_sem_saida', elementId: 'a', valor: 2 }]);
  });

  it('rede completa, sem avisos: caimento de 3 %, pontas tampadas e uma saída conectada', () => {
    // a: entrada tampada; saída (fim) conectada à entrada de b. b: entrada conectada; fim com fluxo ambos e tampado.
    const familiaA = familia('fa', { dz: '-30', ini: TAMPAO });
    const familiaB = familia('fb', { dz: '-30', fim: { ...TAMPAO, fluxo: 'ambos' } });
    const a = inst('a', 0, 0, 'fa', { fim: { componenteId: 'b', ligacaoId: 'ini' } });
    const b = inst('b', 1, -0.03, 'fb', { ini: { componenteId: 'a', ligacaoId: 'fim' } });
    expect(diagnosticarRede(projeto([a, b], [familiaA, familiaB]))).toEqual([]);
  });
});
