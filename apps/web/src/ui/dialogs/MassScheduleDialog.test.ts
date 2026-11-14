import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Kernel simulado: `fonte.ligada` liga e desliga as respostas, como o kernel Rust faria (o teste não roda o WASM).
const fonte = vi.hoisted(() => ({ ligada: true }));

vi.mock('../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject, makeMass, secaoCirculo } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addMass', mass: makeMass({ id: 'ms1', levelId: 'lv_0', name: 'Torre', secoes: [secaoCirculo(0, 3), secaoCirculo(9, 3)] }) });
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

vi.mock('@hestia/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hestia/engine')>();
  const fatias = [{ massaId: 'ms1', copia: 0, nivelId: 'lv_0', area: 28.27, perimetro: 18.85, z: 0, pontos: [] }];
  const quant = [{ massaId: 'ms1', volume: 254.47, areaLateral: 169.65, areaBase: 28.27, areaTopo: 28.27, altura: 9 }];
  const avisos = [{ massaId: 'ms1', codigo: 2, copia: 0, indice: 0, medido: 2, limite: 0, x: 0, y: 0, z: 0 }];
  return {
    ...actual,
    servicoMassa: () => ({
      pronto: () => fonte.ligada,
      aoMudarPronto: () => () => undefined,
      fatias: () => (fonte.ligada ? fatias : null),
      quantidades: () => (fonte.ligada ? quant : null),
      avisos: () => (fonte.ligada ? avisos : null),
    }),
  };
});

import { MassScheduleDialog } from './MassScheduleDialog.tsx';

describe('tabela "Massas por pavimento" (diálogo)', () => {
  it('com o kernel desligado, mostra a mensagem e nenhum número', () => {
    fonte.ligada = false;
    const html = renderToStaticMarkup(createElement(MassScheduleDialog));
    expect(html).toContain('O kernel de geometria não está ligado');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('Total');
  });

  it('com o kernel ligado, mostra os cabeçalhos na ordem da exportação', () => {
    fonte.ligada = true;
    const html = renderToStaticMarkup(createElement(MassScheduleDialog));
    const cabecalhos = ['Massa', 'Pavimento', 'Área (m²)', 'Perímetro (m)', 'Aviso'];
    let anterior = -1;
    for (const rotulo of cabecalhos) {
      const posicao = html.indexOf(rotulo);
      expect(posicao, rotulo).toBeGreaterThan(anterior);
      anterior = posicao;
    }
  });

  it('a linha traz a massa, o pavimento, a área e a nota do aviso 2; o total e o rodapé aparecem', () => {
    fonte.ligada = true;
    const html = renderToStaticMarkup(createElement(MassScheduleDialog));
    expect(html).toContain('Torre');
    expect(html).toContain('Térreo');
    expect(html).toContain('a área pode contar em dobro');
    expect(html).toContain('Total');
    expect(html).toContain('Volume');
    expect(html).toContain('Exportar CSV');
  });
});
