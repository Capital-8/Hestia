import { describe, expect, it } from 'vitest';
import {
  adicionarCota,
  adicionarDetalhe,
  criarDetalhePadrao,
  editarCota,
  editarCotaDirigida,
  editarDetalhe,
  excluirCota,
  excluirDetalhe,
  valorDaCotaParaParametro,
} from './edicao.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { HistoricoFamilia } from './historico.ts';
import type { Familia } from './tipos.ts';
import type { CotaFamilia } from './tiposRepresentacao.ts';
import { validarFamilia } from './validar.ts';
import { validarDetalhes } from './validarDetalhes.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const cotaL: CotaFamilia = { id: 'cL', de: { tipo: 'plano', id: 'pEsq' }, ate: { tipo: 'plano', id: 'pDir' }, parametro: 'L' };

/** Família com o detalhe `d1` e a cota dirigida `cL` (largura entre os planos esquerdo e direito). */
const comDetalhe = (): Familia => {
  const f = nova();
  expect(adicionarDetalhe(f, criarDetalhePadrao('d1', 'Planta'))).toBeNull();
  expect(adicionarCota(f, 'd1', cotaL)).toBeNull();
  return f;
};

/** A operação recusa, e a família fica exatamente como estava. */
const intacta = (f: Familia, fn: (g: Familia) => string | null): string => {
  const antes = JSON.stringify(f);
  const motivo = fn(f);
  expect(motivo).not.toBeNull();
  expect(JSON.stringify(f)).toBe(antes);
  return motivo ?? '';
};

describe('detalhes e cotas: edição', () => {
  it('família do exemplo continua sem problemas depois de adicionar detalhe e cota', () => {
    const f = comDetalhe();
    expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
  });

  it('adicionar, editar e excluir detalhe', () => {
    const f = comDetalhe();
    expect(editarDetalhe(f, 'd1', { nome: 'Planta geral', escala: 50 })).toBeNull();
    expect(f.detalhes?.[0]).toMatchObject({ nome: 'Planta geral', escala: 50 });
    expect(editarDetalhe(f, 'd1', { vista: 'corte', plano: { eixo: 'y', posicao: 'P / 2' } })).toBeNull();
    expect(excluirDetalhe(f, 'd1')).toBeNull();
    expect(f.detalhes).toEqual([]);
  });

  it('recusas de detalhe', () => {
    const f = comDetalhe();
    expect(intacta(f, (g) => adicionarDetalhe(g, criarDetalhePadrao('d1', 'Outra')))).toMatch(/repetido/);
    expect(intacta(f, (g) => adicionarDetalhe(g, { ...criarDetalhePadrao('d2', 'X'), escala: 0 }))).toMatch(/escala/);
    expect(intacta(f, (g) => editarDetalhe(g, 'd1', { simbolos: ['nao_existe'] }))).toMatch(/não existe/);
    expect(intacta(f, (g) => editarDetalhe(g, 'nada', { nome: 'x' }))).toMatch(/não existe/);
    expect(intacta(f, (g) => excluirDetalhe(g, 'nada'))).toMatch(/não existe/);
  });

  it('editar e excluir cota; referência inexistente é recusada', () => {
    const f = comDetalhe();
    expect(editarCota(f, 'd1', 'cL', { deslocamento: '100', parametro: undefined })).toBeNull();
    expect(f.detalhes?.[0]?.cotas?.[0]).toEqual({ ...cotaL, deslocamento: '100', parametro: undefined });
    expect('parametro' in (f.detalhes?.[0]?.cotas?.[0] ?? {})).toBe(false);
    expect(intacta(f, (g) => editarCota(g, 'd1', 'cL', { ate: { tipo: 'plano', id: 'nao' } }))).toMatch(/plano/);
    expect(intacta(f, (g) => adicionarCota(g, 'd1', { ...cotaL }))).toMatch(/repetido/);
    expect(excluirCota(f, 'd1', 'cL')).toBeNull();
    expect(intacta(f, (g) => excluirCota(g, 'd1', 'cL'))).toMatch(/não existe/);
  });

  it('cota não dirige parâmetro calculado por fórmula nem não numérico', () => {
    const f = comDetalhe();
    expect(intacta(f, (g) => adicionarCota(g, 'd1', { ...cotaL, id: 'c2', parametro: 'zLateral' }))).toMatch(/fórmula/);
    expect(intacta(f, (g) => adicionarCota(g, 'd1', { ...cotaL, id: 'c3', parametro: 'corpo' }))).toMatch(/numérico/);
  });
});

describe('validarDetalhes', () => {
  it('sem detalhes não há problema; lista corrompida vira problema sem lançar', () => {
    expect(validarDetalhes(nova())).toEqual([]);
    const ruim = { ...nova(), detalhes: 'x' } as unknown as Familia;
    expect(validarDetalhes(ruim)[0]?.codigo).toBe('tipo');
    const lixo = { ...nova(), detalhes: [null, 3, { id: 7 }] } as unknown as Familia;
    expect(() => validarDetalhes(lixo)).not.toThrow();
    expect(validarDetalhes(lixo).length).toBeGreaterThan(2);
  });

  it('acusa vista, escala, plano de corte, fórmulas e referências ruins', () => {
    const f = nova();
    f.detalhes = [
      { id: 'a', nome: 'A', vista: 'planta', escala: 20 },
      { id: 'a', nome: 'B', vista: 'x' as never, escala: -1, plano: { eixo: 'w' as never, posicao: '1 +' } },
      { id: 'c', nome: 'C', vista: 'planta', escala: 20, cotas: [{ id: 'k', de: { tipo: 'ponto', ponto: ['q', '0', '0'] }, ate: { tipo: 'ligacao', id: 'nao' }, texto: '(' }] },
    ];
    const codigos = validarDetalhes(f).map((p) => `${p.codigo}@${p.onde}`);
    expect(codigos).toContain('id_duplicado@detalhe:a');
    expect(codigos).toContain('tipo@detalhe:a.vista');
    expect(codigos).toContain('faixa@detalhe:a.escala');
    expect(codigos).toContain('tipo@detalhe:a.plano.eixo');
    expect(codigos).toContain('formula@detalhe:a.plano.posicao');
    expect(codigos).toContain('referencia@detalhe:c.cota:k.de.ponto[0]');
    expect(codigos).toContain('referencia@detalhe:c.cota:k.ate');
    expect(codigos).toContain('formula@detalhe:c.cota:k.texto');
  });

  it('validarFamilia inclui a validação de detalhes', () => {
    const f = nova();
    f.detalhes = [{ id: 'a', nome: 'A', vista: 'planta', escala: 0 }];
    expect(validarFamilia(f).some((p) => p.onde === 'detalhe:a.escala')).toBe(true);
  });
});

describe('cota dirigida', () => {
  it('valorDaCotaParaParametro devolve o valor e recusa fora de min/max', () => {
    const f = comDetalhe();
    const p = f.parametros.find((q) => q.id === 'L');
    expect(p?.min).toBeDefined();
    expect(valorDaCotaParaParametro(cotaL, 1200, f)).toEqual({ ok: true, parametro: 'L', valor: 1200 });
    const min = p?.min ?? 0;
    const max = p?.max ?? 0;
    expect(valorDaCotaParaParametro(cotaL, min - 1, f)).toMatchObject({ ok: false });
    expect(valorDaCotaParaParametro(cotaL, max + 1, f)).toMatchObject({ ok: false });
    expect(valorDaCotaParaParametro(cotaL, Number.NaN, f)).toMatchObject({ ok: false });
    expect(valorDaCotaParaParametro({ ...cotaL, parametro: undefined }, 1200, f)).toMatchObject({ ok: false });
  });

  it('editar a cota altera L; desfazer volta e refazer reaplica', () => {
    const h = new HistoricoFamilia<Familia>(comDetalhe());
    const antes = h.atual.parametros.find((q) => q.id === 'L')?.padrao;
    h.exec('Editar cota', (d) => {
      const erro = editarCotaDirigida(d, 'd1', 'cL', 1200);
      if (erro !== null) throw new Error(erro);
    });
    expect(h.atual.parametros.find((q) => q.id === 'L')?.padrao).toBe(1200);
    expect(h.desfazer()).toBe(true);
    expect(h.atual.parametros.find((q) => q.id === 'L')?.padrao).toBe(antes);
    expect(h.refazer()).toBe(true);
    expect(h.atual.parametros.find((q) => q.id === 'L')?.padrao).toBe(1200);
  });

  it('editarCotaDirigida recusa valor fora da faixa e cota inexistente, sem alterar a família', () => {
    const f = comDetalhe();
    const max = f.parametros.find((q) => q.id === 'L')?.max ?? 0;
    expect(intacta(f, (g) => editarCotaDirigida(g, 'd1', 'cL', max + 1))).toMatch(/máximo/);
    expect(intacta(f, (g) => editarCotaDirigida(g, 'd1', 'nada', 1000))).toMatch(/não existe/);
    expect(intacta(f, (g) => editarCotaDirigida(g, 'nada', 'cL', 1000))).toMatch(/não existe/);
  });
});
