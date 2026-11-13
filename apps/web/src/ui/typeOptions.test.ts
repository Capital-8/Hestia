import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { openingOptions, openingOptionsDaCortina } from './typeOptions.ts';

/* Oferta de esquadrias: a parede comum oferece tudo; a célula de cortina não oferece as de embutir (plano `pocket`). */
describe('esquadrias oferecidas numa célula de cortina', () => {
  const p = createEmptyProject();
  const ids = (xs: Array<{ id: string }>): string[] => xs.map((x) => x.id);

  it('a porta de embutir (ot_pe80) fica na parede comum e sai da lista da cortina', () => {
    expect(ids(openingOptions(p, 'door', 'pt'))).toContain('ot_pe80');
    expect(ids(openingOptionsDaCortina(p, 'door', 'pt'))).not.toContain('ot_pe80');
  });

  it('a lista da cortina é a das portas sem embutir: as de giro e de correr continuam', () => {
    const cortina = ids(openingOptionsDaCortina(p, 'door', 'pt'));
    const embutir = Object.values(p.openingTypes).filter((t) => t.kind === 'door' && t.plan === 'pocket').map((t) => t.id);
    expect(embutir.length).toBeGreaterThan(0);
    expect(cortina).toHaveLength(ids(openingOptions(p, 'door', 'pt')).length - embutir.length);
    expect(cortina).toContain('ot_p90');
    expect(cortina).toContain('ot_pc160');
  });

  it('janelas não mudam: a lista da cortina é a mesma da parede', () => {
    expect(ids(openingOptionsDaCortina(p, 'window', 'pt'))).toEqual(ids(openingOptions(p, 'window', 'pt')));
  });
});
