import { createEmptyProject, familiaDaBiblioteca, ProjectStore } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { diagnosticarRede } from './diagnosticoRede.ts';
import { trechoDeTubo } from './orientarSegmento.ts';

/*
 * Declividade por DN NOMINAL (ficha B9, defeito 2): o diâmetro da ligação da Krona é o externo (DN 100 = 101,6 mm) e passava de
 * `dnMaxMm: 100`, então o trecho de DN 100 nunca era conferido. Os limites da faixa (CONFERIR) não mudaram.
 */

const KRONA = 'fam_krona_esgoto_tubo_corte';

/** Tubo Krona de 2 m na horizontal com queda `dz` (m) e DN dado; devolve os avisos de inclinação. */
function inclinacoes(dn: number, dz: number) {
  const store = new ProjectStore(createEmptyProject('t'));
  const f = familiaDaBiblioteca(KRONA);
  if (!f) throw new Error('sem família');
  store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  const nivel = store.project.levels[0]?.id ?? 'lv_0';
  const c = trechoDeTubo([0, 0, 0.5], [2, 0, 0.5 + dz], { id: KRONA }, dn, { id: 't1', levelId: nivel });
  if (!c) throw new Error('sem trecho');
  store.exec({ type: 'addComponent', component: c });
  return diagnosticarRede(store.project).filter((d) => d.codigo === 'inclinacao_fora_limite');
}

describe('inclinação por DN nominal (esgoto Krona)', () => {
  it.each([40, 50, 75, 100])('DN %i com 0,5 % é acusado', (dn) => {
    const r = inclinacoes(dn, -0.01);
    expect(r).toHaveLength(1);
    expect(r[0]?.valor).toBeCloseTo(0.5, 2);
  });

  it.each([40, 50, 75, 100])('DN %i com 6 % é acusado e com 3 % não', (dn) => {
    expect(inclinacoes(dn, -0.12)).toHaveLength(1);
    expect(inclinacoes(dn, -0.06)).toEqual([]);
  });

  it('DN 150 fica fora da faixa (dnMaxMm 100): sem aviso, mesmo com 0,5 %', () => {
    expect(inclinacoes(150, -0.01)).toEqual([]);
  });
});
