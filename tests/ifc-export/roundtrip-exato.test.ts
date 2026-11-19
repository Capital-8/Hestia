/**
 * Round-trip exato Hestia → IFC → Hestia.
 *
 * Exporta o template, anexa os psets privados (`Pset_Hestia_Element` / `Pset_Hestia_Project`), reimporta e compara o
 * JSON canônico do projeto INTEIRO: ids, tipos, camadas, juntas, níveis, materiais e ajustes. O único caminho aceito é
 * o registro nativo — a geometria do IFC não é usada para reconstruir nenhum elemento.
 */
import { describe, expect, it } from 'vitest';
import { buildTemplate, type Project, type TemplateId } from '@hestia/model';
import { HESTIA_ELEMENT_PSET, HESTIA_PROJECT_PSET, importIfc, withHestiaPsets } from '@hestia/io';
import { ifcGeometryOf } from '../../apps/web/src/editor/ifcExport.ts';
import { exportIfc } from '../../packages/io/src/ifc/ifcExport.ts';

const DATA = new Date('2026-10-29T00:00:00Z');

/** Todos os templates do catálogo: cada um tem de voltar idêntico pelo registro nativo. */
const MODELOS: TemplateId[] = ['blank', 'house2', 'studio', 'house-premium', 'predio10', 'esquadrias'];

/** Remove `undefined`, ordena as chaves e trata lista vazia como ausente: o que o importador sempre cria vazio casa. */
function semVazios(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semVazios);
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {};
    for (const chave of Object.keys(valor as Record<string, unknown>).sort()) {
      const filho = semVazios((valor as Record<string, unknown>)[chave]);
      if (filho === undefined) continue;
      if (Array.isArray(filho) && filho.length === 0) continue;
      out[chave] = filho;
    }
    return out;
  }
  return valor;
}

/** JSON canônico do projeto (ou de um elemento, para comparar um por um). */
function projetoCanonico(p: unknown): string {
  return JSON.stringify(semVazios(p), null, 1);
}

/** Texto IFC do projeto com a extensão Hestia (idempotente: não duplica pset se o exportador já emitir). */
function exportar(id: TemplateId): { original: Project; texto: string } {
  const original = buildTemplate(id);
  const bruto = exportIfc(original, ifcGeometryOf(original), { timestamp: DATA.toISOString().slice(0, 19) });
  return { original, texto: withHestiaPsets(original, bruto) };
}

describe('round-trip exato Hestia → IFC → Hestia', () => {
  it.each(MODELOS)('%s volta idêntico (projeto canônico completo)', (id) => {
    const { original, texto } = exportar(id);
    if (Object.keys(original.elements).length > 0) expect(texto).toContain(HESTIA_ELEMENT_PSET);
    expect(texto).toContain(HESTIA_PROJECT_PSET);

    const { project: voltou, report } = importIfc(texto);

    // Cada elemento voltou pelo registro (contagem por tipo do relatório), sem heurística.
    const total = Object.values(original.elements).length;
    const importados = Object.values(report.imported).reduce((soma, n) => soma + n, 0);
    expect(importados, 'todos os elementos precisam vir do registro, não de formas aproximadas').toBe(total);
    expect(report.generic, 'nenhum elemento deve cair no genérico').toEqual({});
    expect(report.geometry, 'nenhuma geometria deve ser reinterpretada').toEqual({});

    expect(projetoCanonico(voltou)).toBe(projetoCanonico(original));
  }, 120_000);

  it('house2 preserva ids, tipos, juntas, offsets e flags de cada parede', () => {
    const { original, texto } = exportar('house2');
    const { project: voltou } = importIfc(texto);
    for (const el of Object.values(original.elements)) {
      expect(projetoCanonico(voltou.elements[el.id]), `elemento ${el.id} (${el.kind})`).toBe(projetoCanonico(el));
      expect(voltou.elements[el.id]?.kind).toBe(el.kind);
    }
    expect(Object.keys(voltou.elements).sort()).toEqual(Object.keys(original.elements).sort());
  });

  it('esquadrias preserva as folhas, o sentido e o peitoril de cada vão', () => {
    const { original, texto } = exportar('esquadrias');
    const { project: voltou } = importIfc(texto);
    for (const el of Object.values(original.elements)) {
      if (el.kind !== 'door' && el.kind !== 'window') continue;
      const back = voltou.elements[el.id];
      expect(back?.kind).toBe(el.kind);
      expect(projetoCanonico(back)).toBe(projetoCanonico(el));
    }
    expect(voltou.openingTypes).toEqual(original.openingTypes);
  });

  it('JSON de Hestia exportado é interpretado pela importação normal (as Variáveis do template batem)', () => {
    const { original, texto } = exportar('house2');
    const { project: voltou } = importIfc(texto);
    expect(voltou.levels.map((l) => [l.id, l.name, l.elevation])).toEqual(original.levels.map((l) => [l.id, l.name, l.elevation]));
    expect(voltou.wallTypes).toEqual(original.wallTypes);
    expect(voltou.materials).toEqual(original.materials);
    expect(voltou.settings).toEqual(original.settings);
    expect(voltou.schemaVersion).toBe(original.schemaVersion);
    expect(voltou.name).toBe(original.name);
  });

  it('formato do pset: propriedades do contrato, GlobalIds determinísticos e referências íntegras', () => {
    const { original, texto } = exportar('house2');
    for (const prop of ['HestiaId', 'HestiaKind', 'HestiaType', 'HestiaJSON']) expect(texto).toContain(`'${prop}'`);
    for (const prop of ['HestiaVersion', 'SchemaVersion', 'SettingsJSON', 'TypesJSON', 'MaterialsJSON', 'LevelsJSON']) {
      expect(texto).toContain(`'${prop}'`);
    }
    // Uma relação por elemento, e o pset do projeto no IFCPROJECT.
    expect((texto.match(/=IFCRELDEFINESBYPROPERTIES\(/g) ?? []).length).toBeGreaterThanOrEqual(Object.keys(original.elements).length);

    // Toda referência `#n` aponta para uma entidade declarada (a injeção dos psets não quebra o STEP).
    const declaradas = new Set([...texto.matchAll(/^#(\d+)\s*=/gm)].map((m) => m[1]));
    for (const m of texto.replace(/'(?:[^']|'')*'/g, "''").matchAll(/#(\d+)/g)) expect(declaradas.has(m[1]!), `referência #${m[1]} sem entidade`).toBe(true);

    // Determinístico e idempotente: exportar de novo dá o mesmo texto e não duplica os psets.
    const bruto = exportIfc(original, ifcGeometryOf(original), { timestamp: DATA.toISOString().slice(0, 19) });
    expect(withHestiaPsets(original, bruto)).toBe(texto);
    expect(withHestiaPsets(original, texto)).toBe(texto);
  });
});
