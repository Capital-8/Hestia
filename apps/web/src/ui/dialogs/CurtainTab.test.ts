import { describe, expect, it } from 'vitest';
import { CURTAIN_PRESET_ID, createEmptyProject, curtainWallTypes, isCurtainType } from '@hestia/model';
import { lerPosicoes, trocarModoEixo } from './CurtainTab.tsx';
import { wallOptions } from '../typeOptions.ts';

describe('aba Cortina: modo da grade (decisão 0056, §4.2)', () => {
  it('trocar para número de células põe contagem padrão e mantém o deslocamento', () => {
    expect(trocarModoEixo({ mode: 'manual', positions: [1], offset: 0.1 }, 'fixedNumber')).toEqual({ mode: 'fixedNumber', count: 3, offset: 0.1, angle: undefined });
  });

  it('distância fixa põe justificação início quando não há; a máxima guarda a distância existente', () => {
    expect(trocarModoEixo({ mode: 'fixedNumber', count: 4 }, 'fixedDistance')).toMatchObject({ mode: 'fixedDistance', distance: 1.2, justify: 'start' });
    expect(trocarModoEixo({ mode: 'fixedDistance', distance: 1.5, justify: 'end' }, 'maxDistance')).toMatchObject({ mode: 'maxDistance', distance: 1.5 });
  });

  it('manual põe lista de posições e âncora no início, sem herdar o número de células', () => {
    const r = trocarModoEixo({ mode: 'fixedNumber', count: 4 }, 'manual');
    expect(r).toMatchObject({ mode: 'manual', positions: [], anchor: 'start' });
    expect(r.count).toBeUndefined();
  });
});

describe('aba Cortina: leitura das posições manuais', () => {
  it('aceita ponto ou vírgula decimal e separa por ponto e vírgula', () => {
    expect(lerPosicoes('2; 10')).toEqual([2, 10]);
    expect(lerPosicoes('2,5; 7')).toEqual([2.5, 7]);
  });

  it('descarta o que não é número e o texto vazio, sem lançar', () => {
    expect(lerPosicoes('2; abc; 7;')).toEqual([2, 7]);
    expect(lerPosicoes('')).toEqual([]);
  });
});

describe('seletor de tipo de parede: família (decisão 0056, §4.7)', () => {
  it('tipo cortina entra no grupo "Parede cortina"; tipo básico, no "Parede básica"', () => {
    const p = createEmptyProject();
    const opcoes = wallOptions(p, 'pt');
    const cortina = opcoes.find((o) => o.id === CURTAIN_PRESET_ID.fachada);
    const basica = opcoes.find((o) => o.id === 'wt_alv14');
    expect(cortina?.family).toBe('Parede cortina');
    expect(basica?.family).toBe('Parede básica');
  });

  it('todas as predefinições de cortina são tipos cortina no seletor', () => {
    const p = createEmptyProject();
    for (const w of curtainWallTypes('pt')) {
      expect(isCurtainType(p.wallTypes[w.id])).toBe(true);
    }
  });
});
