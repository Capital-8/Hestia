import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, defaultUnits, type Id } from '@hestia/model';
import { idRegiaoFixture, idTerrenoFixture, projetoTerreno } from './fixtureTerreno.ts';
import { definirGerenciadorDoTerreno, servicoTerreno } from './kernelTerrenoServico.ts';
import type { QuantidadesRegiaoTN, QuantidadesTerreno } from './terrenoQuantities.ts';
import { buildTerrenoSchedule, somarTerrenoSchedule, terrenoScheduleToCsv, type RotulosCsvTerreno } from './terrenoSchedule.ts';

const rotulos: RotulosCsvTerreno = {
  terreno: 'Terreno',
  regiao: 'Região',
  papel: 'Papel',
  areaPlanta: 'Área em planta',
  areaSuperficie: 'Área de superfície',
  volumeCorte: 'Corte',
  volumeAterro: 'Aterro',
  saldo: 'Saldo',
  papeis: { subdivisao: 'Subdivisão', plataforma: 'Plataforma', nivelada: 'Região nivelada' },
  totalTerreno: 'Total do terreno',
  totalProjeto: 'Total do projeto',
};

const qT = (terrenoId: Id, corte: number, aterro: number): QuantidadesTerreno => ({
  terrenoId, areaPlanta: 400, areaSuperficieExistente: 400, areaSuperficieProposta: 405, zMin: 8, zMax: 10, volumeCorte: corte, volumeAterro: aterro, nTriangulos: 8,
});
const qR = (regiaoId: Id, terrenoId: Id, corte: number, aterro: number): QuantidadesRegiaoTN => ({ regiaoId, terrenoId, areaPlanta: 100, areaSuperficie: 100, volumeCorte: corte, volumeAterro: aterro });

afterEach(() => {
  vi.restoreAllMocks();
  definirGerenciadorDoTerreno(() => null);
});

describe('tabela de corte e aterro do terreno', () => {
  it('T5: linha da região e total do terreno; corte entre 200 e 200,6, aterro 0 e saldo = corte', () => {
    const p = projetoTerreno('T5');
    const s = buildTerrenoSchedule(p, 'pt', {
      terrenos: [qT(idTerrenoFixture('T5'), 200.3, 0)],
      regioes: [qR(idRegiaoFixture('T5'), idTerrenoFixture('T5'), 200.3, 0)],
    });
    expect(s.pronto).toBe(true);
    expect(s.rows.map((r) => r.tipo)).toEqual(['regiao', 'terreno']);
    const reg = s.rows[0]!;
    expect(reg).toMatchObject({ regiaoNome: 'Plataforma', papel: 'plataforma', terrenoNome: 'T5', areaPlanta: 100 });
    for (const r of s.rows) {
      expect(r.volumeCorte).toBeGreaterThan(200);
      expect(r.volumeCorte).toBeLessThan(200.6);
      expect(r.volumeAterro).toBe(0);
      expect(r.saldo).toBe(r.volumeCorte);
    }
    expect(s.rows[1]).toMatchObject({ regiaoId: null, papel: null, areaSuperficie: 405 });
    expect(s.totais.volumeCorte).toBe(200.3);
    expect(s.totais.saldo).toBe(200.3);
  });

  it('T7: aterro entre 100 e 100,4, corte 0 e saldo negativo', () => {
    const p = projetoTerreno('T7');
    const s = buildTerrenoSchedule(p, 'pt', {
      terrenos: [qT(idTerrenoFixture('T7'), 0, 100.2)],
      regioes: [qR(idRegiaoFixture('T7'), idTerrenoFixture('T7'), 0, 100.2)],
    });
    expect(s.totais.volumeCorte).toBe(0);
    expect(s.totais.volumeAterro).toBeGreaterThan(100);
    expect(s.totais.volumeAterro).toBeLessThan(100.4);
    expect(s.totais.saldo).toBeLessThan(0);
    expect(s.rows[0]!.saldo).toBeCloseTo(-100.2, 12);
  });

  it('consulta o serviço quando não recebe dados (spy): quantidades e quantidadesRegioes', () => {
    const p = projetoTerreno('T5');
    const a = vi.spyOn(servicoTerreno(), 'quantidades').mockReturnValue([qT(idTerrenoFixture('T5'), 200.2, 0)]);
    const b = vi.spyOn(servicoTerreno(), 'quantidadesRegioes').mockReturnValue([qR(idRegiaoFixture('T5'), idTerrenoFixture('T5'), 200.2, 0)]);
    const s = buildTerrenoSchedule(p);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(s.totais.volumeCorte).toBe(200.2);
  });

  it('o total do projeto soma só as linhas de terreno (sem contar as regiões duas vezes)', () => {
    const t = somarTerrenoSchedule([
      { areaPlanta: 400, areaSuperficie: 410, volumeCorte: 10, volumeAterro: 4 },
      { areaPlanta: 100, areaSuperficie: 100, volumeCorte: 1, volumeAterro: 3 },
    ]);
    expect(t).toEqual({ areaPlanta: 500, areaSuperficie: 510, volumeCorte: 11, volumeAterro: 7, saldo: 4 });
  });

  it('sem kernel: nenhuma linha, mensagem do aviso terreno-sem-kernel e sem exceção', () => {
    definirGerenciadorDoTerreno(() => null);
    const p = projetoTerreno('T5');
    const s = buildTerrenoSchedule(p, 'pt');
    expect(s.pronto).toBe(false);
    expect(s.rows).toEqual([]);
    expect(s.totais.volumeCorte).toBe(0);
    expect(s.mensagem).toContain('kernel de geometria não está ligado');
    expect(buildTerrenoSchedule(p, 'en').mensagem).toContain('geometry kernel is off');
    expect(terrenoScheduleToCsv(s, defaultUnits('pt'), rotulos)).not.toContain('Total do projeto');
  });

  it('projeto sem terreno: tabela vazia e pronta, sem consultar o kernel', () => {
    const q = vi.spyOn(servicoTerreno(), 'quantidades');
    const s = buildTerrenoSchedule(createEmptyProject());
    expect(s).toMatchObject({ rows: [], pronto: true, mensagem: null });
    expect(q).not.toHaveBeenCalled();
  });

  it('terreno que o kernel não devolveu aparece com zeros', () => {
    const s = buildTerrenoSchedule(projetoTerreno('T5'), 'pt', { terrenos: [], regioes: [] });
    expect(s.rows).toHaveLength(2);
    expect(s.rows.every((r) => r.volumeCorte === 0 && r.volumeAterro === 0 && r.saldo === 0)).toBe(true);
  });
});

describe('CSV da tabela do terreno', () => {
  const units = defaultUnits('pt');

  it('T5: cabeçalho com a unidade do projeto, uma linha por região e terreno, rodapé com o total e decimal em vírgula', () => {
    const s = buildTerrenoSchedule(projetoTerreno('T5'), 'pt', {
      terrenos: [qT(idTerrenoFixture('T5'), 200.3, 0)],
      regioes: [qR(idRegiaoFixture('T5'), idTerrenoFixture('T5'), 200.3, 0)],
    });
    const csv = terrenoScheduleToCsv(s, units, rotulos, 'pt');
    expect(csv.startsWith('﻿')).toBe(true);
    const linhas = csv.replace('﻿', '').trimEnd().split('\r\n');
    expect(linhas).toHaveLength(4);
    expect(linhas[0]).toBe('Terreno;Região;Papel;Área em planta (m²);Área de superfície (m²);Corte (m³);Aterro (m³);Saldo (m³)');
    expect(linhas[1]).toBe('T5;Plataforma;Plataforma;100,00;100,00;200,300;0,000;200,300');
    expect(linhas[2]).toBe('T5;Total do terreno;;400,00;405,00;200,300;0,000;200,300');
    expect(linhas[3]).toBe('Total do projeto;;;400,00;405,00;200,300;0,000;200,300');
  });

  it('T7: saldo negativo no CSV; em inglês o decimal é ponto', () => {
    const s = buildTerrenoSchedule(projetoTerreno('T7'), 'pt', {
      terrenos: [qT(idTerrenoFixture('T7'), 0, 100.2)],
      regioes: [qR(idRegiaoFixture('T7'), idTerrenoFixture('T7'), 0, 100.2)],
    });
    const pt = terrenoScheduleToCsv(s, units, rotulos, 'pt').split('\r\n');
    expect(pt[3]).toBe('Total do projeto;;;400,00;405,00;0,000;100,200;-100,200');
    const en = terrenoScheduleToCsv(s, defaultUnits('en'), rotulos, 'en').split('\r\n');
    expect(en[3]).toContain('-');
    expect(en[3]).not.toContain(',');
  });

  it('tabela vazia gera só o cabeçalho', () => {
    const vazia = terrenoScheduleToCsv({ rows: [], totais: somarTerrenoSchedule([]), pronto: true, mensagem: null }, units, rotulos);
    expect(vazia.trimEnd().split('\r\n')).toHaveLength(1);
  });
});
