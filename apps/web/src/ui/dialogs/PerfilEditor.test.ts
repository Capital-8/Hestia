import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { FORMAS_DE_PERFIL, PERFIS_CATALOGO, type PerfilForma } from '@hestia/model';
import { PerfilEditor } from './PerfilEditor.tsx';
import { PerfilPreview } from './PerfilPreview.tsx';
import { definirPerfilContorno, perfilContorno } from './perfilContorno.ts';
import { PARAMETROS_DA_FORMA, perfilParaForma } from './perfilForm.ts';

const noop = (): void => {};
const editor = (perfil: PerfilForma, formas?: readonly PerfilForma['forma'][]): string => renderToStaticMarkup(createElement(PerfilEditor, { perfil, onChange: noop, idBase: 'pf', ...(formas ? { formas } : {}) }));
const preview = (perfil: PerfilForma): string => renderToStaticMarkup(createElement(PerfilPreview, { perfil }));
const base: PerfilForma = { forma: 'retangular', b: 0.22, h: 0.41 };

afterEach(() => definirPerfilContorno());

describe('PerfilEditor: seletor de forma', () => {
  it('oferece as 9 formas por padrão e marca a atual', () => {
    const html = editor(base);
    const select = html.slice(html.indexOf('id="pf-forma"'), html.indexOf('</select>', html.indexOf('id="pf-forma"')));
    for (const forma of FORMAS_DE_PERFIL) expect(select, forma).toContain(`value="${forma}"`);
    expect(select.match(/<option/g)).toHaveLength(9);
    expect(select).toMatch(/<option value="retangular" selected/);
  });

  it('`formas` restringe as opções (base de estaca: só circular e tubo circular)', () => {
    const html = editor({ forma: 'circular', d: 0.4 }, ['circular', 'tuboCircular']);
    const select = html.slice(html.indexOf('id="pf-forma"'), html.indexOf('</select>', html.indexOf('id="pf-forma"')));
    expect(select.match(/<option/g)).toHaveLength(2);
    expect(select).not.toContain('value="retangular"');
  });
});

describe('PerfilEditor: campos conforme a forma', () => {
  it('cada forma mostra exatamente os parâmetros que pede, sem os dos outros', () => {
    for (const forma of FORMAS_DE_PERFIL) {
      const html = editor(perfilParaForma(base, forma));
      for (const nome of ['b', 'h', 'd', 'tf', 'tw', 't'] as const) {
        const pede = PARAMETROS_DA_FORMA[forma].includes(nome);
        expect(html.includes(`id="pf-${nome}"`), `${forma}: campo ${nome}`).toBe(pede);
      }
      expect(html.includes('id="pf-anel"'), `${forma}: vértices`).toBe(forma === 'personalizado');
    }
  });

  it('trocar de forma completa campos com valores válidos (sem aviso de perfil inválido)', () => {
    for (const de of FORMAS_DE_PERFIL) {
      for (const para of FORMAS_DE_PERFIL) {
        expect(editor(perfilParaForma(perfilParaForma(base, de), para)), `${de} -> ${para}`).not.toContain('role="alert"');
      }
    }
  });

  it('perfil inválido mostra a mensagem do modelo', () => {
    expect(editor({ forma: 'I', b: 0.1, h: 0.2, tf: 0.15, tw: 0.005 })).toContain('role="alert"');
  });

  it('o personalizado mostra os vértices do contorno e os furos em texto', () => {
    const html = editor({ forma: 'personalizado', anel: [[0, 0], [1, 0], [0, 1]] });
    expect(html).toContain('id="pf-furos"');
    expect(html).toContain('0; 0\n1; 0\n0; 1');
  });
});

describe('PerfilEditor: presets do catálogo', () => {
  it('lista os presets por família (concreto, madeira, aço) e seleciona o que bate com o perfil', () => {
    const preset = PERFIS_CATALOGO.find((p) => p.id === 'aco_ipe200')!;
    const html = editor(preset.perfil);
    expect(html).toContain('id="pf-preset"');
    expect(html.match(/<optgroup/g)).toHaveLength(3);
    expect(html).toMatch(/<option value="aco_ipe200" selected[^>]*>IPE 200/);
    expect(html).toContain('>15 × 30<');
  });

  it('perfil que não é do catálogo fica em "Personalizado"', () => {
    expect(editor(base)).toMatch(/<option value="" selected[^>]*>Personalizado/);
  });

  it('só oferece presets das formas permitidas', () => {
    const html = editor({ forma: 'circular', d: 0.3 }, ['circular', 'tuboCircular']);
    expect(html).toContain('Ø 30');
    expect(html).not.toContain('IPE 200');
    expect(html).not.toContain('>15 × 30<');
  });
});

describe('PerfilPreview: o contorno vem do kernel (injetável)', () => {
  it('sem kernel mostra "pré-visualização indisponível" (o padrão devolve null)', () => {
    expect(perfilContorno(base)).toBeNull();
    expect(preview(base)).toContain('pré-visualização indisponível');
    expect(editor(base)).toContain('pré-visualização indisponível');
  });

  it('com a consulta ligada desenha o contorno recebido, com os furos vazados', () => {
    const chamadas: PerfilForma[] = [];
    definirPerfilContorno((p) => {
      chamadas.push(p);
      return { anel: [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]], furos: [[[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]]] };
    });
    const html = preview(base);
    expect(chamadas).toEqual([base]);
    expect(html).toContain('<svg');
    expect(html).toContain('fill-rule="evenodd"');
    expect(/ d="([^"]*)"/.exec(html)![1]!.match(/M/g)).toHaveLength(2);
    expect(html).not.toContain('indisponível');
  });

  it('contorno degenerado devolvido pelo kernel volta ao texto de indisponível', () => {
    definirPerfilContorno(() => ({ anel: [[0, 0]], furos: [] }));
    expect(preview(base)).toContain('indisponível');
  });
});
