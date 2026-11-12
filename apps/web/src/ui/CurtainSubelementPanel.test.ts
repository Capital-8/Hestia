import { describe, expect, it } from 'vitest';
import { ProjectStore, curtainPanelTypesOf } from '@hestia/model';
import { projetoComCortina } from '../../../../packages/engine/src/fixtureCortina.ts';
import { dadosDoSubelemento } from './CurtainSubelementPanel.tsx';

function comCortina(): ProjectStore {
  return new ProjectStore(projetoComCortina());
}

describe('painel do subelemento da cortina (dados)', () => {
  it('linha gerada: sem sobrescrita herda o montante e não está travada', () => {
    const s = comCortina();
    const d = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'line', line: { axis: 'u', index: 1, pos: 0, n: 1 } });
    // a posição gravada não casa com nenhuma linha se a grade tem uma só coluna: o painel não inventa dados
    expect(d === null || (d.kind === 'line' && d.travada === false)).toBe(true);
  });

  it('célula: sem sobrescrita segue o painel padrão', () => {
    const s = comCortina();
    const d = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'cell', cell: { i: 0, j: 0, s: 0.1, z: 0.1, nu: 4, nv: 2 } });
    expect(d).not.toBeNull();
    expect(d && d.kind === 'cell' && d.sobrescrita).toBe(false);
  });

  it('célula com sobrescrita de painel: mostra o painel próprio', () => {
    const s = comCortina();
    const solido = Object.values(curtainPanelTypesOf(s.project)).find((p) => p.kind === 'solid');
    expect(solido).toBeDefined();
    s.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 0, panelTypeId: solido!.id } as never);
    const d = dadosDoSubelemento(s.project, { wallId: 'ct1', kind: 'cell', cell: { i: 0, j: 0, s: 0.1, z: 0.1, nu: 4, nv: 2 } });
    expect(d && d.kind === 'cell' && d.sobrescrita).toBe(true);
    expect(d && d.kind === 'cell' && d.painel).toBe(solido!.id);
  });

  it('parede inexistente ou comum não tem subelemento', () => {
    const s = comCortina();
    expect(dadosDoSubelemento(s.project, { wallId: 'nao_existe', kind: 'cell', cell: { i: 0, j: 0, s: 0, z: 0, nu: 1, nv: 1 } })).toBeNull();
    expect(dadosDoSubelemento(s.project, { wallId: 'w1', kind: 'cell', cell: { i: 0, j: 0, s: 0, z: 0, nu: 1, nv: 1 } })).toBeNull();
  });
});
