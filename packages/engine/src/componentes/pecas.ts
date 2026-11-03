import type { Eixo, Familia, PapelPeca, Valor } from '@hestia/model';

/*
 * CONTRATO das peças resolvidas (ADR 0049 §5.1). É a FRONTEIRA com o Rust: só números (metros, arredondados a 1 µm),
 * nada de texto de fórmula. O TEXTO da família é em milímetros; aqui tudo já está em METROS. TypeScript é a referência de
 * correção; o núcleo Rust (fatias C, D e E) recebe estas peças em colunas (ver `colunas.ts`).
 * Eixos locais: X largura, Y profundidade, Z altura. Origem = canto mínimo da caixa de cada peça.
 */

export interface PecaResolvida {
  /** Id da peça na família (várias peças repetidas compartilham o id e diferem em `indice`). */
  id: string;
  nome: string;
  /** 1..n quando a peça tem `repetir`; 1 caso contrário. */
  indice: number;
  papel: PapelPeca;
  /** Direção da espessura. */
  eixo: Eixo;
  vazio: boolean;
  /** Canto mínimo da caixa da peça (m). */
  origem: [number, number, number];
  /** As duas medidas no plano da chapa (m): eixo x → [profundidade, altura]; y → [largura, altura]; z → [largura, profundidade]. */
  tamanho: [number, number];
  espessura: number;
  /** Extensão nos eixos X, Y, Z (m): x → [esp, a, b]; y → [a, esp, b]; z → [a, b, esp]. */
  extensao: [number, number, number];
  /** Contorno poligonal no plano da chapa, pares (u, v) em m, anti-horário, origem no canto mínimo; `null` = retângulo `tamanho`. */
  contorno: number[] | null;
  /** Id de material do projeto ou id de chapa já resolvido (valor do parâmetro). */
  material: string | null;
  fita: { n?: string; s?: string; l?: string; o?: string } | null;
  veio: 'a' | 'b' | 'livre' | null;
  grupo: string | null;
  /** Id do `Aninhado` de que a peça veio (peças da própria família: `null`). */
  deAninhado: string | null;
}

export interface ErroResolucao {
  /** Mesmo formato de `Problema.onde` de `validarFamilia`: `peca:x.origem[0]`, `parametro:x.formula`... */
  onde: string;
  mensagem: string;
}

export interface EntradaResolucao {
  /** Tipo a usar; ausente = `tipoPadrao` da família; sem tipo, valem os `padrao` dos parâmetros. */
  tipoId?: string;
  /** Valores que sobrescrevem tipo e padrão (instância ou "Flexionar"); só parâmetros sem fórmula, em mm. */
  valores?: Readonly<Record<string, Valor>>;
  /** Busca famílias por id (para `aninhados`). Ausente = aninhado vira erro. */
  biblioteca?: (id: string) => Familia | undefined;
  /** Interno: profundidade de aninhamento corrente (limite `LIMITE_ANINHAMENTO`). */
  profundidade?: number;
}

export interface ResolucaoFamilia {
  pecas: PecaResolvida[];
  /** Nunca lança: tudo o que deu errado vem aqui e a peça (ou o aninhado) afetada fica de fora. */
  erros: ErroResolucao[];
  /** Valores finais de parâmetros, derivados e planos, em mm (para inspeção, validação e interface). */
  env: Record<string, Valor>;
}

/** Aninhamento máximo (família dentro de família dentro de…); acima disso é erro, nunca recursão infinita. */
export const LIMITE_ANINHAMENTO = 4;
