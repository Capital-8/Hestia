import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPENING_TYPES, openingFamilies, type OpeningType } from '@hestia/model';
import { openingChecks } from '@hestia/engine';
import { editor } from '../../../editor/controller.ts';
import { familyOptionsFor, leavesChoicesFor, openingVariants } from '../openingTypeForm.ts';
import { OpeningTypeDialog } from './OpeningTypeDialog.tsx';
import { OpeningTypeHeader } from './OpeningTypeHeader.tsx';
import { OpeningTypeLibrary } from './OpeningTypeLibrary.tsx';
import { OpeningTypePreview } from './OpeningTypePreview.tsx';
import { OpeningTypeSections } from './OpeningTypeSections.tsx';
import type { OpeningComponentId } from './components.ts';

// O diálogo lê o projeto pelo controlador; no teste de render, um projeto vazio em memória basta (sem DOM).
vi.mock('../../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

const tipo = (id: string): OpeningType => DEFAULT_OPENING_TYPES.find((t) => t.id === id)!;
const vazio = (): void => {};

afterEach(() => {
  editor.store.exec({ type: 'setSettings', patch: { units: undefined } });
});

describe('diálogo do tipo de abertura (render)', () => {
  it('renderiza o diálogo completo com biblioteca, lista de componentes e verificações', () => {
    const d = tipo('ot_p90');
    editor.store.exec({ type: 'upsertOpeningType', openingType: { ...d, id: 'ot_smoke', name: 'Porta de teste' } });
    const html = renderToStaticMarkup(createElement(OpeningTypeDialog, { typeId: 'ot_smoke' }));
    expect(html).toContain('Propriedades do tipo');
    expect(html).toContain('Porta de teste');
    expect(html).toContain('Biblioteca');
    // Porta de giro: treze componentes visíveis (sem os de janela; com Forma do vão, Módulos, Perfis, Alizar e Vidro); a Visão geral aberta traz o nome.
    expect((html.match(/class="op-nav-item/g) ?? []).length).toBe(13);
    expect(html).toContain('id="ot-name"');
    expect(html).toContain('Verificações');
    expect(html).toContain('Inverter dobradiça');
    expect(html).toContain('+ Novo tipo');
    expect(html).toContain('Aplicar');
  });

  it('as verificações de abertura seguem as unidades do projeto', () => {
    editor.store.exec({ type: 'upsertOpeningType', openingType: { ...tipo('ot_p90'), id: 'ot_unid' } });
    editor.store.exec({ type: 'setSettings', patch: { units: { length: { unit: 'cm', decimals: 1 } } } });
    const html = renderToStaticMarkup(createElement(OpeningTypeDialog, { typeId: 'ot_unid' }));
    expect(html).toContain('Largura livre 80,0 cm');
  });

  it('lista os componentes da porta de giro e mostra o painel do escolhido', () => {
    const d = tipo('ot_p90');
    const family = openingFamilies('door').find((f) => f.id === 'door_swing')!;
    const render = (active: OpeningComponentId): string =>
      renderToStaticMarkup(
        createElement(OpeningTypeSections, { d, onChange: vazio, family, leaves: leavesChoicesFor(family), materials: {}, active }),
      );
    const html = render('overview');
    for (const nome of ['Visão geral', 'Batente', 'Folha', 'Lado externo', 'Lado interno', 'Parede e vão', 'Planta e corte', 'Quadro e dados']) {
      expect(html).toContain(nome);
    }
    // Componentes de janela não aparecem na lista da porta.
    expect(html).not.toContain('Folhas e divisões');
    expect(html).not.toContain('Caixilho e vidro');
    expect(html).toContain('id="ot-name"');
    expect(html).toContain('aria-current="true"');
    expect(render('data')).toContain('Resistência ao fogo');
    expect(render('data')).not.toContain('Fator solar');
    // Estilo da folha (5) e maçaneta (4): cada escolha mostra a elevação em miniatura pelo mesmo caminho.
    expect((render('leaf').match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });

  it('a biblioteca lista as famílias de porta com a contagem e as variantes', () => {
    const html = renderToStaticMarkup(
      createElement(OpeningTypeLibrary, {
        type: tipo('ot_p90'),
        families: openingFamilies('door'),
        familyId: 'door_swing',
        counts: { door_swing: 2, door_double: 1 },
        variants: openingVariants('door'),
        open: true,
        onToggle: vazio,
        onFamily: vazio,
        onVariant: vazio,
      }),
    );
    expect(html).toContain('Porta de giro');
    expect(html).toContain('Porta dupla');
    expect(html).toContain('Porta de correr');
    expect(html).toContain('>2<');
    expect(html).toContain('Lisa');
    expect(html).toContain('class="th"');
    expect(html).toContain('<svg');
    expect(html).toContain('data-op="stroke"');
  });

  it('a prévia habilita as cinco abas e mostra a faixa de verificações', () => {
    const d = tipo('ot_p90');
    const checks = openingChecks(d, 0.14);
    const html = renderToStaticMarkup(
      createElement(OpeningTypePreview, {
        d,
        tab: 'elevation',
        onTab: vazio,
        flipHand: false,
        flipFacing: false,
        onFlipHand: vazio,
        onFlipFacing: vazio,
        angle: 90,
        onAngle: vazio,
        checks,
      }),
    );
    expect(html).toContain('Planta');
    expect(html).toContain('Elevação');
    expect(html).toContain('Corte');
    expect(html).toContain('3D linhas');
    expect(html).toContain('3D sombreado');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Verificações');
    expect(html).toContain('Largura livre 0,80 m');
    expect(html).toContain('Altura livre 2,05 m');
    expect(html).toContain('Verga ausente');
    expect(html).toContain('Inverter dobradiça');
    expect(html).toContain('Inverter sentido');
  });

  it('sem WebGL (render em string), o 3D avisa e as outras abas continuam disponíveis', () => {
    const d = tipo('ot_p90');
    const html = renderToStaticMarkup(
      createElement(OpeningTypePreview, {
        d,
        tab: 'lines3d',
        onTab: vazio,
        flipHand: false,
        flipFacing: false,
        onFlipHand: vazio,
        onFlipFacing: vazio,
        angle: 90,
        onAngle: vazio,
        checks: [],
      }),
    );
    expect(html).toContain('3D indisponível neste navegador');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Planta');
    expect(html).toContain('Corte');
  });

  it('o cabeçalho oferece família, tipo, duplicar, renomear e favorito', () => {
    const html = renderToStaticMarkup(
      createElement(OpeningTypeHeader, {
        families: openingFamilies('door'),
        familyId: 'door_swing',
        types: [{ id: 'ot_p90', name: 'Porta 90 x 210' }],
        currentId: 'ot_p90',
        nameFieldId: 'ot-name',
        favorite: true,
        onFamily: vazio,
        onType: vazio,
        onDuplicate: vazio,
        onFavorite: vazio,
      }),
    );
    expect(html).toContain('Família:');
    expect(html).toContain('Tipo:');
    expect(html).toContain('Duplicar…');
    expect(html).toContain('Renomear…');
    expect(html).toContain('★');
    expect(html).toContain('Porta de giro');
  });

  it('o seletor de maçaneta mostra o valor efetivo: lever no ot_p90 e none quando o tipo grava none', () => {
    const family = openingFamilies('door').find((f) => f.id === 'door_swing')!;
    const render = (d: OpeningType, active: OpeningComponentId): string =>
      renderToStaticMarkup(
        createElement(OpeningTypeSections, {
          d,
          onChange: vazio,
          family,
          leaves: leavesChoicesFor(family),
          materials: {},
          active,
        }),
      );
    const selectedValue = (html: string, id: string): string | null => {
      const start = html.indexOf(`id="${id}"`);
      const end = html.indexOf('</select>', start);
      const select = html.slice(start, end);
      const tag = select.split('<option').find((t) => t.includes('selected')) ?? '';
      return /value="([^"]+)"/.exec(tag)?.[1] ?? null;
    };
    const padrao = tipo('ot_p90');
    expect(padrao.handle).toBeUndefined();
    expect(selectedValue(render(padrao, 'leaf'), 'op-handle')).toBe('lever');
    expect(selectedValue(render({ ...padrao, handle: 'none' }, 'leaf'), 'op-handle')).toBe('none');
    // O estilo da folha, o batente e os detalhes também mostram o efetivo (não o campo vazio).
    expect(selectedValue(render(padrao, 'leaf'), 'op-leaf')).toBe('flush');
    expect(selectedValue(render(padrao, 'frame'), 'op-frame')).toBe('rebate');
    expect(selectedValue(render(padrao, 'plan'), 'op-d2')).toBe('scale');
    expect(selectedValue(render(padrao, 'plan'), 'op-d3')).toBe('view');
  });

  it('os acabamentos de alizar e soleira marcam a caixa só quando a peça existe de fato', () => {
    const family = openingFamilies('window').find((f) => f.id === 'window_sliding')!;
    const render = (d: OpeningType): string =>
      renderToStaticMarkup(
        createElement(OpeningTypeSections, {
          d,
          onChange: vazio,
          family,
          leaves: leavesChoicesFor(family),
          materials: {},
          active: 'outer',
        }),
      );
    const marcada = (html: string, id: string): boolean => {
      const idPos = html.indexOf(`id="${id}"`);
      const tag = html.slice(html.lastIndexOf('<input', idPos), html.indexOf('>', idPos));
      return tag.includes('checked');
    };
    const janela = tipo('ot_j120');
    const semAcabamento = render(janela);
    expect(marcada(semAcabamento, 'ot-ac-al')).toBe(false);
    expect(marcada(semAcabamento, 'ot-ac-sb')).toBe(false);
    const comAcabamento = render({
      ...janela,
      casing: { width: 0.05, thickness: 0.015 },
      sillBoard: { projection: 0.03, thickness: 0.03 },
    });
    expect(marcada(comAcabamento, 'ot-ac-al')).toBe(true);
    expect(marcada(comAcabamento, 'ot-ac-sb')).toBe(true);
    // Medida zerada equivale a não desenhar a peça (`openingCasing`/`openingSillBoard` devolvem null).
    const zerado = render({ ...janela, casing: { width: 0, thickness: 0.015 }, sillBoard: { projection: 0, thickness: 0.03 } });
    expect(marcada(zerado, 'ot-ac-al')).toBe(false);
    expect(marcada(zerado, 'ot-ac-sb')).toBe(false);
  });

  it('o seletor de famílias do formulário só traz as portas', () => {
    expect(familyOptionsFor('door').map((f) => f.name)).toEqual([
      'Porta de giro',
      'Porta dupla',
      'Porta de correr',
      'Porta pivotante',
      'Porta vai-e-vem',
      'Porta de embutir',
      'Porta dobrável',
      'Porta sanfonada',
      'Portão seccionado',
      'Vão livre',
    ]);
  });
});
