import { diagnosticarRede, TIPOS_TUBULACAO } from '@hestia/engine';
import { createEmptyProject, familiaDaBiblioteca, type Component } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { PT_CURVATURA, EN_CURVATURA, ES_CURVATURA, DE_CURVATURA, FR_CURVATURA, IT_CURVATURA, PL_CURVATURA } from '../editor/i18n/areas/redeCurvatura.ts';
import { I18N } from '../editor/i18n.ts';
import { csvQuantitativoEletrico, linhasQuantitativoEletrico } from './circuitos/quantitativosEletricosTexto.ts';
import { quantitativosEletricosDoProjeto } from '@hestia/engine';
import { textoDoDiagnostico } from './RedeDiagnostico.tsx';

/* Corrugado (ficha F2): texto do diagnóstico `curvatura_fechada` nas 7 línguas, linha do CSV e os tipos do painel Eletroduto. */

const LINGUAS = { pt: PT_CURVATURA, en: EN_CURVATURA, es: ES_CURVATURA, de: DE_CURVATURA, fr: FR_CURVATURA, it: IT_CURVATURA, pl: PL_CURVATURA } as const;
const preencher = (texto: string, p?: Record<string, string | number>): string => texto.replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? ''));

describe('curvatura_fechada na Verificar rede', () => {
  it('tem texto nas 7 línguas, com os mm necessários e disponíveis', () => {
    for (const [lang, dic] of Object.entries(LINGUAS)) {
      const t = ((k: string, p?: Record<string, string | number>) => preencher((dic as Record<string, string>)[k]!, p)) as never;
      const texto = textoDoDiagnostico({ codigo: 'curvatura_fechada', elementId: 'x', valor: 240, limite: 200 }, t, lang as 'pt', {});
      expect(texto).toContain('240');
      expect(texto).toContain('200');
      expect(texto.length).toBeGreaterThan(30);
    }
  });
  it('as sete línguas estão no dicionário do editor (chave rede_curvatura em cada uma)', () => {
    for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) expect((I18N[lang] as Record<string, string>).rede_curvatura, lang).toBeTruthy();
  });
});

describe('quantitativos elétricos: corrugado', () => {
  it('a linha "Eletroduto corrugado" sai na tabela e no CSV, por bitola, em m, sem curva nem luva', () => {
    const p = createEmptyProject();
    p.componentFamilies = { fam_tigre_tigreflex_amarelo: structuredClone(familiaDaBiblioteca('fam_tigre_tigreflex_amarelo')!) };
    const base = { kind: 'component', familyId: 'fam_tigre_tigreflex_amarelo', typeId: null, levelId: 'lv_0', order: 0, x: 0, y: 0, z: 1, rotation: 0, mirrored: false, mark: '' } as const;
    p.elements.t0 = { ...base, id: 't0', values: { L: 1500, DN: 20 } } as Component;
    p.elements.t1 = { ...base, id: 't1', values: { L: 2500, DN: 20 } } as Component;
    const linhas = linhasQuantitativoEletrico(quantitativosEletricosDoProjeto(p));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ grupo: 'Eletroduto corrugado', quantidade: 2, medida: 4, unidade: 'm' });
    expect(linhas[0]?.item).toContain('DN 20');
    expect(csvQuantitativoEletrico(linhas)).toContain('Eletroduto corrugado;');
    expect(csvQuantitativoEletrico(linhas)).toContain('DN 20;2;4;m');
  });
});

describe('painel Eletroduto', () => {
  it('oferece o tipo rígido e os dois corrugados (a lista do painel é a de TIPOS_TUBULACAO do domínio)', () => {
    const ids = TIPOS_TUBULACAO.filter((t) => t.dominio === 'eletroduto').map((t) => t.id);
    expect(ids).toEqual(['krona_eletroduto_pvc', 'tigreflex_corrugado', 'tigreflex_corrugado_reforcado']);
  });
  it('o diagnóstico do projeto vazio não acusa curvatura', () => {
    expect(diagnosticarRede(createEmptyProject()).filter((d) => d.codigo === 'curvatura_fechada')).toEqual([]);
  });
});
