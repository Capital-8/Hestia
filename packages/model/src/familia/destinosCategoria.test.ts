import { describe, expect, it } from 'vitest';
import { ROTULO_CATEGORIA } from './categorias.ts';
import { categoriasDaAba, categoriasDoPainel, DESTINO_DA_CATEGORIA, PAINEIS_FAMILIA, destinoDaFamilia } from './destinosCategoria.ts';
import type { CategoriaFamilia } from './tipos.ts';

/* Ficha J1: toda categoria tem destino e todo painel da faixa aponta para categorias que existem. */

const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaFamilia[];

describe('destino das categorias na faixa', () => {
  it('toda categoria tem destino, e a tabela não tem categoria que não existe', () => {
    expect(Object.keys(DESTINO_DA_CATEGORIA).sort()).toEqual([...CATEGORIAS].sort());
  });
  it('todo painel declarado tem ao menos uma categoria, e o painel pertence à aba que declara', () => {
    for (const p of PAINEIS_FAMILIA) {
      const cats = categoriasDoPainel(p.id);
      expect(cats.length, p.id).toBeGreaterThan(0);
      for (const c of cats) expect(DESTINO_DA_CATEGORIA[c].aba, `${p.id}/${c}`).toBe(p.aba);
    }
  });
  it('todo painel usado por alguma categoria está na lista de painéis', () => {
    const declarados = new Set(PAINEIS_FAMILIA.map((p) => p.id));
    for (const c of CATEGORIAS) expect(declarados.has(DESTINO_DA_CATEGORIA[c].painel), c).toBe(true);
  });
  it('o roteiro da fase 2: hidráulica, elétrico, HVAC em Sistemas; perfis e chapas em Estrutura; móveis em Arquitetura', () => {
    expect(categoriasDoPainel('hidraulica')).toEqual(['tubulacao', 'conexao_tubo', 'terminal_hidraulico', 'reservatorio']);
    expect(categoriasDoPainel('eletrico')).toEqual(['eletroduto', 'dispositivo_eletrico', 'luminaria']);
    expect(categoriasDoPainel('hvac')).toEqual(['duto', 'terminal_ar']);
    expect(categoriasDoPainel('perfis')).toEqual(['perfil_estrutural']);
    expect(categoriasDoPainel('chapas')).toEqual(['chapa_estrutural']);
    expect(categoriasDoPainel('componentes')).toEqual(['marcenaria', 'mobiliario', 'loucas', 'equipamento', 'generico']);
    expect(categoriasDaAba('sistemas')).toHaveLength(9);
  });
  it('destinoDaFamilia lê a mesma tabela', () => {
    expect(destinoDaFamilia('conexao_tubo')).toEqual({ aba: 'sistemas', painel: 'hidraulica' });
  });
});
