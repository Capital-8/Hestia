import { describe, expect, it } from 'vitest';
import { devoAtivarPorMouse, type MouseActivationState } from './paneMouseActivation.ts';

const livre: MouseActivationState = { buttons: 0, dialogOpen: false, prompt: null, typed: '', pastePreview: false, ifcImporting: false, drawing: false };

describe('devoAtivarPorMouse', () => {
  it('livre: ativa', () => expect(devoAtivarPorMouse(livre)).toBe(true));
  it('botão pressionado: não', () => expect(devoAtivarPorMouse({ ...livre, buttons: 1 })).toBe(false));
  it('botão direito/meio (buttons 2 e 4): não', () => {
    expect(devoAtivarPorMouse({ ...livre, buttons: 2 })).toBe(false);
    expect(devoAtivarPorMouse({ ...livre, buttons: 4 })).toBe(false);
  });
  it('diálogo aberto: não', () => expect(devoAtivarPorMouse({ ...livre, dialogOpen: true })).toBe(false));
  it('prompt de medida: não; prompt vazio: sim', () => {
    expect(devoAtivarPorMouse({ ...livre, prompt: 'Comprimento' })).toBe(false);
    expect(devoAtivarPorMouse({ ...livre, prompt: '' })).toBe(true);
  });
  it('digitação em andamento: não', () => expect(devoAtivarPorMouse({ ...livre, typed: '2,5' })).toBe(false));
  it('colagem em prévia: não', () => expect(devoAtivarPorMouse({ ...livre, pastePreview: true })).toBe(false));
  it('importação IFC: não', () => expect(devoAtivarPorMouse({ ...livre, ifcImporting: true })).toBe(false));
  it('desenho em andamento: não', () => expect(devoAtivarPorMouse({ ...livre, drawing: true })).toBe(false));
});
