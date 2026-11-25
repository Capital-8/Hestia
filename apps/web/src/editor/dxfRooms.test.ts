import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeRoom, makeWall, type Project } from '@hestia/model';
import { planDxf } from './dxfExport.ts';

/** Projeto com quatro paredes de um retângulo 6 × 4 no térreo; `room` opcional (ponto interior). */
function sala(withRoom = true): Project {
  const s = new ProjectStore(createEmptyProject());
  const c = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
  c.forEach((a, i) => s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b: c[(i + 1) % 4]! }) }));
  if (withRoom) s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 3, y: 2 } }) });
  return s.project;
}

/** Nome de camada como aparece no DXF (código de grupo 8 seguido do nome). */
const onLayer = (dxf: string, layer: string): boolean => new RegExp(`\\s8\\s*\\r?\\n${layer}\\r?\\n`).test(dxf);

describe('ambientes no DXF da planta (decisão 0018/0037, camadas AMBIENTES e AMBIENTES_TEXTO)', () => {
  it('contorno fechado na camada AMBIENTES e o rótulo completo na AMBIENTES_TEXTO', () => {
    const dxf = planDxf(sala(), 'lv_0');
    expect(onLayer(dxf, 'AMBIENTES')).toBe(true);
    expect(onLayer(dxf, 'AMBIENTES_TEXTO')).toBe(true);
    expect(dxf).toContain('Sala (101)');
    // O DXF é R12 estrito: "·" e "²" saem como escapes \U+XXXX (o AutoCAD não lê UTF-8 cru). Área com vírgula.
    expect(dxf).toMatch(/Sala \(101\) \\U\+00B7 \d+,\d\d m\\U\+00B2/);
  });

  it('categoria "ambiente" oculta na vista: nada sai', () => {
    const p = sala();
    const s = new ProjectStore(p);
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { room: { visible: false } } } });
    const dxf = planDxf(s.project, 'lv_0');
    expect(onLayer(dxf, 'AMBIENTES')).toBe(false);
    expect(onLayer(dxf, 'AMBIENTES_TEXTO')).toBe(false);
  });

  it('sem ambiente, nenhuma das camadas tem entidade', () => {
    const dxf = planDxf(sala(false), 'lv_0');
    expect(onLayer(dxf, 'AMBIENTES')).toBe(false);
    expect(onLayer(dxf, 'AMBIENTES_TEXTO')).toBe(false);
  });

  it('labelFields manda no texto do DXF, igual à tela (sem campos, o rótulo clássico)', () => {
    const classico = planDxf(sala(), 'lv_0');
    expect(classico).toContain('Sala (101)');
    const s = new ProjectStore(sala());
    s.exec({ type: 'setRoomLabel', id: 'r1', position: null, fields: ['name', 'number'] });
    const dxf = planDxf(s.project, 'lv_0');
    expect(dxf).not.toContain('Sala (101)');
    expect(dxf).toMatch(/Sala \\U\+00B7 101/);
  });
});
