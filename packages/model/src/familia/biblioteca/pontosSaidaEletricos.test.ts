import { describe, expect, it } from 'vitest';
import { BIBLIOTECA_BASE, BIBLIOTECA_MEP } from './index.ts';
import type { Familia } from '../tipos.ts';

/*
 * Ficha F3 (pedido do dono: "todos os elementos elétricos precisam ter ponto para dar snap e facilitar sair com tubulação a partir
 * delas"): toda família elétrica tem pelo menos UMA ligação de eletroduto (ou de eletrocalha, a ligação das calhas, que têm domínio
 * próprio). Família nova que entrar na biblioteca elétrica sem ponto de saída reprova aqui. Quais famílias entram no teste vem do
 * próprio conteúdo (categoria, disciplina, domínio da ligação ou id), não de uma lista fixa.
 */

const CATEGORIAS = new Set(['eletroduto', 'dispositivo_eletrico', 'luminaria']);
const DOMINIOS = new Set(['eletroduto', 'eletrica_forca', 'eletrocalha']);
const TODAS: Familia[] = [...BIBLIOTECA_MEP, ...BIBLIOTECA_BASE];

/** Família elétrica: categoria elétrica, disciplina elétrica, alguma ligação de domínio elétrico ou id de peça elétrica. */
function ehEletrica(f: Familia): boolean {
  return CATEGORIAS.has(f.categoria) || f.disciplina === 'eletrico' || (f.ligacoes ?? []).some((l) => DOMINIOS.has(l.dominio)) || /eletr|tomada|interruptor|luminaria|quadro_distrib/.test(f.id);
}

/**
 * Exceções: família elétrica SEM ponto de eletroduto, com o motivo. Vazia de propósito: eletrodutos retos, curvas e luvas já têm duas
 * pontas (ligações `eletroduto`), eletrocalhas têm as pontas como ligação `eletrocalha`, e todo ponto, caixa e quadro tem entrada.
 */
const EXCECOES: Record<string, string> = {};

const ELETRICAS = TODAS.filter(ehEletrica);
const portas = (f: Familia) => (f.ligacoes ?? []).filter((l) => l.dominio === 'eletroduto' || l.dominio === 'eletrocalha');

describe('pontos de saída de eletroduto em toda família elétrica (F3)', () => {
  it('o levantamento acha as famílias elétricas esperadas (não pode ficar vazio nem perder as principais)', () => {
    const ids = new Set(ELETRICAS.map((f) => f.id));
    for (const id of ['fam_tomada_2p_t', 'fam_interruptor_simples', 'fam_luminaria_pendente', 'fam_luminaria_linear', 'fam_luminaria_arandela', 'fam_luminaria_plafon_redondo', 'fam_krona_eletrica_caixa_4x4', 'fam_quadro_distribuicao_eletrico', 'fam_eletrocalha_reta', 'fam_tomada', 'fam_interruptor', 'fam_luminaria_teto', 'fam_quadro_distribuicao', 'fam_tigre_tigreflex_amarelo']) expect(ids.has(id), id).toBe(true);
    expect(ELETRICAS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(ELETRICAS.map((f) => [f.id, f] as const))('%s tem pelo menos 1 ligação de eletroduto (ou de eletrocalha)', (id, f) => {
    if (EXCECOES[id]) return;
    expect(portas(f).length, `${id} sem ponto de saída de eletroduto`).toBeGreaterThanOrEqual(1);
  });

  it('as exceções são poucas, e cada uma tem motivo e existe de fato', () => {
    expect(Object.keys(EXCECOES).length).toBeLessThanOrEqual(3);
    for (const [id, motivo] of Object.entries(EXCECOES)) {
      expect(motivo.length).toBeGreaterThan(10);
      expect(TODAS.some((f) => f.id === id), id).toBe(true);
    }
  });

  it('todo ponto, luminária, caixa e quadro tem ligação de eletroduto com diâmetro e direção axial', () => {
    for (const f of ELETRICAS.filter((x) => x.categoria === 'dispositivo_eletrico' || x.categoria === 'luminaria' || /^fam_(tomada|interruptor|luminaria_teto|quadro_distribuicao)$/.test(x.id))) {
      const ls = f.ligacoes?.filter((l) => l.dominio === 'eletroduto') ?? [];
      expect(ls.length, f.id).toBeGreaterThanOrEqual(1);
      for (const l of ls) {
        expect(l.diametro, `${f.id}.${l.id} sem diâmetro`).toBeTruthy();
        expect(l.direcao.length, `${f.id}.${l.id}`).toBe(3);
      }
    }
  });

  it('pontos de parede e de teto oferecem mais de uma direção de saída (esquerda, direita, topo, base ou frente) em vez de só o fundo', () => {
    const multi = ['fam_tomada_2p_t', 'fam_interruptor_simples', 'fam_luminaria_plafon_redondo', 'fam_luminaria_arandela', 'fam_luminaria_teto'];
    for (const id of multi) {
      const f = TODAS.find((x) => x.id === id) as Familia;
      expect(portas(f).length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('a luminária de teto da biblioteca base ganhou as entradas de eletroduto (topo, esquerda e direita) sem perder o ponto de força', () => {
    const f = BIBLIOTECA_BASE.find((x) => x.id === 'fam_luminaria_teto') as Familia;
    expect((f.ligacoes ?? []).map((l) => l.id).sort()).toEqual(['eletroduto', 'eletroduto_dir', 'eletroduto_esq', 'forca']);
    expect(f.ligacoes?.find((l) => l.id === 'forca')?.dominio).toBe('eletrica_forca');
  });

  it('ids de ligação são únicos dentro de cada família elétrica', () => {
    for (const f of ELETRICAS) {
      const ids = (f.ligacoes ?? []).map((l) => l.id);
      expect(new Set(ids).size, f.id).toBe(ids.length);
    }
  });
});
