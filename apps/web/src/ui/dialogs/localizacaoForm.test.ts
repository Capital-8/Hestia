import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, localizacaoDe } from '@hestia/model';
import {
  aplicarLocalizacao,
  comandoDeLocalizacao,
  formDaLocalizacao,
  formEhZero,
  formMudou,
  grausParaRad,
  localizacaoDoForm,
  problemaDoForm,
  radParaGraus,
  type FormLocalizacao,
} from './localizacaoForm.ts';

const form = (patch: Partial<FormLocalizacao> = {}): FormLocalizacao => ({ origemE: 333000, origemN: 7394000, cotaZero: 740.5, norteGraus: 30, sistema: 'SIRGAS 2000 / UTM 23S', ...patch });

describe('graus e radianos', () => {
  it('converte nos dois sentidos', () => {
    expect(grausParaRad(180)).toBeCloseTo(Math.PI, 12);
    expect(grausParaRad(90)).toBeCloseTo(Math.PI / 2, 12);
    expect(radParaGraus(Math.PI / 6)).toBe(30);
    expect(radParaGraus(grausParaRad(37.123456))).toBeCloseTo(37.123456, 9);
  });

  it('o formulário mostra graus e o modelo guarda radianos', () => {
    const l = localizacaoDoForm(form({ norteGraus: 45 }));
    expect(l.norteVerdadeiro).toBeCloseTo(Math.PI / 4, 12);
    const p = createEmptyProject();
    p.localizacao = l;
    expect(formDaLocalizacao(p).norteGraus).toBe(45);
  });
});

describe('formulário da localização', () => {
  it('projeto sem localização começa com tudo zero', () => {
    expect(formDaLocalizacao(createEmptyProject())).toEqual({ origemE: 0, origemN: 0, cotaZero: 0, norteGraus: 0, sistema: '' });
  });

  it('o sistema só entra no modelo se tiver texto', () => {
    expect('sistema' in localizacaoDoForm(form({ sistema: '   ' }))).toBe(false);
    expect(localizacaoDoForm(form({ sistema: ' UTM ' })).sistema).toBe('UTM');
  });

  it('validação ao vivo com a regra do modelo (números finitos)', () => {
    expect(problemaDoForm(form())).toBeNull();
    expect(problemaDoForm(form({ origemE: Number.NaN }))).toEqual(expect.any(String));
    expect(problemaDoForm(form({ norteGraus: Number.POSITIVE_INFINITY }))).toEqual(expect.any(String));
    expect(problemaDoForm(form({ cotaZero: Number.NaN }), 'en')).toEqual(expect.any(String));
  });

  it('formEhZero e formMudou', () => {
    const p = createEmptyProject();
    expect(formEhZero(formDaLocalizacao(p))).toBe(true);
    expect(formMudou(formDaLocalizacao(p), p)).toBe(false);
    expect(formMudou(form(), p)).toBe(true);
    expect(formEhZero(form())).toBe(false);
  });
});

describe('aplicar', () => {
  it('grava setLocalizacao em um passo de desfazer, com o norte em radianos', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(aplicarLocalizacao(s, form(), 'Definir')).toBeNull();
    const l = localizacaoDe(s.project);
    expect(l.origemE).toBe(333000);
    expect(l.origemN).toBe(7394000);
    expect(l.cotaZero).toBe(740.5);
    expect(l.norteVerdadeiro).toBeCloseTo(Math.PI / 6, 12);
    expect(l.sistema).toBe('SIRGAS 2000 / UTM 23S');
    s.undo();
    expect(s.project.localizacao).toBeUndefined();
    s.redo();
    expect(s.project.localizacao?.origemE).toBe(333000);
  });

  it('tudo zero e sem sistema remove a localização (volta a ausente), também com desfazer', () => {
    const s = new ProjectStore(createEmptyProject());
    aplicarLocalizacao(s, form(), 'a');
    expect(comandoDeLocalizacao(form({ origemE: 0, origemN: 0, cotaZero: 0, norteGraus: 0, sistema: '' }))).toEqual({ type: 'setLocalizacao', localizacao: null });
    expect(aplicarLocalizacao(s, form({ origemE: 0, origemN: 0, cotaZero: 0, norteGraus: 0, sistema: '' }), 'b')).toBeNull();
    expect(s.project.localizacao).toBeUndefined();
    s.undo();
    expect(s.project.localizacao?.cotaZero).toBe(740.5);
  });

  it('formulário inválido devolve o problema e não muda o projeto nem o histórico', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(aplicarLocalizacao(s, form({ origemN: Number.NaN }), 'x')).toEqual(expect.any(String));
    expect(s.project.localizacao).toBeUndefined();
    s.undo();
    expect(s.project.localizacao).toBeUndefined();
  });
});
