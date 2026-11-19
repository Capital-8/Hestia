import { describe, expect, it } from 'vitest';
import { PAINT_BUCKET_CURSOR, cursorForView } from './cursor.ts';

describe('cursor único das vistas (planta, corte e 3D)', () => {
  it('Selecionar é a seta do sistema nas três vistas (sem pointer de hover)', () => {
    for (const view of ['plan', 'section', '3d'] as const) {
      expect(cursorForView({ view, tool: 'select', drag: 'none' }), view).toBe('default');
      expect(cursorForView({ view, tool: 'select', drag: 'tool', moved: true }), view).toBe('default');
    }
  });

  it('texto e mover mantêm o cursor próprio em qualquer vista; as demais ferramentas usam a mira', () => {
    for (const view of ['plan', 'section', '3d'] as const) {
      expect(cursorForView({ view, tool: 'text', drag: 'none' }), view).toBe('text');
      expect(cursorForView({ view, tool: 'move', drag: 'none' }), view).toBe('move');
      expect(cursorForView({ view, tool: 'measure', drag: 'none' }), view).toBe('crosshair');
      expect(cursorForView({ view, tool: 'wall', drag: 'none' }), view).toBe('crosshair');
    }
  });

  it('pan: mão aberta ao iniciar e fechada ao arrastar; a órbita do 3D já é grabbing', () => {
    expect(cursorForView({ view: 'plan', tool: 'select', drag: 'pan', moved: false })).toBe('grab');
    expect(cursorForView({ view: 'section', tool: 'select', drag: 'pan', moved: true })).toBe('grabbing');
    expect(cursorForView({ view: '3d', tool: 'select', drag: 'orbit', moved: false })).toBe('grabbing');
    expect(cursorForView({ view: '3d', tool: 'select', drag: 'orbit', moved: true })).toBe('grabbing');
  });

  it('alças do corte pedem o eixo do redimensionamento e vencem a ferramenta/navegação', () => {
    expect(cursorForView({ view: 'section', tool: 'select', drag: 'none', handle: 'vertical' })).toBe('ns-resize');
    expect(cursorForView({ view: 'section', tool: 'select', drag: 'none', handle: 'horizontal' })).toBe('ew-resize');
    expect(cursorForView({ view: 'section', tool: 'text', drag: 'pan', moved: true, handle: 'vertical' })).toBe('ns-resize');
  });

  it('fora de pan/orbit e sem alça a mão não aparece (vazio/seleção = seta)', () => {
    expect(cursorForView({ view: '3d', tool: 'select' })).toBe('default');
    expect(cursorForView({ view: 'plan', tool: 'select', drag: 'none', handle: null })).toBe('default');
  });

  it('pintura direta de faces no 3D usa balde de tinta ou mira, mas pan/orbit continuam vencendo', () => {
    expect(cursorForView({ view: '3d', tool: 'select', drag: 'none', facePaintMode: 'paint' })).toBe(PAINT_BUCKET_CURSOR);
    expect(cursorForView({ view: '3d', tool: 'select', drag: 'none', facePaintMode: 'studioPick' })).toBe('crosshair');
    expect(cursorForView({ view: '3d', tool: 'select', drag: 'orbit', moved: true, facePaintMode: 'paint' })).toBe('grabbing');
    expect(cursorForView({ view: '3d', tool: 'select', drag: 'pan', moved: false, facePaintMode: 'paint' })).toBe('grab');
    expect(cursorForView({ view: '3d', tool: 'select', drag: 'pan', moved: true, facePaintMode: 'studioPick' })).toBe('grabbing');
  });
});
