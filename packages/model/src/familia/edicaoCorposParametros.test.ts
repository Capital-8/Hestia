import { describe, expect, it } from 'vitest';
import { adicionarParametro, excluirParametro, renomearParametro, usosDoNome } from './edicao.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import type { Familia, Parametro } from './tipos.ts';
import type { Corpo } from './tiposCorpo.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const intacta = (f: Familia, fn: (f: Familia) => string | null): string => {
  const antes = JSON.stringify(f);
  const r = fn(f);
  expect(r).not.toBeNull();
  expect(JSON.stringify(f)).toBe(antes);
  return r!;
};

const D: Parametro = { id: 'D', nome: 'Diâmetro', tipo: 'comprimento', escopo: 'instancia', padrao: 50 };

/** Família com um tubo (perfil circular e origem em D) e um caminho varrido com `repetir` em D. */
const comCorpos = (): Familia => {
  const f = nova();
  f.parametros.push(structuredClone(D));
  const tubo: Corpo = {
    id: 'tubo',
    nome: 'Tubo',
    papel: 'tubo',
    forma: { tipo: 'extrusao', comprimento: 'L', perfil: { tipo: 'circulo', diametro: 'D' } },
    quadro: { origem: ['D', '0', '0'] },
  };
  const caminho: Corpo = {
    id: 'caminho',
    nome: 'Caminho',
    papel: 'tubo',
    forma: {
      tipo: 'varredura',
      perfil: { tipo: 'circulo', diametro: 'D' },
      caminho: { pontos: [['0', '0', '0'], ['0', '0', 'L']] },
    },
    quadro: { origem: ['0', '0', '0'] },
    repetir: 'D > 0 ? 1 : 0',
  };
  f.corpos = [tubo, caminho];
  return f;
};

describe('renomear e excluir parâmetro enxergam as fórmulas dos corpos (ficha A2b)', () => {
  it('renomear D para DN atualiza perfil circular, caminho e repetir', () => {
    const f = comCorpos();
    expect(renomearParametro(f, 'D', 'DN')).toBeNull();
    const [tubo, caminho] = f.corpos!;
    expect(tubo!.quadro.origem[0]).toBe('DN');
    expect(tubo!.forma).toEqual({ tipo: 'extrusao', comprimento: 'L', perfil: { tipo: 'circulo', diametro: 'DN' } });
    expect(caminho!.forma).toEqual({
      tipo: 'varredura',
      perfil: { tipo: 'circulo', diametro: 'DN' },
      caminho: { pontos: [['0', '0', '0'], ['0', '0', 'L']] },
    });
    // `renomearNoTexto` reescreve a fórmula na forma canônica (parênteses no que vem antes do `?`).
    expect(caminho!.repetir).toBe('(DN > 0) ? 1 : 0');
  });

  it('excluir parâmetro usado em corpo é recusado, cita o corpo e deixa a família intacta', () => {
    const f = comCorpos();
    const motivo = intacta(f, (g) => excluirParametro(g, 'D'));
    expect(motivo).toContain('corpo:tubo.quadro.origem[0]');
    expect(usosDoNome(f, 'D')).toContain('corpo:caminho.repetir');
  });

  it('família sem corpos não muda', () => {
    const f = nova();
    expect(f.corpos).toBeUndefined();
    const antes = JSON.stringify(f);
    expect(usosDoNome(f, 'corpo').some((onde) => onde.startsWith('corpo:'))).toBe(false);
    expect(JSON.stringify(f)).toBe(antes);
  });

  it('desfazer (renomear de volta) restaura os campos dos corpos', () => {
    const f = comCorpos();
    const [tuboAntes, caminhoAntes] = structuredClone(f.corpos)!;
    expect(renomearParametro(f, 'D', 'DN')).toBeNull();
    expect(renomearParametro(f, 'DN', 'D')).toBeNull();
    const [tubo, caminho] = f.corpos!;
    expect(tubo).toEqual(tuboAntes);
    expect(caminho!.forma).toEqual(caminhoAntes!.forma);
    expect(caminho!.quadro).toEqual(caminhoAntes!.quadro);
    // A fórmula volta com o nome original, na forma canônica que o renomear produz.
    expect(caminho!.repetir).toBe('(D > 0) ? 1 : 0');
  });

  it('nomes reservados (PI e funções da linguagem) são recusados ao renomear e ao adicionar', () => {
    const f = comCorpos();
    for (const reservado of ['PI', 'sin', 'busca', 'atan2']) {
      expect(renomearParametro(f, 'D', reservado), reservado).toMatch(/reservado/);
    }
    expect(adicionarParametro(f, { ...D, id: 'PI' })).toMatch(/reservado/);
    expect(f.parametros.some((p) => p.id === 'D')).toBe(true);
  });
});

describe('Corpo.material enxerga renomear e excluir parâmetro (ficha I3)', () => {
  const comMaterialDeCorpo = (): Familia => {
    const f = nova();
    f.parametros.push({ id: 'MAT', nome: 'Material', tipo: 'material', escopo: 'tipo', padrao: 'inox' });
    f.corpos = [{
      id: 'tubo',
      nome: 'Tubo',
      papel: 'tubo',
      forma: { tipo: 'extrusao', comprimento: 'L', perfil: { tipo: 'circulo', diametro: '50' } },
      quadro: { origem: ['0', '0', '0'] },
      material: 'MAT',
    }];
    return f;
  };

  it('renomear o parâmetro reescreve Corpo.material', () => {
    const f = comMaterialDeCorpo();
    expect(renomearParametro(f, 'MAT', 'AÇO')).toMatch(/id inválido/);
    expect(renomearParametro(f, 'MAT', 'MATERIAL_CORPO')).toBeNull();
    expect(f.corpos![0]!.material).toBe('MATERIAL_CORPO');
    expect(usosDoNome(f, 'MATERIAL_CORPO')).toContain('corpo:tubo.material');
  });

  it('excluir parâmetro usado em Corpo.material é recusado e cita o corpo', () => {
    const f = comMaterialDeCorpo();
    const motivo = intacta(f, (g) => excluirParametro(g, 'MAT'));
    expect(motivo).toContain('corpo:tubo.material');
    expect(f.corpos![0]!.material).toBe('MAT');
  });

  it('corpo sem material não bloqueia a exclusão', () => {
    const f = comMaterialDeCorpo();
    delete f.corpos![0]!.material;
    expect(excluirParametro(f, 'MAT')).toBeNull();
  });
});
