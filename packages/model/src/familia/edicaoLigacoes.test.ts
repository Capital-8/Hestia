import { describe, expect, it } from 'vitest';
import {
  adicionarLigacao,
  criarLigacaoPadrao,
  duplicarLigacao,
  editarLigacao,
  espelharLigacaoEmX,
  excluirLigacao,
} from './edicao.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { validarLigacoes } from './validarLigacoes.ts';
import { LIMITES_LIGACAO, type Ligacao } from './tiposLigacao.ts';
import type { Familia } from './tipos.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);

/** A operação recusa, e a família fica exatamente como estava. */
const intacta = (f: Familia, fn: (g: Familia) => string | null): string => {
  const antes = JSON.stringify(f);
  const motivo = fn(f);
  expect(motivo).not.toBeNull();
  expect(JSON.stringify(f)).toBe(antes);
  return motivo ?? '';
};

const comLigacao = (f: Familia, id = 'agua'): Familia => {
  expect(adicionarLigacao(f, criarLigacaoPadrao('agua_fria', 'redonda', id))).toBeNull();
  return f;
};

describe('criarLigacaoPadrao', () => {
  it('redonda leva diâmetro; retangular leva largura e altura, sem o outro par', () => {
    const r = criarLigacaoPadrao('esgoto', 'redonda', 'r1');
    expect(r.diametro).toBeDefined();
    expect(r.largura).toBeUndefined();
    const t = criarLigacaoPadrao('eletrocalha', 'retangular', 't1');
    expect(t.largura).toBeDefined();
    expect(t.altura).toBeDefined();
    expect(t.diametro).toBeUndefined();
  });

  it('a ligação padrão é válida dentro de uma família', () => {
    for (const secao of ['redonda', 'retangular'] as const) {
      const f = nova();
      expect(adicionarLigacao(f, criarLigacaoPadrao('agua_quente', secao, 'p'))).toBeNull();
      expect(validarLigacoes(f).filter((p) => p.nivel === 'erro')).toEqual([]);
    }
  });
});

describe('adicionarLigacao', () => {
  it('acrescenta a ligação e cria a lista quando não há', () => {
    const f = nova();
    expect(f.ligacoes).toBeUndefined();
    expect(adicionarLigacao(f, criarLigacaoPadrao('agua_fria', 'redonda', 'agua'))).toBeNull();
    expect(f.ligacoes?.map((l) => l.id)).toEqual(['agua']);
  });

  it('recusa id repetido e deixa a família intacta', () => {
    const f = comLigacao(nova());
    const motivo = intacta(f, (g) => adicionarLigacao(g, criarLigacaoPadrao('esgoto', 'redonda', 'agua')));
    expect(motivo).toContain('id repetido');
  });

  it('recusa direção toda zero (vetor nulo) sem gravar', () => {
    const f = nova();
    const ruim: Ligacao = { ...criarLigacaoPadrao('gas', 'redonda', 'g'), direcao: ['0', '0', '0'] };
    intacta(f, (g) => adicionarLigacao(g, ruim));
  });

  it('recusa seção retangular sem altura', () => {
    const f = nova();
    const semAltura: Ligacao = { ...criarLigacaoPadrao('ar_insuflamento', 'retangular', 'd'), altura: undefined };
    intacta(f, (g) => adicionarLigacao(g, semAltura));
  });

  it('recusa o limite de ligações', () => {
    const f = nova();
    for (let k = 0; k < LIMITES_LIGACAO.ligacoes; k++) {
      expect(adicionarLigacao(f, criarLigacaoPadrao('agua_fria', 'redonda', `l${k}`))).toBeNull();
    }
    const motivo = intacta(f, (g) => adicionarLigacao(g, criarLigacaoPadrao('agua_fria', 'redonda', 'extra')));
    expect(motivo).toContain('limite');
  });
});

describe('editarLigacao', () => {
  it('troca os campos do patch e preserva o id', () => {
    const f = comLigacao(nova());
    expect(editarLigacao(f, 'agua', { nome: 'Ramal da cozinha', posicao: ['100', '0', '900'] })).toBeNull();
    const l = f.ligacoes?.[0];
    expect(l?.nome).toBe('Ramal da cozinha');
    expect(l?.posicao).toEqual(['100', '0', '900']);
    expect(l?.id).toBe('agua');
  });

  it('recusa trocar o id', () => {
    const f = comLigacao(nova());
    intacta(f, (g) => editarLigacao(g, 'agua', { id: 'outro' } as never));
  });

  it('recusa ligação inexistente', () => {
    const f = comLigacao(nova());
    const motivo = intacta(f, (g) => editarLigacao(g, 'nao_existe', { nome: 'x' }));
    expect(motivo).toContain('não existe');
  });

  it('remover a medida exigida pela seção é recusado', () => {
    const f = comLigacao(nova());
    intacta(f, (g) => editarLigacao(g, 'agua', { diametro: undefined }));
  });
});

describe('excluirLigacao', () => {
  it('remove a ligação pelo id', () => {
    const f = comLigacao(comLigacao(nova(), 'a'), 'b');
    expect(excluirLigacao(f, 'a')).toBeNull();
    expect(f.ligacoes?.map((l) => l.id)).toEqual(['b']);
  });

  it('recusa id inexistente', () => {
    const f = comLigacao(nova());
    intacta(f, (g) => excluirLigacao(g, 'zzz'));
  });
});

describe('duplicarLigacao', () => {
  it('copia logo após a original, com id livre e nome de cópia', () => {
    const f = comLigacao(comLigacao(nova(), 'agua'), 'esgoto');
    expect(duplicarLigacao(f, 'agua')).toBeNull();
    expect(f.ligacoes?.map((l) => l.id)).toEqual(['agua', 'agua_2', 'esgoto']);
    expect(f.ligacoes?.[1]?.nome).toBe('agua (cópia)');
    expect(f.ligacoes?.[1]?.dominio).toBe('agua_fria');
  });

  it('a cópia é independente da original', () => {
    const f = comLigacao(nova());
    duplicarLigacao(f, 'agua');
    const [original, copia] = f.ligacoes ?? [];
    expect(copia).not.toBe(original);
    expect(copia?.posicao).not.toBe(original?.posicao);
  });
});

describe('espelharLigacaoEmX', () => {
  it('troca o sinal de X na posição e na direção, e mantém o resto', () => {
    const f = nova();
    const base: Ligacao = {
      ...criarLigacaoPadrao('esgoto', 'redonda', 'esg'),
      posicao: ['150', '40', '300'],
      direcao: ['-1', '0', '0'],
    };
    expect(adicionarLigacao(f, base)).toBeNull();
    expect(espelharLigacaoEmX(f, 'esg')).toBeNull();
    const espelho = f.ligacoes?.[1];
    expect(espelho?.posicao).toEqual(['-150', '40', '300']);
    expect(espelho?.direcao).toEqual(['1', '0', '0']);
    expect(espelho?.dominio).toBe('esgoto');
    expect(espelho?.diametro).toBe(base.diametro);
  });

  it('fórmula em X vira negação entre parênteses; zero continua zero', () => {
    const f = nova();
    const base: Ligacao = { ...criarLigacaoPadrao('gas', 'redonda', 'g'), posicao: ['L / 2', '0', '0'], direcao: ['0', '0', '1'] };
    expect(adicionarLigacao(f, base)).toBeNull();
    expect(espelharLigacaoEmX(f, 'g')).toBeNull();
    expect(f.ligacoes?.[1]?.posicao).toEqual(['-(L / 2)', '0', '0']);
    expect(f.ligacoes?.[1]?.direcao).toEqual(['0', '0', '1']);
  });
});
