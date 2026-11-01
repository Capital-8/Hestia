import { describe, expect, it } from 'vitest';
import { ProjectStore, type Command } from '@hestia/model';
import { computeSection } from './section.ts';
import { SecaoIncremental } from './sectionIncremental.ts';
import { projetoComPavimentos } from './worker/fixturePavimentos.ts';

const linha = { a: { x: -2, y: 4 }, b: { x: 12, y: 4 }, depth: 6 };

describe('corte incremental', () => {
  it('é igual ao corte completo depois de cada edição e refaz só os pavimentos afetados', () => {
    const store = new ProjectStore(projetoComPavimentos(5));
    const inc = new SecaoIncremental();
    const confere = (l = linha): void => {
      expect(inc.calcular(store.project, l)).toEqual(computeSection(store.project, l));
    };
    confere();
    expect(inc.recalculados).toBe(5);
    confere();
    expect(inc.recalculados).toBe(0);
    const edicoes: Array<[string, Command, number]> = [
      ['parede do pavimento 2', { type: 'updateElements', ids: ['pav_2_w1'], patch: { heightOffset: 0.2 } }, 3],
      ['porta do pavimento 4', { type: 'updateElements', ids: ['pav_4_o'], patch: { offset: 3 } }, 2],
      ['apagar a laje do pavimento 0', { type: 'deleteElements', ids: ['pav_0_laje'] }, 5],
    ];
    for (const [nome, cmd, afetados] of edicoes) {
      store.exec(cmd);
      confere();
      expect(inc.recalculados, nome).toBe(afetados);
    }
    const outra = { a: { x: 3, y: -3 }, b: { x: 3, y: 12 }, depth: 20 };
    confere(outra);
    expect(inc.recalculados).toBe(5);
    confere(outra);
    expect(inc.recalculados).toBe(0);
  });
});
