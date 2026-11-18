import { CATALOGO_PADRAO, type Catalogo } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import {
  atualizarChapaEm,
  atualizarFerragemEm,
  atualizarFitaEm,
  editarChapaEm,
  editarFerragemEm,
  editarFitaEm,
} from './familiaCatalogo.ts';

const novo = (): Catalogo => structuredClone(CATALOGO_PADRAO);

describe('edição do catálogo recusa valores inválidos sem perder o anterior', () => {
  it('id repetido em chapa não entra', () => {
    const c = novo();
    const r = editarChapaEm(c, 1, 'id', 'mdf6');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/id repetido/);
    expect(atualizarChapaEm(c, 1, 'id', 'mdf6')).toBeNull();
    expect(c.chapas[1]?.id).toBe('mdf15');
  });

  it('espessura, largura e altura zero ou negativas não entram', () => {
    const c = novo();
    for (const campo of ['espessura', 'largura', 'altura'] as const) {
      expect(editarChapaEm(c, 0, campo, '0').ok).toBe(false);
      expect(editarChapaEm(c, 0, campo, '-5').ok).toBe(false);
    }
    expect(atualizarChapaEm(c, 0, 'espessura', '0')).toBeNull();
    expect(c.chapas[0]?.espessura).toBe(6);
  });

  it('preço zero ou negativo não entra, mas vazio remove o custo', () => {
    const c = novo();
    const zero = editarChapaEm(c, 0, 'custoM2', '0');
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.motivo).toMatch(/maior que zero/);
    expect(editarChapaEm(c, 0, 'custoM2', '-10').ok).toBe(false);
    const vazio = editarChapaEm(c, 0, 'custoM2', '');
    expect(vazio.ok).toBe(true);
    if (vazio.ok) expect(vazio.catalogo.chapas[0]?.custoM2).toBeUndefined();
  });

  it('edição válida devolve catálogo novo sem tocar no original', () => {
    const c = novo();
    const r = editarChapaEm(c, 0, 'espessura', '6,5');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.catalogo.chapas[0]?.espessura).toBe(6.5);
    expect(c.chapas[0]?.espessura).toBe(6);
  });

  it('fita e ferragem seguem a mesma regra', () => {
    const c = novo();
    expect(editarFitaEm(c, 0, 'espessura', '0').ok).toBe(false);
    expect(editarFitaEm(c, 0, 'custoM', '0').ok).toBe(false);
    expect(editarFitaEm(c, 1, 'id', 'fita_pvc_045').ok).toBe(false);
    expect(atualizarFitaEm(c, 0, 'altura', '-1')).toBeNull();

    expect(editarFerragemEm(c, 0, 'custo', '0').ok).toBe(false);
    expect(editarFerragemEm(c, 1, 'id', 'dobradica').ok).toBe(false);
    expect(atualizarFerragemEm(c, 0, 'custo', '0')).toBeNull();
  });
});
