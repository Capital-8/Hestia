import { describe, expect, it, vi } from 'vitest';
import {
  comModoApresentacao,
  limparPreparoApresentacao,
  registrarPreparoApresentacao,
} from './captureRegistry.ts';

describe('comModoApresentacao', () => {
  it('sem vista 3D registrada, devolve false e não roda a captura', () => {
    const fazer = vi.fn();
    expect(comModoApresentacao(fazer)).toBe(false);
    expect(fazer).not.toHaveBeenCalled();
  });

  it('roda a captura dentro do preparo da vista 3D registrada', () => {
    const dono = {};
    const preparo = vi.fn((fazer: () => void) => { fazer(); return true; });
    registrarPreparoApresentacao(dono, preparo);
    try {
      const fazer = vi.fn();
      expect(comModoApresentacao(fazer)).toBe(true);
      expect(preparo).toHaveBeenCalledTimes(1);
      expect(fazer).toHaveBeenCalledTimes(1);
    } finally {
      limparPreparoApresentacao(dono);
    }
  });

  it('o preparo que devolve false (cena não pronta) não deixa a captura rodar', () => {
    const dono = {};
    registrarPreparoApresentacao(dono, () => false);
    try {
      const fazer = vi.fn();
      expect(comModoApresentacao(fazer)).toBe(false);
      expect(fazer).not.toHaveBeenCalled();
    } finally {
      limparPreparoApresentacao(dono);
    }
  });

  it('um dono antigo não apaga o preparo registrado depois dele', () => {
    const antigo = {};
    const novo = {};
    registrarPreparoApresentacao(antigo, () => true);
    registrarPreparoApresentacao(novo, () => true);
    limparPreparoApresentacao(antigo);
    try {
      expect(comModoApresentacao(() => {})).toBe(true);
    } finally {
      limparPreparoApresentacao(novo);
    }
    expect(comModoApresentacao(() => {})).toBe(false);
  });
});
