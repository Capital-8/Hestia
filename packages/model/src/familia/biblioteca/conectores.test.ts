import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from '../exemplos.ts';
import { validarFamilia } from '../validar.ts';
import { BIBLIOTECA_BASE } from './index.ts';

/*
 * Conectores da biblioteca base (ficha CONECT-biblioteca): todas as famílias ganham os pontos de encaixe laterais e, com
 * exceção da gaveta (módulo de apoio sem fundo), também o conector de fundo voltado para a parede.
 */

/** Etiqueta esperada de cada família, conforme a tabela da ficha. */
const ETIQUETAS: Record<string, string> = {
  fam_armario_baixo: 'base',
  fam_base_gavetas: 'base',
  fam_base_pia: 'base',
  fam_base_cooktop: 'base',
  fam_canto_l: 'base',
  fam_armario_lavanderia: 'base',
  fam_gabinete_banheiro: 'base',
  fam_aereo: 'aereo',
  fam_aereo_basculante: 'aereo',
  fam_torre_forno: 'torre',
  fam_paneleiro: 'torre',
  fam_guarda_roupa_modulo: 'torre',
  fam_guarda_roupa_conjunto: 'torre',
  fam_estante: 'torre',
  fam_comoda: 'movel',
  fam_criado_mudo: 'movel',
  fam_cama_bau: 'movel',
  fam_rack: 'movel',
  fam_mesa_gaveteiro: 'movel',
  fam_escrivaninha: 'movel',
  fam_mesa: 'movel',
  fam_banco: 'movel',
  fam_painel_tv: 'painel',
  fam_painel_ripado: 'painel',
  fam_prateleira: 'painel',
  fam_modulo_branco: 'modulo',
  fam_bloco_livre: 'modulo',
  fam_gaveta: 'peca',
};

const FAMILIAS = [FAMILIA_ARMARIO, ...BIBLIOTECA_BASE.filter((f) => f.id !== FAMILIA_ARMARIO.id)];

describe('conectores da biblioteca', () => {
  it('cobre exatamente as famílias da tabela', () => {
    expect(FAMILIAS.map((f) => f.id).sort()).toEqual(Object.keys(ETIQUETAS).sort());
  });

  it('cada família tem os conectores na ordem e com as etiquetas da tabela', () => {
    for (const familia of FAMILIAS) {
      const etiqueta = ETIQUETAS[familia.id]!;
      const ids = familia.id === 'fam_gaveta' ? ['cesq', 'cdir'] : ['cesq', 'cdir', 'cfundo'];
      expect(familia.conectores, familia.id).toHaveLength(ids.length);
      expect(familia.conectores!.map((c) => c.id), familia.id).toEqual(ids);
      expect(new Set(familia.conectores!.map((c) => c.id)).size, familia.id).toBe(ids.length);
      for (const conector of familia.conectores!) {
        expect(conector.etiqueta, `${familia.id}:${conector.id}`).toBe(etiqueta);
      }
    }
  });

  it('laterais aceitam a própria etiqueta e painel; o fundo aceita parede', () => {
    for (const familia of FAMILIAS) {
      const etiqueta = ETIQUETAS[familia.id]!;
      const porId = new Map(familia.conectores!.map((c) => [c.id, c]));
      expect(porId.get('cesq')!.lado).toBe('esquerda');
      expect(porId.get('cdir')!.lado).toBe('direita');
      expect(porId.get('cesq')!.aceita).toEqual([etiqueta, 'painel']);
      expect(porId.get('cdir')!.aceita).toEqual([etiqueta, 'painel']);
      if (familia.id !== 'fam_gaveta') {
        expect(porId.get('cfundo')!.lado).toBe('fundo');
        expect(porId.get('cfundo')!.aceita).toEqual(['parede']);
      }
    }
  });

  it('validarFamilia continua sem erros', () => {
    for (const familia of FAMILIAS) {
      const erros = validarFamilia(familia).filter((p) => p.nivel === 'erro');
      expect(erros, familia.id).toEqual([]);
    }
  });
});
