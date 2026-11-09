import { describe, expect, it } from 'vitest';
import type { GerenciadorKernelV2 } from '@hestia/geom';
import { avisarKernelPendente } from './kernelPendente.ts';
import { definirGerenciadorDoGuardaCorpo, ServicoGuardaCorpo, servicoGuardaCorpo } from './kernelGuardaCorpoServico.ts';
import { projetoGuardaCorpo } from './fixtureGuardaCorpo.ts';

const falso = (ligado: boolean): GerenciadorKernelV2 => ({ ligado }) as unknown as GerenciadorKernelV2;

describe('ServicoGuardaCorpo: kernel que chega depois da primeira montagem', () => {
  it('sem kernel devolve null (nada de TypeScript), nao memoriza o vazio e avisa quando o kernel fica pronto', () => {
    let ger: GerenciadorKernelV2 | null = null;
    const srv = new ServicoGuardaCorpo(() => ger);
    const { p } = projetoGuardaCorpo();
    expect(srv.pronto()).toBe(false);
    expect(srv.malhas(p)).toBeNull();
    expect(srv.planta(p, null, 1.2)).toBeNull();
    let avisos = 0;
    const solta = srv.aoMudarPronto(() => avisos++);
    avisarKernelPendente(); // nada mudou: sem aviso
    expect(avisos).toBe(0);
    ger = falso(true);
    avisarKernelPendente(); // o carregamento do wasm terminou
    expect(srv.pronto()).toBe(true);
    expect(avisos).toBe(1);
    avisarKernelPendente();
    expect(avisos).toBe(1);
    solta();
    ger = null;
    avisarKernelPendente();
    expect(avisos).toBe(1);
  });

  it('trocar o gerenciador do processo mantém as assinaturas e avisa', () => {
    definirGerenciadorDoGuardaCorpo(() => null);
    let avisos = 0;
    const solta = servicoGuardaCorpo().aoMudarPronto(() => avisos++);
    definirGerenciadorDoGuardaCorpo(() => falso(true));
    expect(avisos).toBe(1);
    expect(servicoGuardaCorpo().pronto()).toBe(true);
    solta();
    definirGerenciadorDoGuardaCorpo(() => null);
  });
});
