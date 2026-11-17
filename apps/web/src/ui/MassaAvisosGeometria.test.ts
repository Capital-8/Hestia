import { describe, expect, it, vi } from 'vitest';
import { ProjectStore, createEmptyProject, makeMass, secaoCirculo } from '@hestia/model';
import { avisosGeometriaMassa } from '../editor/useIssues.ts';

// O kernel não roda no teste: o serviço devolve as medidas que o teste pôs (a consulta 145), como o Rust devolveria.
const kernel = vi.hoisted(() => ({ pronto: true, medidas: [] as Array<{ massaId: string; codigo: number; copia: number; indice: number; medido: number; limite: number; x: number; y: number; z: number }>, consultas: 0 }));

vi.mock('@hestia/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hestia/engine')>();
  return {
    ...actual,
    servicoMassa: () => ({
      pronto: () => kernel.pronto,
      ultimoErro: () => null,
      aoMudarPronto: () => () => undefined,
      avisos: () => {
        kernel.consultas++;
        return kernel.medidas;
      },
    }),
  };
});

const base = { copia: 0, indice: 0, x: 0, y: 0, z: 0, limite: 0 };

function projetoCom(id: string) {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addMass', mass: makeMass({ id, levelId: 'lv_0', name: 'Torre', secoes: [secaoCirculo(0, 3), secaoCirculo(9, 3)] }) });
  return s.project;
}

describe('avisos da massa no painel de avisos do projeto (ficha U2)', () => {
  it('os avisos 1 a 4 do kernel entram no painel, cada um com o id da massa (o "Ir para")', () => {
    kernel.pronto = true;
    kernel.consultas = 0;
    kernel.medidas = [
      { ...base, massaId: 'ms_a', codigo: 1, medido: 2 },
      { ...base, massaId: 'ms_a', codigo: 2, medido: 0 },
      { ...base, massaId: 'ms_a', codigo: 3, medido: 1, limite: 1 },
      { ...base, massaId: 'ms_a', codigo: 4, medido: 11.3, limite: 5 },
    ];
    const r = avisosGeometriaMassa(projetoCom('ms_a'), 'pt');
    expect(r.map((i) => i.code).sort()).toEqual(['massa-anel-autointersecta', 'massa-copias-sobrepostas', 'massa-face-inclinada', 'massa-limite']);
    expect(r.every((i) => i.elementId === 'ms_a')).toBe(true);
    expect(r.find((i) => i.code === 'massa-face-inclinada')!.severity).toBe('info');
    expect(r.find((i) => i.code === 'massa-copias-sobrepostas')!.severity).toBe('warning');
  });

  it('sem kernel pronto, cada massa ganha massa-sem-kernel com o id dela (o "Ir para" funciona)', () => {
    kernel.pronto = false;
    kernel.medidas = [];
    const r = avisosGeometriaMassa(projetoCom('ms_b'), 'pt');
    expect(r).toHaveLength(1);
    expect(r[0]!.code).toBe('massa-sem-kernel');
    expect(r[0]!.elementId).toBe('ms_b');
    kernel.pronto = true;
  });

  it('sem massa no projeto, não há aviso e o kernel nem é consultado', () => {
    kernel.pronto = true;
    kernel.consultas = 0;
    expect(avisosGeometriaMassa(createEmptyProject(), 'pt')).toEqual([]);
    expect(kernel.consultas).toBe(0);
  });
});
