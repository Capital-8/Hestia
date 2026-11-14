import { describe, expect, it } from 'vitest';
import { createEmptyProject, defaultUnits } from '@hestia/model';
import { buildMassSchedule, massScheduleToCsv, ServicoMassa, type FonteMassa } from './index.ts';
import { projetoComMassas } from './fixtureMassa.ts';
import type { AvisoMassaProjeto, FatiaMassaProjeto, QuantMassaProjeto } from './massaServico.ts';

const fatia = (massaId: string, copia: number, nivelId: string, area: number, perimetro: number, z: number): FatiaMassaProjeto => ({
  massaId,
  copia,
  nivelId,
  area,
  perimetro,
  z,
  pontos: [],
});

const aviso2 = (massaId: string): AvisoMassaProjeto => ({ massaId, codigo: 2, copia: 0, indice: 0, medido: 2, limite: 0, x: 0, y: 0, z: 0 });

/** Fonte fixa com o que o kernel devolveria para M3 (64 m² em cada pavimento) e M5 (pétala de 12 cópias de 2 m²). */
function fonteFixa(): FonteMassa {
  const fatias: FatiaMassaProjeto[] = [
    fatia('m3', 0, 'lv_0', 64, 32, 0),
    fatia('m3', 0, 'lv_2', 64, 32, 6),
    ...Array.from({ length: 12 }, (_, i) => fatia('m5p', i, 'lv_0', 2, 3, 0)),
    fatia('m5', 0, 'lv_0', 5, 8, 0),
  ];
  const quant: QuantMassaProjeto[] = [
    { massaId: 'm3', volume: 1920, areaLateral: 0, areaBase: 64, areaTopo: 64, altura: 30 },
    { massaId: 'm1', volume: 540, areaLateral: 234, areaBase: 60, areaTopo: 60, altura: 9 },
  ];
  return { fatias: () => fatias, quantidades: () => quant, avisos: () => [aviso2('m5p')] };
}

describe('tabela "Massas por pavimento": montagem a partir do kernel', () => {
  it('sem massa no projeto, a tabela fica vazia e não consulta o kernel', () => {
    const naoChamar = (): never => {
      throw new Error('o kernel não deveria ser consultado sem massas');
    };
    const s = buildMassSchedule(createEmptyProject(), { fatias: naoChamar, quantidades: naoChamar, avisos: naoChamar });
    expect(s).toEqual({ rows: [], totals: { volume: 0, areaLateral: 0, areaBase: 0, areaTopo: 0, area: 0, perimeter: 0, altura: 0 } });
  });

  it('sem kernel, devolve null (a tabela não mostra zero no lugar do que não foi calculado)', () => {
    expect(buildMassSchedule(projetoComMassas(), new ServicoMassa(() => null))).toBeNull();
  });

  it('uma linha por massa e pavimento; área e perímetro somados por cópia do arranjo', () => {
    const s = buildMassSchedule(projetoComMassas(), fonteFixa())!;
    const m5p = s.rows.find((r) => r.massaId === 'm5p')!;
    expect(s.rows.filter((r) => r.massaId === 'm5p')).toHaveLength(1);
    expect(m5p.massaName).toBe('M5 pétala');
    expect(m5p.levelId).toBe('lv_0');
    expect(m5p.copias).toBe(12);
    expect(m5p.area).toBeCloseTo(24, 9);
    expect(m5p.perimeter).toBeCloseTo(36, 9);
  });

  it('o aviso 2 (cópias sobrepostas) marca só as linhas da massa afetada', () => {
    const s = buildMassSchedule(projetoComMassas(), fonteFixa())!;
    expect(s.rows.find((r) => r.massaId === 'm5p')!.sobreposta).toBe(true);
    expect(s.rows.filter((r) => r.massaId === 'm3').every((r) => !r.sobreposta)).toBe(true);
  });

  it('as linhas seguem a ordem de criação da massa e depois a cota do pavimento', () => {
    const s = buildMassSchedule(projetoComMassas(), fonteFixa())!;
    expect(s.rows.map((r) => `${r.massaId}@${r.levelId}`)).toEqual(['m3@lv_0', 'm3@lv_2', 'm5@lv_0', 'm5p@lv_0']);
  });

  it('o rodapé traz volume, áreas totais, soma das áreas e a maior altura', () => {
    const s = buildMassSchedule(projetoComMassas(), fonteFixa())!;
    expect(s.totals.volume).toBeCloseTo(2460, 9);
    expect(s.totals.areaLateral).toBeCloseTo(234, 9);
    expect(s.totals.areaBase).toBeCloseTo(124, 9);
    expect(s.totals.areaTopo).toBeCloseTo(124, 9);
    expect(s.totals.area).toBeCloseTo(64 + 64 + 5 + 24, 9);
    expect(s.totals.altura).toBe(30);
  });
});

describe('tabela "Massas por pavimento": CSV', () => {
  it('cabeçalho em pt, uma linha por pavimento, total, rodapé e BOM; decimal pelo idioma', () => {
    const s = buildMassSchedule(projetoComMassas(), fonteFixa())!;
    const csv = massScheduleToCsv(s, defaultUnits('pt'), 'pt');
    expect(csv.startsWith('﻿')).toBe(true);
    const linhas = csv.slice(1).split('\r\n').filter((l) => l !== '');
    expect(linhas[0]).toBe('Massa;Pavimento;Área (m²);Perímetro (m);Aviso');
    expect(linhas[1]).toBe('M3 torre torcida;Térreo;64,00;32,00;');
    expect(linhas.find((l) => l.startsWith('M5 pétala'))).toBe('M5 pétala;Térreo;24,00;36,00;a área pode contar em dobro');
    expect(linhas.find((l) => l.startsWith('Total;'))).toBe('Total;;157,00;108,00;');
    expect(linhas.some((l) => l.startsWith('Volume total'))).toBe(true);
    expect(linhas.some((l) => l.startsWith('Altura máxima'))).toBe(true);
  });

  it('cabeçalho em en quando o idioma é inglês', () => {
    const s = buildMassSchedule(projetoComMassas(), fonteFixa())!;
    const linhas = massScheduleToCsv(s, defaultUnits('en'), 'en').slice(1).split('\r\n');
    expect(linhas[0]!.startsWith('Mass;Floor;Area (')).toBe(true);
    expect(linhas[0]!.endsWith(';Warning')).toBe(true);
  });
});
