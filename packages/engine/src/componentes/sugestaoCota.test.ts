import { describe, expect, it } from 'vitest';
import { sugerirMudancaDeCota, type AnguloSugerido } from './sugestaoCota.ts';

/* Ficha B5: menor mudança de cota (mm) para o trecho ficar a 45° (Δz = distância em planta) ou em prumada de 90°. Só geometria. */

const COM_TUDO = { curva45: 'fam_45', curva90: 'fam_90' };
const SO_90 = { curva45: '', curva90: 'fam_90' };
const SO_45 = { curva45: 'fam_45', curva90: '' };

describe('sugerirMudancaDeCota a 45°', () => {
  it('trecho em nível com 500 mm de planta: a cota muda 500 mm', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 45, 500, 0)).toBe(500);
  });

  it('desnível de 200 mm subindo: faltam 300 mm', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 45, 500, 200)).toBe(300);
  });

  it('desnível de 700 mm: a menor mudança é descer 200 mm (não 1200 mm para o lado oposto)', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 45, 500, 700)).toBe(200);
  });

  it('desnível negativo de 300 mm: faltam 200 mm, o sinal não muda o módulo', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 45, 500, -300)).toBe(200);
  });

  it('já está a 45° (desnível igual à planta): nada a mudar', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 45, 500, 500)).toBe(0);
  });

  it('tipo sem a peça de 45° (curva45 vazia): null', () => {
    expect(sugerirMudancaDeCota(SO_90, 45, 500, 0)).toBeNull();
  });
});

describe('sugerirMudancaDeCota a 90° (prumada)', () => {
  it('desvio de 50 mm com prumada mínima de 110 mm: faltam 60 mm', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 90, 500, 50, 110)).toBe(60);
  });

  it('desvio que já atende o mínimo: 0 (nada a mudar)', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 90, 500, 150, 110)).toBe(0);
  });

  it('tipo sem a peça de 90° (curva90 vazia): null', () => {
    expect(sugerirMudancaDeCota(SO_45, 90, 500, 50, 110)).toBeNull();
  });
});

describe('sugerirMudancaDeCota: casos sem sugestão', () => {
  it('sem regras (domínio sem tipo de tubulação): null para qualquer ângulo', () => {
    const angulos: AnguloSugerido[] = [45, 90];
    for (const a of angulos) expect(sugerirMudancaDeCota(null, a, 500, 0, 110)).toBeNull();
  });

  it('distância em planta ~0 (trecho vertical): null', () => {
    expect(sugerirMudancaDeCota(COM_TUDO, 45, 0, 100)).toBeNull();
    expect(sugerirMudancaDeCota(COM_TUDO, 45, 1e-9, 0)).toBeNull();
  });
});
