import { describe, expect, it } from 'vitest';
import {
  TEMPLATES,
  buildTemplate,
  disciplineOfElement,
  migrateProject,
  planTonesOf,
  serializeProject,
  templates,
  validateProject,
  type Discipline,
  type ElementDiscipline,
  type Project,
} from './index.ts';
import type { Lang } from './i18n.ts';

const projeto = (lang: Lang = 'pt'): Project => buildTemplate('casa-disciplinas', lang);

const NOMES: Record<Lang, string> = {
  pt: 'Casa de teste de disciplinas',
  en: 'Discipline Test House',
  es: 'Casa de prueba de disciplinas',
  de: 'Disziplinen-Testhaus',
  fr: 'Maison de test des disciplines',
  it: 'Casa di prova delle discipline',
  pl: 'Dom testowy dyscyplin',
};

const porDisciplina = (p: Project): Map<ElementDiscipline, number> => {
  const out = new Map<ElementDiscipline, number>();
  for (const e of Object.values(p.elements)) {
    const d = disciplineOfElement(e, p);
    out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
};

describe('modelo inicial "Casa de teste de disciplinas"', () => {
  it('está registrado em TEMPLATES nos sete idiomas, com área de 48 m²', () => {
    const pt = TEMPLATES.find((x) => x.id === 'casa-disciplinas');
    expect(pt).toMatchObject({ name: 'Casa de teste de disciplinas', area: '48 m²' });
    expect(pt?.description.length).toBeGreaterThan(0);
    for (const lang of Object.keys(NOMES) as Lang[]) {
      const item = templates(lang).find((x) => x.id === 'casa-disciplinas');
      expect(item?.name, lang).toBe(NOMES[lang]);
      expect(item?.description.length, lang).toBeGreaterThan(0);
    }
  });

  it('não gera nenhum problema de validação', () => {
    expect(validateProject(projeto())).toEqual([]);
  });

  it('serializa e reabre idêntico', () => {
    const texto = serializeProject(projeto());
    const lido = migrateProject(JSON.parse(texto));
    expect(serializeProject(lido)).toBe(texto);
  });

  it('tem ao menos um elemento de cada uma das cinco disciplinas, com as contagens pedidas', () => {
    const p = projeto();
    const contagem = porDisciplina(p);
    for (const d of ['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac'] as const) {
      expect(contagem.get(d) ?? 0, d).toBeGreaterThan(0);
    }
    const elementos = Object.values(p.elements);
    expect(elementos.filter((e) => e.kind === 'column')).toHaveLength(4);
    expect(elementos.filter((e) => e.kind === 'beam')).toHaveLength(2);
    expect(elementos.filter((e) => e.kind === 'footing')).toHaveLength(2);
    expect(elementos.filter((e) => e.kind === 'component' && disciplineOfElement(e, p) === 'hidrossanitario')).toHaveLength(3);
    expect(elementos.filter((e) => e.kind === 'component' && disciplineOfElement(e, p) === 'eletrico')).toHaveLength(7);
    expect(elementos.filter((e) => e.kind === 'component' && disciplineOfElement(e, p) === 'hvac')).toHaveLength(2);
  });

  it('traz uma PlanView de Estrutura, Hidrossanitário, Elétrico e HVAC no térreo, com nomes únicos e anotações vazias', () => {
    const p = projeto();
    const vistas = p.planViews ?? [];
    expect(vistas.map((v) => v.discipline)).toEqual(['estrutura', 'hidrossanitario', 'eletrico', 'hvac']);
    expect(vistas.map((v) => v.name)).toEqual([
      'Térreo - Estrutura',
      'Térreo - Hidrossanitário',
      'Térreo - Elétrico',
      'Térreo - HVAC',
    ]);
    expect(new Set(vistas.map((v) => v.name)).size).toBe(vistas.length);
    for (const v of vistas) {
      expect(v.levelId).toBe('lv_0');
      expect(v.tones).toBeUndefined();
      expect(v.annotations).toEqual({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });
    }
  });

  it('a planta de Estrutura usa a tabela §4.2: Arquitetura em meio-tom, Estrutura normal e MEP oculto', () => {
    const p = projeto();
    const estrutura = (p.planViews ?? []).find((v) => v.discipline === 'estrutura')!;
    const esperado = {
      arquitetura: 'halftone',
      estrutura: 'normal',
      hidrossanitario: 'hidden',
      eletrico: 'hidden',
      hvac: 'hidden',
    } as const;
    expect(planTonesOf(estrutura)).toEqual(esperado);
    const presentes = new Set<Discipline>();
    for (const e of Object.values(p.elements)) {
      const d = disciplineOfElement(e, p);
      if (d !== 'geral') presentes.add(d);
    }
    for (const d of presentes) expect(planTonesOf(estrutura)[d], d).toBe(esperado[d]);
  });
});
