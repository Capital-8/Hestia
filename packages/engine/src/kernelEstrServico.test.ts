import { describe, expect, it } from 'vitest';
import type { GerenciadorKernelV2 } from '@hestia/geom';
import { createEmptyProject, makeBeam, makeColumn, ProjectStore } from '@hestia/model';
import { assinaturasDoProjeto } from './assinaturasNivel.ts';
import { estrAvisosDeInvalidez, estrAvisosSemKernel } from './estrIssues.ts';
import { decodificarContornoEstr, decodificarMalhaEstr, decodificarQuantEstr, definirGerenciadorDaEstrutura, ServicoEstr, servicoEstr } from './kernelEstrServico.ts';
import { avisarKernelPendente } from './kernelPendente.ts';

const falso = (ligado: boolean): GerenciadorKernelV2 => ({ ligado }) as unknown as GerenciadorKernelV2;

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addColumn', column: makeColumn({ id: 'p1', typeId: 'pil_est_25x25', levelId: 'lv_0', pos: { x: 0, y: 0 } }) });
  s.exec({ type: 'addBeam', beam: makeBeam({ id: 'v1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
  return s;
}

describe('ServicoEstr sem kernel', () => {
  it('devolve null (nada de TypeScript), avisa quando o kernel fica pronto e para de avisar ao cancelar', () => {
    let ger: GerenciadorKernelV2 | null = null;
    const srv = new ServicoEstr(() => ger);
    const p = projeto().project;
    expect(srv.pronto()).toBe(false);
    expect(srv.malha(p, null)).toBeNull();
    expect(srv.leituras(p)).toBeNull();
    expect(srv.contorno({ forma: 'circular', d: 0.3 })).toBeNull();
    expect(srv.invalidos(p)).toEqual([]);
    let avisos = 0;
    const solta = srv.aoMudarPronto(() => avisos++);
    avisarKernelPendente();
    expect(avisos).toBe(0);
    ger = falso(true);
    avisarKernelPendente();
    expect(srv.pronto()).toBe(true);
    expect(avisos).toBe(1);
    solta();
    ger = null;
    avisarKernelPendente();
    expect(avisos).toBe(1);
  });

  it('projeto sem estrutura: kernel pronto devolve lista vazia sem criar cena', () => {
    const srv = new ServicoEstr(() => falso(true));
    expect(srv.malha(createEmptyProject(), null)).toEqual([]);
    expect(srv.enviosAoKernel).toBe(0);
  });

  it('trocar o gerenciador do processo mantém os ouvintes e avisa', () => {
    definirGerenciadorDaEstrutura(() => null);
    let avisos = 0;
    const solta = servicoEstr().aoMudarPronto(() => avisos++);
    definirGerenciadorDaEstrutura(() => falso(true));
    expect(avisos).toBe(1);
    expect(servicoEstr().pronto()).toBe(true);
    solta();
    definirGerenciadorDaEstrutura(() => null);
  });
});

describe('decodificadores das consultas 200, 203 e 205', () => {
  const idDe = (cat: string, n: number) => (cat === 'pilar' && n === 1 ? 'p1' : cat === 'viga' && n === 7 ? 'v1' : undefined);

  it('malha: um grupo por parte, vértices compactados por grupo e grupo de elemento desconhecido ignorado', () => {
    // dois grupos do pilar 1 (corpo e camadas) e um da viga 7; o terceiro triângulo usa vértices 3, 4, 5; um grupo do pilar 9 (desconhecido).
    const grupos = [1, 0, 0, 3, 0, 3, 1, 0, 3, 4, 3, 3, 7, 1, 0, 5, 6, 3, 9, 0, 0, 3, 0, 3];
    const vertices = Array.from({ length: 8 * 3 }, (_, i) => i);
    const indices = [0, 1, 2, 5, 4, 3, 6, 7, 0];
    const m = decodificarMalhaEstr(grupos, vertices, indices, idDe, (n) => `m${n}`);
    expect(m.map((e) => [e.elementId, e.categoria, e.partes.map((p) => p.parte)])).toEqual([['p1', 'pilar', ['corpo', 'camadas']], ['v1', 'viga', ['corpo']]]);
    expect(m[0]!.partes[0]!.materialId).toBe('m3');
    expect(m[0]!.partes[1]!.indices).toEqual([0, 1, 2]);
    expect(m[0]!.partes[1]!.positions).toEqual([15, 16, 17, 12, 13, 14, 9, 10, 11]);
    expect(m[1]!.partes[0]!.materialId).toBe('m5');
  });

  it('quantidades por elemento e contorno com furo', () => {
    const q = decodificarQuantEstr([1, 0, 1, 7, 7, 1, 1, 7], [0.24, 3.6, 3, 0.08, 0.3, 4, 5, 0.06], idDe);
    expect([...q.keys()]).toEqual(['p1', 'v1']);
    expect(q.get('p1')).toEqual({ volume: 0.24, areaForma: 3.6, comprimento: 3, areaSecao: 0.08 });
    const c = decodificarContornoEstr([0, 4, 1, 4], [0, 0, 1, 0, 1, 1, 0, 1, 0.2, 0.2, 0.2, 0.8, 0.8, 0.8, 0.8, 0.2], [0.64, 5.6])!;
    expect(c.anel).toHaveLength(4);
    expect(c.furos).toEqual([[[0.2, 0.2], [0.2, 0.8], [0.8, 0.8], [0.8, 0.2]]]);
    expect(c.area).toBe(0.64);
    expect(decodificarContornoEstr([], [], [])).toBeNull();
  });
});

describe('avisos da estrutura e assinatura por nível', () => {
  it('estr-sem-kernel: um por elemento válido; estr-invalida: um por elemento inválido, e o recusado pelo kernel', () => {
    const s = projeto();
    const q = structuredClone(s.project);
    q.elements['ruim'] = { ...(q.elements['p1'] as object), id: 'ruim', typeId: 'nao_existe' } as never;
    expect(estrAvisosSemKernel(q).map((a) => [a.code, a.elementId])).toEqual([['estr-sem-kernel', 'p1'], ['estr-sem-kernel', 'v1']]);
    const inv = estrAvisosDeInvalidez(q, 'pt', ['v1']);
    expect(inv.map((a) => [a.code, a.elementId])).toEqual([['estr-invalida', 'ruim'], ['estr-invalida', 'v1']]);
    expect(inv[0]!.message).toContain('não foi desenhado');
    expect(estrAvisosDeInvalidez(q, 'en')[0]!.message).toContain('was not drawn');
  });

  it('a assinatura de estrutura do nível muda só ao editar a estrutura; a do nível sem guarda-corpo não muda', () => {
    const s = projeto();
    const a = assinaturasDoProjeto(s.project);
    expect([...a.estr.keys()]).toEqual(['lv_0']);
    s.exec({ type: 'updateColumn', id: 'p1', patch: { rotation: 0.4 } });
    const b = assinaturasDoProjeto(s.project);
    expect(b.estr.get('lv_0')).not.toBe(a.estr.get('lv_0'));
    expect(b.nivelSemGuardaCorpo.get('lv_0')).toBe(a.nivelSemGuardaCorpo.get('lv_0'));
    expect(b.nivel.get('lv_0')).not.toBe(a.nivel.get('lv_0'));
  });
});
