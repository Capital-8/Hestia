import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, defaultUnits, type Project } from '@hestia/model';
import { buildTerrenoSchedule, definirGerenciadorDoTerreno, idRegiaoFixture, idTerrenoFixture, projetoTerreno, servicoTerreno, type QuantidadesRegiaoTN, type QuantidadesTerreno } from '@hestia/engine';
import { csvDoTerreno, rotulosCsvTerreno, TerrenoScheduleDialog } from './TerrenoScheduleDialog.tsx';
import { abrirTerrenoSchedule, fecharTerrenoSchedule } from './terrenoScheduleAberta.ts';

/** O projeto que o hook `useProject` devolve (o diálogo lê dele); cada teste troca. */
const atual = vi.hoisted(() => ({ p: null as Project | null }));
vi.mock('../../editor/controller.ts', () => ({ editor: {}, useProject: () => atual.p, useProjectVersion: () => 0 }));

const qT = (id: string, corte: number, aterro: number): QuantidadesTerreno => ({
  terrenoId: id, areaPlanta: 400, areaSuperficieExistente: 400, areaSuperficieProposta: 405, zMin: 8, zMax: 10, volumeCorte: corte, volumeAterro: aterro, nTriangulos: 8,
});
const qR = (id: string, terreno: string, corte: number, aterro: number): QuantidadesRegiaoTN => ({ regiaoId: id, terrenoId: terreno, areaPlanta: 100, areaSuperficie: 100, volumeCorte: corte, volumeAterro: aterro });

/** Kernel simulado: o spy no serviço devolve as quantidades de T5 (corte) ou T7 (aterro). */
function simular(nome: 'T5' | 'T7'): void {
  const t = idTerrenoFixture(nome);
  const r = idRegiaoFixture(nome);
  const corte = nome === 'T5' ? 200.3 : 0;
  const aterro = nome === 'T7' ? 100.2 : 0;
  vi.spyOn(servicoTerreno(), 'quantidades').mockReturnValue([qT(t, corte, aterro)]);
  vi.spyOn(servicoTerreno(), 'quantidadesRegioes').mockReturnValue([qR(r, t, corte, aterro)]);
}
const html = (): string => renderToStaticMarkup(createElement(TerrenoScheduleDialog));

beforeEach(() => definirGerenciadorDoTerreno(() => null));
afterEach(() => {
  vi.restoreAllMocks();
  fecharTerrenoSchedule();
});

describe('diálogo Terreno: corte e aterro', () => {
  it('fechado não renderiza nada', () => {
    expect(html()).toBe('');
  });

  it('T5: uma linha da região, o total do terreno e o rodapé do projeto, com a unidade do projeto no cabeçalho', () => {
    atual.p = projetoTerreno('T5');
    simular('T5');
    abrirTerrenoSchedule();
    const h = html();
    expect(h).toContain('Terreno: corte e aterro');
    expect(h).toContain('Plataforma');
    expect(h).toContain('Total do terreno');
    expect(h).toContain('Total do projeto');
    expect(h).toContain('Corte (m³)');
    expect(h).toContain('Área em planta (m²)');
    expect(h).toContain('200,300');
    expect(h).not.toContain('<button class="btn primary" disabled');
  });

  it('T7: aterro e saldo negativo aparecem na tabela', () => {
    atual.p = projetoTerreno('T7');
    simular('T7');
    abrirTerrenoSchedule();
    const h = html();
    expect(h).toContain('100,200');
    expect(h).toContain('-100,200');
  });

  it('sem kernel: a mensagem terreno-sem-kernel e nenhuma linha de tabela, sem exceção', () => {
    atual.p = projetoTerreno('T5');
    abrirTerrenoSchedule();
    const h = html();
    expect(h).toContain('kernel de geometria não está ligado');
    expect(h).not.toContain('<table');
    expect(h).toContain('<button class="btn primary" disabled');
    expect(h).not.toContain('Total do projeto');
  });

  it('projeto sem terreno: mensagem de vazio', () => {
    atual.p = createEmptyProject();
    abrirTerrenoSchedule();
    expect(html()).toContain('Nenhum terreno no projeto.');
  });
});

describe('CSV do diálogo', () => {
  it('T5 e T7: rótulos do idioma, unidade do projeto e totais no rodapé', () => {
    for (const [nome, corte, aterro, saldo] of [['T5', '200,300', '0,000', '200,300'], ['T7', '0,000', '100,200', '-100,200']] as const) {
      const p = projetoTerreno(nome);
      const t = idTerrenoFixture(nome);
      const s = buildTerrenoSchedule(p, 'pt', {
        terrenos: [qT(t, nome === 'T5' ? 200.3 : 0, nome === 'T7' ? 100.2 : 0)],
        regioes: [qR(idRegiaoFixture(nome), t, nome === 'T5' ? 200.3 : 0, nome === 'T7' ? 100.2 : 0)],
      });
      const linhas = csvDoTerreno(s, defaultUnits('pt'), 'pt').replace('﻿', '').trimEnd().split('\r\n');
      expect(linhas[0]).toBe('Terreno;Região;Papel;Área em planta (m²);Área de superfície (m²);Corte (m³);Aterro (m³);Saldo (m³)');
      expect(linhas.at(-1)).toBe(`Total do projeto;;;400,00;405,00;${corte};${aterro};${saldo}`);
    }
  });

  it('os rótulos existem nos sete idiomas (sem chave vazia)', () => {
    for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
      const r = rotulosCsvTerreno(lang);
      expect(Object.values({ ...r, ...r.papeis, papeis: '' }).every((x) => typeof x === 'string' && x.length > 0 || x === '')).toBe(true);
      expect(r.saldo.length).toBeGreaterThan(0);
      expect(r.totalProjeto.length).toBeGreaterThan(0);
    }
  });
});
