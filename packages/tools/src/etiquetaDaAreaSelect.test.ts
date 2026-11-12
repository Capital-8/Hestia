import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { floorViewId, migrateProject, ProjectStore, withViewPatchOfTest, type Project } from '@hestia/model';
import { annotationAt } from './annotationPick.ts';

/**
 * Raia E: a etiqueta de elemento copiada para a planta de área é da vista: selecionável nela, com o próprio id, e
 * ocultá-la na área não mexe no piso (nem o contrário). Projeto do ouro 04 (v23): etiqueta `tg_n0` no nível, em (5; -0,6).
 */
const DIR = new URL('../../../tests/vistas-ouro/projetos/', import.meta.url);
const migrado = (): Project => migrateProject(JSON.parse(readFileSync(new URL('04-area-anotacoes-proprias.json', DIR), 'utf8')) as Record<string, unknown>);
const AQUI = { x: 5, y: -0.6 };
const idEm = (p: Project, viewId: string): string | undefined => annotationAt(p, 'lv_0', AQUI, 0.01, viewId)?.id;

describe('seleção da etiqueta de elemento na planta de área (raia E)', () => {
  it('na planta vazia o clique acerta a cópia; no piso, o original', () => {
    const p = migrado();
    expect(idEm(p, 'ap_vazia')).toBe('tg_n0__ap_vazia');
    expect(idEm(p, floorViewId('lv_0'))).toBe('tg_n0');
  });

  it('ocultar a cópia na área não mexe no piso; ocultar o original no piso não mexe na área', () => {
    const p = migrado();
    const naArea = withViewPatchOfTest(p, 'ap_vazia', { hidden: { elements: ['tg_n0__ap_vazia'] } });
    expect(idEm(naArea, 'ap_vazia')).toBeUndefined();
    expect(idEm(naArea, floorViewId('lv_0'))).toBe('tg_n0');
    const noPiso = withViewPatchOfTest(p, floorViewId('lv_0'), { hidden: { elements: ['tg_n0'] } });
    expect(idEm(noPiso, floorViewId('lv_0'))).toBeUndefined();
    expect(idEm(noPiso, 'ap_vazia')).toBe('tg_n0__ap_vazia');
  });

  it('apagar a etiqueta na área não apaga a do piso', () => {
    const s = new ProjectStore(migrado());
    s.exec({ type: 'removeTag', levelId: 'lv_0', viewId: 'ap_vazia', id: 'tg_n0__ap_vazia' });
    expect(idEm(s.project, 'ap_vazia')).toBeUndefined();
    expect(idEm(s.project, floorViewId('lv_0'))).toBe('tg_n0');
  });
});
