import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  functionLabels,
  openingFamilyOf,
  openingTypeCatalog,
} from './index.ts';
import { openingName } from './i18n.ts';

describe('nomes padrão no idioma de criação', () => {
  it('cria o projeto em espanhol, não com o nome "es"', () => {
    const p = createEmptyProject('es');
    expect(p.name).toBe('Proyecto sin título');
    expect(p.levels[0]?.name).toBe('Planta baja');
    expect(p.materials.mat_reboco?.name).toBe('Revoco');
    expect(p.wallTypes.wt_alv14?.name).toBe('Fábrica de ladrillo 14 + revoco');
    expect(p.openingTypes.ot_p80?.name).toBe('Puerta 80 x 210');
  });

  it('continua aceitando um nome de projeto comum', () => {
    const p = createEmptyProject('Projeto X');
    expect(p.name).toBe('Projeto X');
    expect(p.materials.mat_reboco?.name).toBe('Reboco');
  });

  it.each([
    ['de', 'Unbenanntes Projekt', 'Erdgeschoss', 'Putz'],
    ['fr', 'Projet sans titre', 'Rez-de-chaussée', 'Enduit'],
    ['it', 'Progetto senza titolo', 'Piano terra', 'Intonaco'],
    ['pl', 'Projekt bez tytułu', 'Parter', 'Tynk'],
  ] as const)('cria o projeto em %s', (lang, nome, terreo, reboco) => {
    const p = createEmptyProject(lang);
    expect(p.name).toBe(nome);
    expect(p.levels[0]?.name).toBe(terreo);
    expect(p.materials.mat_reboco?.name).toBe(reboco);
  });

  it('traduz a família de abertura no idioma ativo', () => {
    const de = createEmptyProject('de');
    expect(openingFamilyOf(de.openingTypes.ot_p80!, 'de')?.name).toBe('Drehtür');
    const es = createEmptyProject('es');
    expect(openingFamilyOf(es.openingTypes.ot_p80!, 'es')?.name).toBe('Puerta batiente');
  });

  it('traduz nomes compostos de abertura', () => {
    const nome = 'Porta de giro 90 x 210 com bandeira fixa 40';
    expect(openingName(nome, 'es')).toBe('Puerta batiente 90 x 210 con banderola fija 40');
    expect(openingName(nome, 'de')).toBe('Drehtür 90 x 210 mit festem Oberlicht 40');
    expect(openingName(nome, 'fr')).toBe('Porte à battant 90 x 210 avec imposte fixe 40');
    expect(openingName(nome, 'it')).toBe('Porta a battente 90 x 210 con sopraluce fisso 40');
    expect(openingName(nome, 'pl')).toBe('Drzwi skrzydłowe 90 x 210 z naświetlem stałym 40');
  });

  it('o catálogo de aberturas sai traduzido', () => {
    expect(openingTypeCatalog('fr').some((t) => t.name.includes('Porte à battant'))).toBe(true);
    expect(openingTypeCatalog('pl').some((t) => t.name.includes('Drzwi skrzydłowe'))).toBe(true);
  });

  it('os rótulos das funções de camada seguem o idioma', () => {
    expect(functionLabels('pl').substrate).toBe('Podłoże');
    expect(functionLabels('es').structure).toBe('Estructura');
    expect(functionLabels('de').finish1).toBe('Ausbau 1');
  });
});
