import { describe, expect, it } from 'vitest';
import { buildTemplate, isOpening, isWall, ProjectStore, type Opening } from '@hestia/model';
import { changeOpeningType } from '../../../editor/openingTypeActions.ts';
import { aberturasComTipo, copiaDoRascunho } from './duplicaTipo.ts';

describe('duplicar tipo de abertura', () => {
  it('a cópia usa o rascunho (inclusive o que ainda não foi gravado) e recebe código e nome próprios', () => {
    const store = new ProjectStore(buildTemplate('house2'));
    const rascunho = { ...store.project.openingTypes['ot_p80']!, name: 'Porta sala' };
    const copia = copiaDoRascunho(store.project, rascunho, 'pt');
    expect(copia.id).not.toBe('ot_p80');
    expect(copia.name).toBe('Porta sala (cópia)');
    expect(copia.code).toBe('P-02-2');
  });

  it('duplicar de novo o mesmo tipo dá outro código (não repete o da cópia gravada)', () => {
    const store = new ProjectStore(buildTemplate('house2'));
    const original = store.project.openingTypes['ot_p80']!;
    const primeira = copiaDoRascunho(store.project, original, 'pt');
    store.exec({ type: 'upsertOpeningType', openingType: primeira });
    const segunda = copiaDoRascunho(store.project, original, 'pt');
    expect(segunda.code).toBe('P-02-3');
    expect(segunda.id).not.toBe(primeira.id);
  });

  it('aberturasComTipo devolve só as aberturas da seleção que usam o tipo antigo', () => {
    const store = new ProjectStore(buildTemplate('house2'));
    const p = store.project;
    const janelas = Object.values(p.elements).filter((e): e is Opening => isOpening(e) && e.typeId === 'ot_j120').map((e) => e.id);
    const porta = Object.values(p.elements).find((e): e is Opening => isOpening(e) && e.typeId === 'ot_p80')!.id;
    const parede = Object.values(p.elements).find(isWall)!.id;
    expect(janelas.length).toBeGreaterThan(0);
    expect(aberturasComTipo(p, [parede, porta, ...janelas], 'ot_j120')).toEqual(janelas);
    expect(aberturasComTipo(p, [porta], 'ot_j120')).toEqual([]);
  });

  it('aplicar a cópia troca só as aberturas selecionadas, num comando que o Ctrl+Z desfaz', () => {
    const store = new ProjectStore(buildTemplate('house2'));
    const copia = copiaDoRascunho(store.project, store.project.openingTypes['ot_j120']!, 'pt');
    store.exec({ type: 'upsertOpeningType', openingType: copia });
    const [primeira, segunda] = aberturasComTipo(store.project, Object.keys(store.project.elements), 'ot_j120');
    changeOpeningType(store, [primeira!], copia.id, () => {});
    expect((store.project.elements[primeira!] as Opening).typeId).toBe(copia.id);
    expect((store.project.elements[segunda!] as Opening).typeId).toBe('ot_j120');
    store.undo();
    expect((store.project.elements[primeira!] as Opening).typeId).toBe('ot_j120');
  });
});
