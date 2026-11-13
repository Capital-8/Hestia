import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PERFIS_CATALOGO } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { BeamTypeDialog } from './BeamTypeDialog.tsx';
import { ColumnTypeDialog } from './ColumnTypeDialog.tsx';
import { FootingTypeDialog } from './FootingTypeDialog.tsx';

// useProject usa useSyncExternalStore (sem snapshot de servidor): no teste ele lê o projeto direto.
vi.mock('../../editor/controller.ts', async () => {
  const actual = await vi.importActual<typeof import('../../editor/controller.ts')>('../../editor/controller.ts');
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

void editor;
const coluna = (id: string): string => renderToStaticMarkup(createElement(ColumnTypeDialog, { typeId: id }));
const viga = (id: string): string => renderToStaticMarkup(createElement(BeamTypeDialog, { typeId: id }));
const fundacao = (id: string): string => renderToStaticMarkup(createElement(FootingTypeDialog, { typeId: id }));

/** Corpo do modal (a partir do formulário): o cabeçalho do `Dialog` comum tem estilo próprio, que não é do esqueleto de tipo. */
const corpo = (html: string): string => html.slice(html.indexOf('class="fam-form"'));

/** Títulos das seções (`fam-sec-title`) na ordem em que aparecem. */
const secoes = (html: string): string[] => [...html.matchAll(/<span class="fam-sec-title">([^<]*)<\/span>|<legend>([^<]*)<\/legend>/g)].map((m) => m[1] ?? m[2] ?? '');

describe('modal de tipo de pilar (as duas disciplinas)', () => {
  it('estrutural: esqueleto comum (cabeçalho Família/Tipo, Nome do tipo, rodapé) e seções Perfil, Material e Identidade, sem Camadas', () => {
    const html = coluna('pil_est_25x25');
    expect(html).toContain('class="fam-form"');
    expect(html).toContain('class="tdlg-bar type-head"');
    expect(html).toMatch(/<div class="fam-row"><div class="field-row"><label for="pil-t-name">/);
    expect(html).toContain('Pilar estrutural');
    expect(secoes(html)).toEqual(['Perfil', 'Material', 'Identidade']);
    expect(corpo(html)).not.toContain('style=');
    expect(html).not.toContain('Adicionar camada');
  });

  it('arquitetônico: tem a seção Camadas (a ordem é Perfil, Material, Camadas, Identidade)', () => {
    const html = coluna('pil_arq_20x20');
    expect(html).toContain('Pilar arquitetônico');
    expect(secoes(html)).toEqual(['Perfil', 'Material', 'Camadas', 'Identidade']);
    expect(html).toContain('Adicionar camada');
  });

  it('traz o seletor de forma com as 9 formas, o preset do catálogo e a prévia (indisponível até o kernel ligar)', () => {
    const html = coluna('pil_est_25x25');
    const select = html.slice(html.indexOf('id="pil-t-perfil-forma"'), html.indexOf('</select>', html.indexOf('id="pil-t-perfil-forma"')));
    expect(select.match(/<option/g)).toHaveLength(9);
    expect(html).toContain('id="pil-t-perfil-preset"');
    expect(html).toMatch(/<option value="conc_25x25" selected/);
    expect(html).toContain('pré-visualização indisponível');
    expect(html).toContain('class="fam-split"');
  });

  it('identidade e material: código, descrição, custo, hachura e disciplina', () => {
    const html = coluna('pil_arq_20x20');
    for (const id of ['pil-t-code', 'pil-t-desc', 'pil-t-cost', 'pil-t-hatch', 'pil-t-mat', 'pil-t-disc']) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('PA-20x20');
  });

  it('tipo inexistente não renderiza nada', () => {
    expect(coluna('nao_existe')).toBe('');
  });
});

describe('modal de tipo de viga', () => {
  it('seções Perfil, Material e Identidade no esqueleto comum, com preset e as 9 formas', () => {
    const html = viga('vig_15x40');
    expect(html).toContain('class="fam-form"');
    expect(secoes(html)).toEqual(['Perfil', 'Material', 'Identidade']);
    expect(html).toContain('Viga');
    expect(html).toMatch(/<option value="conc_15x30">/);
    expect(html).toContain('id="vig-t-perfil-forma"');
    expect(corpo(html)).not.toContain('style=');
  });
});

describe('modal de tipo de fundação', () => {
  it('sapata isolada com pescoço: seções Fundação, Base, Pescoço, Material e Identidade', () => {
    const html = fundacao('sap_80x80x30');
    expect(html).toContain('class="fam-form"');
    expect(secoes(html)).toEqual(['Fundação', 'Base', 'Pescoço', 'Material', 'Identidade']);
    for (const id of ['fun-t-modo', 'fun-t-forma', 'fun-t-hb', 'fun-t-pescoco', 'fun-t-hp', 'fun-t-base-forma', 'fun-t-pescoco-perfil-forma']) expect(html, id).toContain(`id="${id}"`);
    expect(corpo(html)).not.toContain('style=');
  });

  it('baldrame (corrida): base só retangular, sem opção de pescoço e a forma travada em sapata', () => {
    const html = fundacao('bal_40x30');
    expect(secoes(html)).toEqual(['Fundação', 'Base', 'Material', 'Identidade']);
    expect(html).not.toContain('id="fun-t-pescoco"');
    const baseSelect = html.slice(html.indexOf('id="fun-t-base-forma"'), html.indexOf('</select>', html.indexOf('id="fun-t-base-forma"')));
    expect(baseSelect.match(/<option/g)).toHaveLength(1);
    expect(html).toMatch(/id="fun-t-forma" class="select" disabled/);
  });

  it('o catálogo oferecido na base da isolada só tem retangular e circular (sem perfis de aço)', () => {
    const html = fundacao('sap_80x80x30');
    const base = html.slice(html.indexOf('id="fun-t-base-preset"'), html.indexOf('</select>', html.indexOf('id="fun-t-base-preset"')));
    expect(base).toContain('conc_25x25');
    expect(base).not.toContain('aco_ipe200');
    expect(PERFIS_CATALOGO.some((p) => p.id === 'aco_ipe200')).toBe(true);
  });
});
