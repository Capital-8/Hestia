/*
 * Catálogo de marcenaria: chapas, fitas de borda e ferragens (ADR 0049 §3.3, método do Promob: chapa = material + espessura).
 * FICHA E5-catalogo: implementar as funções abaixo (os dados padrão e os tipos já estão prontos). Testes em `catalogo.test.ts`.
 * Medidas em MILÍMETROS; custos em reais (R$) por m² (chapa), por m (fita) e por unidade (ferragem). Funções puras.
 *
 * ATENÇÃO: os valores de `CATALOGO_PADRAO` (medidas da chapa bruta, refilo, custos, fita) são ILUSTRATIVOS e A VALIDAR com
 * fornecedor ou fabricante (ADR 0049 R5): o usuário os edita no catálogo do projeto.
 */

import { importarCatalogoInterno, mesclarCatalogoInterno } from './catalogoArquivo.ts';
import { validarCatalogoInterno } from './catalogoValidar.ts';

export const CATALOGO_FORMATO = 'hestia-catalogo';
export const CATALOGO_VERSAO = 1;
export const CATALOGO_LIMITES = { chapas: 200, fitas: 100, ferragens: 500 } as const;

export interface Chapa {
  /** Mesmo id usado como `valor` das opções de um parâmetro 'chapa' da família. */
  id: string;
  nome: string;
  /** Matéria-prima: 'MDF', 'MDP', 'compensado'… (texto livre). */
  material: string;
  /** Espessura nominal (mm). */
  espessura: number;
  /** Chapa bruta (mm): largura × altura. */
  largura: number;
  altura: number;
  /** Tem sentido de veio (a peça com `veio` 'a' ou 'b' obedece). */
  veio: boolean;
  /** Refilo: desconto em cada lado da chapa bruta (mm). */
  refilo: number;
  /** R$ por m². */
  custoM2?: number;
  /** Cor de tela "#rrggbb". */
  cor?: string;
}

export interface Fita {
  id: string;
  nome: string;
  /** Espessura da fita (mm) e altura/largura (mm). */
  espessura: number;
  altura: number;
  /** R$ por metro. */
  custoM?: number;
  cor?: string;
}

export interface FerragemCatalogo {
  id: string;
  nome: string;
  codigo?: string;
  /** R$ por unidade. */
  custo?: number;
  unidade: 'un' | 'par' | 'jogo' | 'm';
}

export interface Catalogo {
  chapas: Chapa[];
  fitas: Fita[];
  ferragens: FerragemCatalogo[];
}

export const CATALOGO_PADRAO: Catalogo = {
  chapas: [
    { id: 'mdf6', nome: 'MDF 6 mm', material: 'MDF', espessura: 6, largura: 2750, altura: 1850, veio: false, refilo: 10, custoM2: 38, cor: '#c9bfa8' },
    { id: 'mdf15', nome: 'MDF 15 mm', material: 'MDF', espessura: 15, largura: 2750, altura: 1850, veio: true, refilo: 10, custoM2: 75, cor: '#d8b98b' },
    { id: 'mdf18', nome: 'MDF 18 mm', material: 'MDF', espessura: 18, largura: 2750, altura: 1850, veio: true, refilo: 10, custoM2: 90, cor: '#d8b98b' },
    { id: 'mdf25', nome: 'MDF 25 mm', material: 'MDF', espessura: 25, largura: 2750, altura: 1850, veio: true, refilo: 10, custoM2: 125, cor: '#d8b98b' },
    { id: 'mdp15', nome: 'MDP 15 mm', material: 'MDP', espessura: 15, largura: 2750, altura: 1850, veio: false, refilo: 10, custoM2: 60, cor: '#e0d2b4' },
    { id: 'mdp18', nome: 'MDP 18 mm', material: 'MDP', espessura: 18, largura: 2750, altura: 1850, veio: false, refilo: 10, custoM2: 70, cor: '#e0d2b4' },
  ],
  fitas: [
    { id: 'fita_pvc_045', nome: 'Fita PVC 0,45 × 22', espessura: 0.45, altura: 22, custoM: 1.2 },
    { id: 'fita_pvc_1', nome: 'Fita PVC 1,0 × 22', espessura: 1, altura: 22, custoM: 2.4 },
    { id: 'fita_pvc_2', nome: 'Fita PVC 2,0 × 35', espessura: 2, altura: 35, custoM: 4.8 },
    { id: 'fita_pvc', nome: 'Fita PVC 0,45 × 22 (padrão das famílias)', espessura: 0.45, altura: 22, custoM: 1.2 },
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça 35 mm', unidade: 'un', custo: 6 },
    { id: 'corredica', nome: 'Corrediça telescópica 450', unidade: 'par', custo: 28 },
    { id: 'puxador', nome: 'Puxador 128 mm', unidade: 'un', custo: 12 },
    { id: 'pino', nome: 'Pino de prateleira', unidade: 'un', custo: 0.3 },
    { id: 'cavilha', nome: 'Cavilha 8 × 30', unidade: 'un', custo: 0.1 },
    { id: 'pe', nome: 'Pé regulável', unidade: 'un', custo: 4 },
    { id: 'minifix', nome: 'Parafuso minifix', unidade: 'jogo', custo: 2.5 },
  ],
};

export interface ProblemaCatalogo {
  codigo: 'id_invalido' | 'id_duplicado' | 'valor' | 'limite' | 'cor';
  mensagem: string;
  /** `chapa:id`, `fita:id` ou `ferragem:id` (com `.campo` quando cabe). */
  onde: string;
}

/**
 * Confere o catálogo. Regras (todas erro): id fora de /^[A-Za-z_][A-Za-z0-9_]*$/ ('id_invalido'); id repetido na mesma lista
 * ('id_duplicado'); `nome` vazio, espessura/largura/altura que não sejam número finito > 0, `refilo` negativo ou maior que a
 * metade da menor dimensão da chapa, custo negativo ou não finito, `unidade` fora das opções ('valor'); mais itens que
 * `CATALOGO_LIMITES` ('limite'; `onde: 'catalogo'`); `cor` que não seja "#rrggbb" ('cor'). `CATALOGO_PADRAO` tem de dar lista vazia.
 * Nunca lança: campo faltando vira problema.
 */
export function validarCatalogo(c: Catalogo): ProblemaCatalogo[] {
  return validarCatalogoInterno(c, CATALOGO_LIMITES);
}

export function chapaPorId(c: Catalogo, id: string): Chapa | undefined {
  return Array.isArray(c.chapas) ? c.chapas.find((ch) => ch.id === id) : undefined;
}

export function fitaPorId(c: Catalogo, id: string): Fita | undefined {
  return Array.isArray(c.fitas) ? c.fitas.find((f) => f.id === id) : undefined;
}

/**
 * Opções (`OpcaoParametro`) de um parâmetro 'chapa' a partir do catálogo: uma por chapa, `valor` = id, `rotulo` = nome, `esp` =
 * espessura. Com `somente` (lista de ids) filtra e mantém a ORDEM de `somente`, ignorando ids que não existem.
 */
export function opcoesDeChapa(c: Catalogo, somente?: readonly string[]): Array<{ valor: string; rotulo: string; esp: number }> {
  if (!Array.isArray(c.chapas)) return [];
  if (somente === undefined) {
    return c.chapas.map((ch) => ({ valor: ch.id, rotulo: ch.nome, esp: ch.espessura }));
  }
  const opcoes: Array<{ valor: string; rotulo: string; esp: number }> = [];
  for (const id of somente) {
    const ch = chapaPorId(c, id);
    if (ch !== undefined) opcoes.push({ valor: ch.id, rotulo: ch.nome, esp: ch.espessura });
  }
  return opcoes;
}

/** Área da chapa bruta útil em m2: `(largura - 2·refilo) × (altura - 2·refilo)` ÷ 1e6. */
export function areaUtilDaChapa(ch: Chapa): number {
  return ((ch.largura - 2 * ch.refilo) * (ch.altura - 2 * ch.refilo)) / 1e6;
}

export interface ArquivoCatalogo {
  formato: typeof CATALOGO_FORMATO;
  versao: number;
  catalogo: Catalogo;
}

export function exportarCatalogo(c: Catalogo): ArquivoCatalogo {
  return { formato: CATALOGO_FORMATO, versao: CATALOGO_VERSAO, catalogo: structuredClone(c) };
}

/**
 * Importa um arquivo `hestia-catalogo`. LANÇA `Error` em português se `dados` não é objeto, `formato` diferente, `versao` não inteira ou < 1,
 * `versao` maior que CATALOGO_VERSAO ("mais novo que este programa") ou `catalogo` sem as três listas. Itens ruins (campo de tipo errado,
 * id inválido ou repetido, chave `__proto__`/`constructor`/`prototype` em qualquer nível) são IGNORADOS e listados em `ignorados`
 * (`{ tipo: 'chapa'|'fita'|'ferragem', id: string, motivo: string }`); os bons entram como cópia profunda.
 */
export function importarCatalogo(dados: unknown): { catalogo: Catalogo; ignorados: Array<{ tipo: 'chapa' | 'fita' | 'ferragem'; id: string; motivo: string }> } {
  return importarCatalogoInterno(dados, {
    formato: CATALOGO_FORMATO,
    versao: CATALOGO_VERSAO,
    limites: CATALOGO_LIMITES,
  });
}

/** Junta `extra` a `base`: itens de `extra` cujo id já existe em `base` são ignorados (o de `base` vence); devolve cópia profunda e os ids ignorados. */
export function mesclarCatalogo(base: Catalogo, extra: Catalogo): { catalogo: Catalogo; ignorados: string[] } {
  return mesclarCatalogoInterno(base, extra);
}
