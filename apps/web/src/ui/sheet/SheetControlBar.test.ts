import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptyTitleBlock, floorViewId, type Sheet, type SheetViewport, type View3DPoint } from '@hestia/model';
import { SheetControlBar, type SheetControlBarProps } from './SheetControlBar.tsx';

/** Câmera de exemplo dos pontos de vista 3D do projeto. */
const CAMERA3D = { azimuth: 0, elevation: 0.6, distance: 12, target: { x: 0, y: 0, z: 0 }, ortho: true };

const PAPEL: Sheet = { id: 'sh1', number: 'A-101', name: 'Arquitetura', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports: [] };

const PONTOS: View3DPoint[] = [
  { id: 'v3d_norte', name: 'Fachada norte', camera: CAMERA3D },
  { id: 'v3d_leste', name: 'Fachada leste', camera: { ...CAMERA3D, azimuth: 1.2 } },
];

const noop = (): void => undefined;

/** Vista na prancha com a fonte dada (a caixa e a escala não importam para a barra). */
const vista = (view: SheetViewport['view']): SheetViewport => ({ id: 'v1', view, at: { x: 20, y: 20 }, size: { w: 180, h: 130 }, scale: 100 });

function render(selected: readonly SheetViewport[]): string {
  const props: SheetControlBarProps = {
    sheet: PAPEL,
    camera: { cx: 210, cy: 148.5, zoom: 1 },
    view: { w: 900, h: 600 },
    selected,
    grid: false,
    snap: true,
    fitScale: true,
    alignOn: false,
    onToggleAlign: noop,
    moveOn: false,
    onToggleMove: noop,
    onZoom: noop,
    onFit: noop,
    onActualSize: noop,
    onZoomToSelection: noop,
    onToggleGrid: noop,
    onToggleSnap: noop,
    onToggleFitScale: noop,
    onScale: noop,
    onToggleClip: noop,
    onToggleFrame: noop,
    onToggleLabel: noop,
    onToggleLock: noop,
    onFitFrame: noop,
    onAlign: noop,
    onDistribute: noop,
    onAddView: noop,
    onProps: noop,
    view3DPoints: PONTOS,
    onChange3DPoint: noop,
  };
  return renderToStaticMarkup(createElement(SheetControlBar, props));
}

/** Botão "Trocar" do ponto de vista 3D (pelo aria-label, que é o título). */
const trocarButton = (html: string): string => html.match(/<button[^>]*aria-label="Trocar o ponto de vista 3D da vista"[^>]*>/)?.[0] ?? '';

describe('barra da prancha: ponto de vista 3D', () => {
  it('vista 3D com ponto salvo mostra o campo Ponto, as opções e o ponto atual marcado', () => {
    const html = render([vista({ kind: '3d', pointId: 'v3d_leste' })]);
    expect(html).toContain('aria-label="Ponto de vista 3D"');
    expect(html).toContain('>Ponto<');
    expect(html).toContain('>Enquadramento padrão<');
    expect(html).toContain('>Fachada norte<');
    expect(html).toContain('>Fachada leste<');
    expect(html).toMatch(/<option value="v3d_leste"[^>]*selected/);
    expect(trocarButton(html)).toContain('Trocar');
    // Sem mudança no seletor, "Trocar" fica desativado.
    expect(trocarButton(html)).toContain('disabled');
  });

  it('vista 3D no enquadramento padrão deixa a opção vazia marcada', () => {
    const html = render([vista({ kind: '3d' })]);
    expect(html).toMatch(/<option value=""[^>]*selected/);
    expect(trocarButton(html)).toContain('disabled');
  });

  it('vista que não é 3D não mostra o campo Ponto', () => {
    const html = render([vista({ kind: 'plan', viewId: floorViewId('lv_0') })]);
    expect(html).not.toContain('Ponto de vista 3D');
    expect(html).not.toContain('>Ponto<');
    expect(trocarButton(html)).toBe('');
  });
});
