import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, defaultUnits, makeSlab, ProjectStore, type Project } from '@hestia/model';
import { buildLoteSchedule, loteL1, projetoI1, projetoLote } from '@hestia/engine';
import { csvDoLote, LoteScheduleDialog, rotulosCsvLote } from './LoteScheduleDialog.tsx';
import { abrirLoteSchedule, fecharLoteSchedule } from './loteScheduleAberta.ts';

/** O projeto que o hook `useProject` devolve (o diálogo lê dele a cada renderização); cada teste troca. */
const atual = vi.hoisted(() => ({ p: null as Project | null }));
vi.mock('../../editor/controller.ts', () => ({ editor: {}, useProject: () => atual.p, useProjectVersion: () => 0 }));

const html = (): string => renderToStaticMarkup(createElement(LoteScheduleDialog));

beforeEach(() => {
  atual.p = null;
});
afterEach(() => fecharLoteSchedule());

describe('diálogo Índices do lote', () => {
  it('fechado não renderiza nada', () => {
    expect(html()).toBe('');
  });

  it('I1: uma linha do lote com as áreas e os três índices (25,00 %; 0,50; 66,67 %), e "—" onde não há limite', () => {
    atual.p = projetoI1();
    abrirLoteSchedule();
    const h = html();
    expect(h).toContain('Índices do lote');
    expect(h).toContain('>L1<');
    expect(h).toContain('360,00');
    expect(h).toContain('198,00');
    expect(h).toContain('25,00 %');
    expect(h).toContain('0,50');
    expect(h).toContain('66,67 %');
    expect(h).toContain('Área edificável (m²)');
    expect(h).toContain('—');
    expect(h).not.toContain('<button class="btn primary" disabled');
  });

  it('com limites: a marca "dentro" ou "excede" aparece em cada índice', () => {
    atual.p = projetoI1();
    const s = new ProjectStore(atual.p);
    s.exec({ type: 'updateLot', id: 'lote_l1', patch: { limites: { taxaOcupacaoMax: 0.3, coefAproveitamentoMax: 0.4, permeabilidadeMin: 0.7 } } });
    atual.p = s.project;
    abrirLoteSchedule();
    const h = html();
    expect(h.match(/>dentro</g)).toHaveLength(1);
    expect(h.match(/>excede</g)).toHaveLength(2);
  });

  it('atualiza quando o projeto muda: criar uma laje com a tabela aberta mostra a taxa nova sem reabrir', () => {
    atual.p = projetoLote(loteL1());
    abrirLoteSchedule();
    expect(html()).toContain('0,00 %');
    const s = new ProjectStore(atual.p);
    s.exec({
      type: 'addSlab',
      slab: makeSlab({ id: 'sl_novo', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [{ x: 1.5, y: 5 }, { x: 10.5, y: 5 }, { x: 10.5, y: 15 }, { x: 1.5, y: 15 }] }),
    });
    atual.p = s.project;
    const h = html();
    expect(h).toContain('25,00 %');
  });

  it('projeto sem lote: mensagem de vazio e exportação desligada', () => {
    atual.p = createEmptyProject();
    abrirLoteSchedule();
    const h = html();
    expect(h).toContain('Nenhum lote no projeto.');
    expect(h).toContain('<button class="btn primary" disabled');
  });
});

describe('CSV do diálogo', () => {
  it('I1: o CSV traz o cabeçalho com as colunas e a linha do lote', () => {
    const csv = csvDoLote(buildLoteSchedule(projetoI1()), defaultUnits('pt'), 'pt').replace('﻿', '').trimEnd().split('\r\n');
    expect(csv[0]).toContain('Lote;Área (m²);Área edificável (m²)');
    expect(csv[1]).toBe('L1;360,00;198,00;90,00;180,00;25,00;—;—;0,50;—;—;66,67;—;—');
  });

  it('os rótulos existem nos sete idiomas (sem chave vazia)', () => {
    for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
      const r = rotulosCsvLote(lang);
      for (const v of Object.values(r)) expect(v.length).toBeGreaterThan(0);
    }
  });
});
