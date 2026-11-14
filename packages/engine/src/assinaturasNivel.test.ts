import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { assinaturasDoProjeto } from './assinaturasNivel.ts';
import { loteL1 } from './fixtureLote.ts';

describe('assinaturasDoProjeto: lote (ficha P2)', () => {
  it('adicionar ou editar o lote não muda a assinatura de nenhum nível nem a global', () => {
    const s = new ProjectStore(createEmptyProject());
    const a = assinaturasDoProjeto(s.project);
    s.exec({ type: 'addLot', lot: loteL1() });
    const b = assinaturasDoProjeto(s.project);
    s.exec({ type: 'updateLot', id: 'lote_l1', patch: { name: 'Outro' } });
    const c = assinaturasDoProjeto(s.project);
    for (const x of [b, c]) {
      expect(x.global).toBe(a.global);
      expect(x.horizontais).toBe(a.horizontais);
      expect([...x.nivel]).toEqual([...a.nivel]);
      expect([...x.nivelSemGuardaCorpo]).toEqual([...a.nivelSemGuardaCorpo]);
    }
  });
});
