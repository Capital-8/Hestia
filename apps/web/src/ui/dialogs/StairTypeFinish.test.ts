import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_STAIR_TYPES, type StairRunStyle, type StairType } from '@hestia/model';
import { StairTypeSections } from './StairTypeSections.tsx';

const noop = (): void => {};
const tipo = (over: Partial<StairType> = {}): StairType => ({ ...structuredClone(DEFAULT_STAIR_TYPES[0]!), ...over });

function html(draft: StairType): string {
  return renderToStaticMarkup(
    createElement(StairTypeSections, {
      draft,
      set: noop,
      onStyle: noop,
      materials: {},
      issues: [],
      canGoProps: false,
      onGoProps: noop,
    }),
  );
}

/** Trecho HTML de um elemento pelo id (até o próximo fechamento da tag de abertura). */
function tagOf(markup: string, id: string): string {
  const i = markup.indexOf(`id="${id}"`);
  if (i < 0) return '';
  const start = markup.lastIndexOf('<', i);
  return markup.slice(start, markup.indexOf('>', i) + 1);
}

describe('acabamentos do tipo de escada (seção do modal)', () => {
  it('monolítico mostra piso, espelho e bocel, com a espessura em cm', () => {
    const m = html(tipo({ runStyle: 'monolithic', treadFinishEnabled: true, treadFinishThickness: 0.02, riserFinishEnabled: false, riserFinishThickness: 0.01 }));
    expect(m).toContain('id="stt-sec-finish"');
    expect(tagOf(m, 'stt-treadFinishEnabled')).toContain('checked=""');
    expect(tagOf(m, 'stt-treadFinishThickness')).toContain('value="2,0"');
    expect(tagOf(m, 'stt-riserFinishEnabled')).not.toContain('checked=""');
    expect(tagOf(m, 'stt-riserFinishThickness')).toContain('value="1,0"');
    expect(tagOf(m, 'stt-bocelProjection')).toContain('value="1,5"');
    expect(m).toContain('id="stt-treadFinishMaterialId"');
  });

  it('montado esconde a seção inteira', () => {
    const m = html(tipo({ runStyle: 'assembled' }));
    expect(m).not.toContain('stt-sec-finish');
    expect(m).not.toContain('stt-treadFinishEnabled');
  });

  it('poste mostra só o piso (sem espelho)', () => {
    const m = html(tipo({ runStyle: 'post', treadFinishEnabled: true }));
    expect(m).toContain('id="stt-treadFinishEnabled"');
    expect(m).toContain('id="stt-bocelEnabled"');
    expect(m).not.toContain('stt-riserFinishEnabled');
    expect(m).not.toContain('stt-riserFinishThickness');
  });

  it('bocel esmaecido e desabilitado quando o piso acabado está desligado, com dica', () => {
    const off = html(tipo({ runStyle: 'monolithic', treadFinishEnabled: false }));
    expect(tagOf(off, 'stt-bocelEnabled')).toContain('disabled=""');
    expect(tagOf(off, 'stt-bocelProjection')).toContain('disabled=""');
    expect(off).toContain('Requer o acabamento do piso ligado.');

    const on = html(tipo({ runStyle: 'monolithic', treadFinishEnabled: true, bocelEnabled: true }));
    expect(tagOf(on, 'stt-bocelEnabled')).not.toContain('disabled=""');
    expect(tagOf(on, 'stt-bocelProjection')).not.toContain('disabled=""');
    expect(on).not.toContain('Requer o acabamento do piso ligado.');
  });

  it('o estilo do tipo aceito pelo modal continua com as seções de sempre', () => {
    const styles: StairRunStyle[] = ['monolithic', 'assembled', 'post'];
    for (const s of styles) expect(html(tipo({ runStyle: s }))).toContain('id="stt-sec-4"');
  });
});
