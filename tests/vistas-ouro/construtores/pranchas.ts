import { floorViewId, type Command, type Project, type Sheet, type SheetViewport } from '@hestia/model';

/** Prancha A1 paisagem (841 x 594 mm, margem 10) sem vistas; as vistas entram por `addViewport`. */
const prancha = (id: string, number: string, name: string): Sheet => ({
  id,
  number,
  name,
  size: 'A1',
  orientation: 'landscape',
  margin: 10,
  titleBlock: { project: 'Projeto do ouro', client: 'Cliente', author: 'Autor', date: '2026-01-01', revision: 'A' },
  viewports: [],
});

const vista = (id: string, view: SheetViewport['view'], x: number, y: number, w: number, h: number, scale: number, extra: Partial<SheetViewport> = {}): SheetViewport => ({ id, view, at: { x, y }, size: { w, h }, scale, ...extra });

/** Duas pranchas: plantas de piso e de área (A-01); corte, 3D e quadro de áreas (A-02). */
export function pranchas(p: Project): Command[] {
  const corte = p.views.find((v) => v.kind === 'section')?.id;
  const add = (sheetId: string, viewport: SheetViewport): Command => ({ type: 'addViewport', sheetId, viewport });
  return [
    { type: 'addSheet', sheet: prancha('sh_plantas', 'A-01', 'Plantas') },
    add('sh_plantas', vista('vp_t', { kind: 'plan', viewId: floorViewId('lv_0') }, 20, 30, 260, 260, 100, { title: 'Térreo' })),
    add('sh_plantas', vista('vp_p2', { kind: 'plan', viewId: floorViewId('lv_1') }, 300, 30, 260, 260, 100, { title: 'Pavimento 2', offset: { x: 5, y: -3 } })),
    add('sh_plantas', vista('vp_area', { kind: 'plan', viewId: 'ap_prancha' }, 580, 30, 240, 260, 100, { title: 'Áreas', label: { scaleBar: true } })),
    { type: 'addSheet', sheet: prancha('sh_cortes', 'A-02', 'Corte, 3D e áreas') },
    ...(corte ? [add('sh_cortes', vista('vp_corte', { kind: 'section', sectionId: corte }, 20, 30, 300, 240, 100, { title: 'Corte' }))] : []),
    add('sh_cortes', vista('vp_3d', { kind: '3d' }, 340, 30, 260, 240, 200, { title: 'Perspectiva' })),
    add('sh_cortes', vista('vp_quadro', { kind: 'areaTable' }, 620, 30, 200, 240, 100)),
  ];
}
