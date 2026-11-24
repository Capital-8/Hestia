import type { QuantitativosMep } from '@hestia/engine';

/*
 * Parte lógica (pura) da seção "Instalações e estrutura" do orçamento do projeto (ficha I2, CONTRATO §6): achata
 * `orcamento.mep` em linhas por grupo, formata a medida (m, kg ou L) com vírgula decimal e monta o CSV no mesmo padrão
 * da lista de peças (separador `;`, texto entre aspas quando preciso). Textos traduzidos entram por parâmetro, para o
 * módulo continuar sem dependência do dicionário. Testes em `orcamentoMep.test.ts`.
 */

export type GrupoInstalacao = 'tubulacao' | 'conexoes' | 'reservatorios' | 'perfis' | 'eletrodutos';

export type UnidadeMedida = 'm' | 'kg' | 'L';

export interface LinhaInstalacao {
  grupo: GrupoInstalacao;
  /** Descrição do item ("DN 50", nome do tipo, "Ø 25"); `null` quando a instância não tem DN nem bitola. */
  item: string | null;
  quantidade: number;
  /** Comprimento total (m) na tubulação e eletrodutos, massa (kg) nos perfis, volume útil (L) nos reservatórios; `null` quando não há. */
  medida: number | null;
  unidade: UnidadeMedida | null;
}

export interface RotulosInstalacao {
  grupos: Readonly<Record<GrupoInstalacao, string>>;
  /** Texto do item sem DN nem bitola. */
  semIdentificacao: string;
  /** Cabeçalho do CSV: Grupo; Item; Quantidade; Medida; Unidade. */
  cabecalho: readonly string[];
}

/** Número com até `casas` decimais, vírgula decimal e sem zeros à direita: 3.5 vira "3,5", 2 vira "2". */
export function numeroMep(valor: number, casas: number): string {
  // units-ok: medidas fixas do CONTRATO §6 (m, kg, L); formatQuantity não tem grandeza de massa. Vírgula como na lista de peças (numeroSemZeros, interno ao engine).
  const [inteiro = '0', fracao = ''] = valor.toFixed(casas).split('.');
  const limpa = fracao.replace(/0+$/, '');
  return limpa === '' ? inteiro : `${inteiro},${limpa}`;
}

/** Medida com a unidade ("3,5 m", "31,4 kg", "250 L"); vazio quando o grupo não tem medida. */
export function textoMedidaInstalacao(linha: Pick<LinhaInstalacao, 'medida' | 'unidade'>): string {
  if (linha.medida === null || linha.unidade === null) return '';
  return `${numeroMep(linha.medida, 2)} ${linha.unidade}`;
}

/** Linhas do orçamento MEP, na ordem: tubulação (DN crescente), conexões, reservatórios, perfis, eletrodutos. */
export function linhasInstalacoes(mep: QuantitativosMep): LinhaInstalacao[] {
  const linhas: LinhaInstalacao[] = [];
  for (const l of mep.tubulacao) {
    linhas.push({ grupo: 'tubulacao', item: l.dn === null ? null : `DN ${numeroMep(l.dn, 0)}`, quantidade: l.trechos, medida: l.comprimentoM, unidade: 'm' });
  }
  for (const l of mep.conexoesTubo) {
    linhas.push({ grupo: 'conexoes', item: l.nome, quantidade: l.quantidade, medida: null, unidade: null });
  }
  for (const l of mep.reservatorios) {
    linhas.push({ grupo: 'reservatorios', item: l.nome, quantidade: l.quantidade, medida: l.volumeUtilL, unidade: l.volumeUtilL === null ? null : 'L' });
  }
  for (const l of mep.perfisEstruturais) {
    linhas.push({ grupo: 'perfis', item: l.nome, quantidade: l.quantidade, medida: l.massaKg, unidade: 'kg' });
  }
  for (const l of mep.eletrodutos) {
    linhas.push({ grupo: 'eletrodutos', item: l.bitola === null ? null : `Ø ${numeroMep(l.bitola, 0)}`, quantidade: l.trechos, medida: l.comprimentoM, unidade: 'm' });
  }
  return linhas;
}

/** Campo CSV: entre aspas duplas quando contém `;`, `"` ou quebra de linha (aspas duplicadas dentro). */
function campoCsv(valor: string): string {
  if (!/[;"\n\r]/.test(valor)) return valor;
  return `"${valor.replace(/"/g, '""')}"`;
}

/** CSV das instalações: separador `;`, decimal com vírgula, quebra `\n`, sem cabeçalho extra além do recebido. */
export function csvInstalacoes(linhas: readonly LinhaInstalacao[], rotulos: RotulosInstalacao): string {
  const corpo = linhas.map((l) => {
    const campos = [
      rotulos.grupos[l.grupo],
      l.item ?? rotulos.semIdentificacao,
      String(l.quantidade),
      l.medida === null ? '' : numeroMep(l.medida, 3),
      l.unidade ?? '',
    ];
    return campos.map(campoCsv).join(';');
  });
  return [rotulos.cabecalho.map(campoCsv).join(';'), ...corpo].join('\n');
}
