import { beforeEach, describe, expect, it } from 'vitest';
import { ACTIONS, ctxNow } from './actions.ts';
import { txt } from './model.ts';
import { useFamilia } from '../familia/familiaStore.ts';
import { t as dicionario } from '../../editor/i18n.ts';

/** Reativação do Editor de famílias: a ação da faixa abre o editor (não está mais desativada). */
describe('ação Editor de famílias da faixa', () => {
  beforeEach(() => {
    useFamilia.getState().ocultar();
  });

  it('está habilitada e não traz motivo de desativação', () => {
    const acao = ACTIONS.familyEditor;
    expect(acao.disabled).toBeUndefined();
    expect(acao.disabled?.(ctxNow())).toBeUndefined();
  });

  it('o rótulo continua "Editor de famílias" e o aviso diz que é experimental', () => {
    expect(txt(ACTIONS.familyEditor.label, 'pt')).toBe('Editor de famílias');
    expect(txt(ACTIONS.familyEditor.hint!, 'pt')).toBe('Experimental: cria e edita móveis paramétricos (Meus modelos).');
    expect(txt(ACTIONS.familyEditor.hint!, 'en')).toBe('Experimental: creates and edits parametric furniture (My models).');
  });

  it('rodar a ação abre o editor sem mexer no projeto', () => {
    expect(useFamilia.getState().aberta).toBe(false);
    ACTIONS.familyEditor.run();
    expect(useFamilia.getState().aberta).toBe(true);
    useFamilia.getState().ocultar();
    expect(useFamilia.getState().aberta).toBe(false);
  });
});

/** Aviso "experimental" do editor e os botões novos: textos literais nos 7 idiomas (chaves `fam_`). */
describe('textos experimentais do editor de famílias', () => {
  it('aviso de experimental nos 7 idiomas', () => {
    expect(dicionario('pt', 'fam_exp_aviso')).toBe('Experimental: nada entra no projeto até “Carregar no projeto”.');
    expect(dicionario('en', 'fam_exp_aviso')).toBe('Experimental: nothing enters the project until “Load into project”.');
    expect(dicionario('es', 'fam_exp_aviso')).toBe('Experimental: nada entra en el proyecto hasta “Cargar en el proyecto”.');
    expect(dicionario('de', 'fam_exp_aviso')).toBe('Experimentell: Nichts gelangt ins Projekt, bis „In Projekt laden“ verwendet wird.');
    expect(dicionario('fr', 'fam_exp_aviso')).toBe('Expérimental : rien n\'entre dans le projet avant « Charger dans le projet ».');
    expect(dicionario('it', 'fam_exp_aviso')).toBe('Sperimentale: niente entra nel progetto finché non si usa «Carica nel progetto».');
    expect(dicionario('pl', 'fam_exp_aviso')).toBe('Eksperymentalne: nic nie trafia do projektu, dopóki nie użyjesz „Wczytaj do projektu”.');
  });

  it('selo e botão da biblioteca existem em todo idioma (nunca caem na chave)', () => {
    for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
      expect(dicionario(lang, 'fam_exp_selo')).not.toBe('fam_exp_selo');
      expect(dicionario(lang, 'fam_criar_modelo')).not.toBe('fam_criar_modelo');
      expect(dicionario(lang, 'fam_meus_exportar')).not.toBe('fam_meus_exportar');
      expect(dicionario(lang, 'fam_meus_importar')).not.toBe('fam_meus_importar');
    }
    expect(dicionario('pt', 'fam_criar_modelo')).toBe('Criar/editar modelo');
    expect(dicionario('en', 'fam_meus_exportado', { n: 2, nome: 'x.json' })).toBe('2 model(s) exported to “x.json”.');
  });
});
