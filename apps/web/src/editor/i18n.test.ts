import { describe, expect, it } from 'vitest';
import { TOOL_LABEL } from '@hestia/tools';
import { I18N, cmpTexto, fmtDate, nomeComandoLang, resolveText, t, toolLabel, type Dict } from './i18n.ts';

describe('rótulos de ferramenta', () => {
  // TOOL_LABEL é Record<ToolId, string>: suas chaves são todos os ToolIds do registro.
  const ids = Object.keys(TOOL_LABEL) as Array<keyof typeof TOOL_LABEL>;

  it('todo ToolId tem rótulo em PT e EN (tool_<id>), sem cair no id cru', () => {
    for (const id of ids) {
      expect(I18N.pt[`tool_${id}` as keyof typeof I18N.pt], `pt tool_${id}`).toBeTruthy();
      expect(I18N.en[`tool_${id}` as keyof typeof I18N.en], `en tool_${id}`).toBeTruthy();
      expect(toolLabel(id, 'en')).not.toBe(id);
    }
  });

  it('o Corte aparece como "Corte" em PT e "Section" em EN', () => {
    expect(toolLabel('section', 'pt')).toBe('Corte');
    expect(toolLabel('section', 'en')).toBe('Section');
  });

  it('Telhado por extrusão e Separador de ambiente têm rótulo nos dois idiomas', () => {
    expect(toolLabel('roofextrusion', 'pt')).toBe('Telhado por extrusão');
    expect(toolLabel('roofextrusion', 'en')).toBe('Roof by Extrusion');
    expect(toolLabel('roomsep', 'en')).toBe('Room Separator');
  });
});

describe('dicionário PT/EN', () => {
  it('toda chave de PT existe em EN e vice-versa', () => {
    const pt = Object.keys(I18N.pt).sort();
    const en = Object.keys(I18N.en).sort();
    expect(en).toEqual(pt);
  });

  it('toda chave stt_* do modal de escada existe nos dois idiomas', () => {
    const keys = Object.keys(I18N.pt).filter((k) => k.startsWith('stt_'));
    expect(keys.length).toBeGreaterThan(60);
    for (const k of keys) {
      expect(I18N.pt[k as keyof typeof I18N.pt], `pt ${k}`).toBeTruthy();
      expect(I18N.en[k as keyof typeof I18N.en], `en ${k}`).toBeTruthy();
    }
  });
});

describe('nome de comando de atalho (diálogos de atalhos)', () => {
  it('usa o mesmo rótulo da ferramenta na faixa (dimension = "Cota alinhada", não "Cota")', () => {
    expect(nomeComandoLang('dimension', 'pt')).toBe('Cota alinhada');
    expect(nomeComandoLang('dimension', 'en')).toBe(toolLabel('dimension', 'en'));
  });

  it('a tela de atalhos tem nome nos dois idiomas', () => {
    expect(nomeComandoLang('atalhos', 'pt')).toBe('Atalhos de teclado');
    expect(nomeComandoLang('atalhos', 'en')).toBe('Keyboard Shortcuts');
  });

  it('o diálogo de unidades tem nome nos dois idiomas', () => {
    expect(nomeComandoLang('unidades', 'pt')).toBe('Unidades do projeto');
    expect(nomeComandoLang('unidades', 'en')).toBe('Project Units');
  });

  it('Criar semelhante tem nome nos dois idiomas', () => {
    expect(nomeComandoLang('createSimilar', 'pt')).toBe('Criar semelhante');
    expect(nomeComandoLang('createSimilar', 'en')).toBe('Create Similar');
  });

  it('os textos novos da rampa (Livre, Ajustar) existem nos dois idiomas', () => {
    for (const k of ['ramp_shape_free', 'ramp_adjust', 'ramp_adjust_title'] as const) {
      expect(I18N.pt[k]).toBeTruthy();
      expect(I18N.en[k]).toBeTruthy();
    }
    expect(I18N.pt.ramp_shape_free).toBe('Livre');
    expect(I18N.en.ramp_shape_free).toBe('Free');
  });
});

describe('t() e helpers de idioma', () => {
  it('traduz a mesma chave em PT e EN', () => {
    expect(t('pt', 'tool_wall')).toBe('Parede');
    expect(t('en', 'tool_wall')).toBe('Wall');
    expect(t('pt', 'stt_close')).toBe('Fechar');
    expect(t('en', 'stt_close')).toBe('Close');
  });

  it('interpola {nome} com os argumentos', () => {
    expect(t('pt', 'stt_sub_many', { n: 3 })).toBe('Escada · usada em 3 escadas');
    expect(t('en', 'stt_sub_many', { n: 3 })).toBe('Stair · used by 3 stairs');
  });

  it('mantém o marcador quando falta o argumento', () => {
    expect(t('pt', 'stt_sub_many')).toContain('{n}');
  });

  it('cai em PT quando o EN não tem a chave e, por último, na própria chave', () => {
    const en = I18N.en as unknown as Record<string, string | undefined>;
    const salvo = en.tool_wall;
    delete en.tool_wall;
    try {
      expect(t('en', 'tool_wall')).toBe('Parede');
    } finally {
      en.tool_wall = salvo!;
    }
    expect(t('en', 'chave_que_nao_existe' as keyof Dict)).toBe('chave_que_nao_existe');
  });

  it('resolveText aceita texto literal e mensagem do dicionário', () => {
    expect(resolveText('Pavimento 1', 'en')).toBe('Pavimento 1');
    expect(resolveText({ key: 'tool_wall' }, 'en')).toBe('Wall');
    expect(resolveText({ key: 'stt_sub_many', args: { n: 2 } }, 'pt')).toBe('Escada · usada em 2 escadas');
  });

  it('fmtDate usa o formato do idioma ativo', () => {
    const d = new Date(2021, 0, 2);
    expect(fmtDate('pt', d)).toBe(d.toLocaleDateString('pt-BR'));
    expect(fmtDate('en', d)).toBe(d.toLocaleDateString('en-US'));
  });

  it('cmpTexto ordena na collation do idioma (numérica por padrão)', () => {
    expect(cmpTexto('a', 'b', 'pt')).toBeLessThan(0);
    expect(cmpTexto('b', 'a', 'en')).toBeGreaterThan(0);
    expect(cmpTexto('2', '10', 'pt')).toBeLessThan(0);
    expect(cmpTexto('ênfase', 'fase', 'pt')).toBeLessThan(0);
  });

  it('nenhum idioma tem valor vazio ou literalmente "undefined"', () => {
    for (const lang of Object.keys(I18N) as Array<keyof typeof I18N>) {
      const dict = I18N[lang] as unknown as Record<string, string>;
      const ruins = Object.entries(dict).filter(([, v]) => typeof v !== 'string' || v.trim() === '' || v.trim() === 'undefined').map(([k]) => k);
      expect({ lang, ruins }).toEqual({ lang, ruins: [] });
    }
  });

  it('Dict tem paridade entre PT e EN (chaves e valores string)', () => {
    const pt = Object.keys(I18N.pt) as Array<keyof Dict>;
    const en = Object.keys(I18N.en) as Array<keyof Dict>;
    expect([...en].sort()).toEqual([...pt].sort());
    for (const k of pt) expect(typeof I18N.en[k]).toBe('string');
  });
});
