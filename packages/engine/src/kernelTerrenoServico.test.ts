import { describe, expect, it } from 'vitest';
import type { GerenciadorKernelV2 } from '@hestia/geom';
import { createEmptyProject } from '@hestia/model';
import { projetoTerreno } from './fixtureTerreno.ts';
import { avisarKernelPendente } from './kernelPendente.ts';
import { definirGerenciadorDoTerreno, ServicoTerreno, servicoTerreno, temTerreno } from './kernelTerrenoServico.ts';

const falso = (ligado: boolean): GerenciadorKernelV2 => ({ ligado }) as unknown as GerenciadorKernelV2;

describe('ServicoTerreno sem kernel', () => {
  it('toda função devolve null, o aviso terreno-sem-kernel está presente e nada lança', () => {
    const srv = new ServicoTerreno(() => null);
    const p = projetoTerreno('T2');
    expect(srv.pronto()).toBe(false);
    expect(srv.malha(p)).toBeNull();
    expect(srv.malha(p, 0)).toBeNull();
    expect(srv.curvas(p)).toBeNull();
    expect(srv.planta(p)).toBeNull();
    expect(srv.corte(p, { x: 0, y: 10 }, { x: 1, y: 0 }, 5)).toBeNull();
    expect(srv.quantidades(p)).toBeNull();
    expect(srv.quantidadesRegioes(p)).toBeNull();
    expect(srv.mapaCorteAterro(p)).toBeNull();
    expect(srv.avisos(p)).toBeNull();
    expect(srv.cotaDoTerreno(p, [{ x: 10, y: 10 }])).toBeNull();
    expect(srv.falhou(p)).toBeNull();
    const avisos = srv.avisosDoPainel(p);
    expect(avisos.map((a) => a.code)).toEqual(['terreno-sem-kernel']);
    expect(srv.avisosDoPainel(p, 'en')[0]!.message).toContain('Terrain');
    expect(() => srv.encerrar()).not.toThrow();
  });

  it('gerenciador com ligado=false (kernel desligado) também devolve null', () => {
    const srv = new ServicoTerreno(() => falso(false));
    expect(srv.curvas(projetoTerreno('T1'))).toBeNull();
    expect(srv.avisosDoPainel(projetoTerreno('T1'))[0]!.code).toBe('terreno-sem-kernel');
  });

  it('projeto sem terreno: nenhum aviso', () => {
    const srv = new ServicoTerreno(() => null);
    expect(srv.avisosDoPainel(createEmptyProject())).toEqual([]);
    expect(ServicoTerreno.temTerreno(createEmptyProject())).toBe(false);
    expect(temTerreno(projetoTerreno('T1'))).toBe(true);
  });

  it('kernel que chega depois da primeira consulta: avisa os ouvintes uma vez', () => {
    let ger: GerenciadorKernelV2 | null = null;
    const srv = new ServicoTerreno(() => ger);
    let avisos = 0;
    const solta = srv.aoMudarPronto(() => avisos++);
    avisarKernelPendente();
    expect(avisos).toBe(0);
    ger = falso(true);
    avisarKernelPendente();
    expect(srv.pronto()).toBe(true);
    expect(avisos).toBe(1);
    avisarKernelPendente();
    expect(avisos).toBe(1);
    solta();
  });

  it('kernel que recusa os dados: null, falhou() com a mensagem e aviso terreno-invalido (sem exceção)', () => {
    // Gerenciador "ligado" que não sabe criar cena: `CenaV2.criar` lança; o serviço traduz em falha.
    const srv = new ServicoTerreno(() => falso(true));
    const p = projetoTerreno('T1');
    expect(srv.malha(p)).toBeNull();
    expect(srv.falhou(p)).not.toBeNull();
    expect(srv.cotaDoTerreno(p, [{ x: 1, y: 1 }])).toBeNull();
    const a = srv.avisosDoPainel(p);
    expect(a.map((x) => x.code)).toEqual(['terreno-invalido']);
    expect(srv.falhou(projetoTerreno('T1'))).toBeNull();
  });

  it('o serviço do processo troca de gerenciador e mantém os ouvintes', () => {
    definirGerenciadorDoTerreno(() => null);
    let avisos = 0;
    const solta = servicoTerreno().aoMudarPronto(() => avisos++);
    definirGerenciadorDoTerreno(() => falso(true));
    expect(avisos).toBe(1);
    expect(servicoTerreno().pronto()).toBe(true);
    solta();
    definirGerenciadorDoTerreno(() => null);
  });
});
