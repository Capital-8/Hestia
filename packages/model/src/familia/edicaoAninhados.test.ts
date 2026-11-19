import { describe, expect, it } from 'vitest';
import { adicionarAninhado, editarAninhado, excluirAninhado } from './edicao.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { HistoricoFamilia } from './historico.ts';
import type { Aninhado, Familia } from './tipos.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const aninhado = (extra: Partial<Aninhado> = {}): Aninhado => ({
  id: 'mod',
  nome: 'Módulo',
  familiaId: 'fam_gaveta',
  valores: {},
  origem: ['0', '0', '0'],
  ...extra,
});
const intacta = (f: Familia, fn: (g: Familia) => string | null): string => {
  const antes = JSON.stringify(f);
  const resultado = fn(f);
  expect(resultado).not.toBeNull();
  expect(JSON.stringify(f)).toBe(antes);
  return resultado!;
};

describe('adicionarAninhado', () => {
  it('acrescenta ao fim e cria a lista quando ela não existe', () => {
    const f = nova();
    expect(adicionarAninhado(f, aninhado())).toBeNull();
    expect(f.aninhados.map((a) => a.id)).toEqual(['mod']);

    const semLista = { ...nova(), aninhados: undefined } as unknown as Familia;
    expect(adicionarAninhado(semLista, aninhado({ id: 'outro' }))).toBeNull();
    expect(semLista.aninhados.map((a) => a.id)).toEqual(['outro']);
  });

  it('recusa objeto inválido e lista de aninhados inválida', () => {
    const f = nova();
    expect(adicionarAninhado(f, null as unknown as Aninhado)).toMatch(/inválido/);
    const ruim = { ...nova(), aninhados: 42 } as unknown as Familia;
    expect(adicionarAninhado(ruim, aninhado())).toMatch(/lista de aninhados/);
  });

  it('recusa id vazio ou repetido (entre aninhados e peças)', () => {
    const f = nova();
    expect(adicionarAninhado(f, aninhado())).toBeNull();
    intacta(f, (g) => adicionarAninhado(g, aninhado()));
    intacta(nova(), (g) => adicionarAninhado(g, aninhado({ id: '   ' })));
    intacta(nova(), (g) => adicionarAninhado(g, aninhado({ id: 'latE' })));
  });

  it('recusa nome vazio, familiaId vazio ou igual ao da própria família', () => {
    intacta(nova(), (g) => adicionarAninhado(g, aninhado({ nome: '   ' })));
    intacta(nova(), (g) => adicionarAninhado(g, aninhado({ familiaId: '' })));
    intacta(nova(), (g) => adicionarAninhado(g, aninhado({ familiaId: g.id })));
  });

  it('recusa rotação literal fora de 0/90/180/270 e aceita 90 e fórmula', () => {
    intacta(nova(), (g) => adicionarAninhado(g, aninhado({ rotacao: '45' })));

    const f = nova();
    expect(adicionarAninhado(f, aninhado({ id: 'a', rotacao: '90' }))).toBeNull();
    expect(adicionarAninhado(f, aninhado({ id: 'b', rotacao: 'giro' }))).toBeNull();
    expect(f.aninhados.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('editarAninhado', () => {
  it('troca só os campos presentes; valores e origem substituídos por inteiro; tipoId sai com undefined', () => {
    const f = nova();
    expect(adicionarAninhado(f, aninhado({ tipoId: 'baixa', valores: { L: '500' } }))).toBeNull();

    expect(editarAninhado(f, 'mod', { nome: 'Gaveta alta' })).toBeNull();
    const soNome = f.aninhados[0]!;
    expect(soNome.nome).toBe('Gaveta alta');
    expect(soNome.familiaId).toBe('fam_gaveta');
    expect(soNome.valores).toEqual({ L: '500' });

    expect(editarAninhado(f, 'mod', {
      familiaId: 'fam_gaveta',
      tipoId: undefined,
      valores: { A: '200' },
      origem: ['1', '2', '3'],
      rotacao: '180',
    })).toBeNull();
    const a = f.aninhados[0]!;
    expect('tipoId' in a).toBe(false);
    expect(a.valores).toEqual({ A: '200' });
    expect(a.origem).toEqual(['1', '2', '3']);
    expect(a.rotacao).toBe('180');
  });

  it('recusa patch inválido, inexistente e os mesmos erros do adicionar, sem alterar', () => {
    const f = nova();
    expect(adicionarAninhado(f, aninhado())).toBeNull();

    expect(editarAninhado(f, 'mod', null as unknown as Partial<Omit<Aninhado, 'id'>>)).toMatch(/patch/);
    expect(editarAninhado(f, 'naoExiste', { nome: 'X' })).toMatch(/não existe/);
    intacta(f, (g) => editarAninhado(g, 'mod', { nome: '   ' }));
    intacta(f, (g) => editarAninhado(g, 'mod', { familiaId: '' }));
    intacta(f, (g) => editarAninhado(g, 'mod', { familiaId: g.id }));
    intacta(f, (g) => editarAninhado(g, 'mod', { rotacao: '45' }));
  });
});

describe('excluirAninhado', () => {
  it('remove o módulo e recusa inexistente sem alterar', () => {
    const f = nova();
    expect(adicionarAninhado(f, aninhado())).toBeNull();
    expect(excluirAninhado(f, 'mod')).toBeNull();
    expect(f.aninhados).toEqual([]);
    intacta(f, (g) => excluirAninhado(g, 'mod'));
  });
});

describe('edições dentro do HistoricoFamilia', () => {
  it('adicionar, editar e excluir com desfazer e refazer', () => {
    const h = new HistoricoFamilia<Familia>(nova());

    h.exec('Adicionar módulo', (r) => {
      expect(adicionarAninhado(r, aninhado())).toBeNull();
    });
    expect(h.atual.aninhados.map((a) => a.id)).toEqual(['mod']);
    expect(h.desfazer()).toBe(true);
    expect(h.atual.aninhados).toEqual([]);
    expect(h.refazer()).toBe(true);
    expect(h.atual.aninhados).toHaveLength(1);

    h.exec('Editar módulo', (r) => {
      expect(editarAninhado(r, 'mod', { nome: 'Módulo alto' })).toBeNull();
    });
    expect(h.atual.aninhados[0]!.nome).toBe('Módulo alto');
    expect(h.desfazer()).toBe(true);
    expect(h.atual.aninhados[0]!.nome).toBe('Módulo');
    expect(h.refazer()).toBe(true);
    expect(h.atual.aninhados[0]!.nome).toBe('Módulo alto');

    h.exec('Excluir módulo', (r) => {
      expect(excluirAninhado(r, 'mod')).toBeNull();
    });
    expect(h.atual.aninhados).toEqual([]);
    expect(h.desfazer()).toBe(true);
    expect(h.atual.aninhados).toHaveLength(1);
    expect(h.refazer()).toBe(true);
    expect(h.atual.aninhados).toEqual([]);
  });
});
