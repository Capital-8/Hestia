import type { Catalogo, Chapa, FerragemCatalogo, Fita } from './catalogo.ts';
import { custoValido, ehObjetoSimples, idValido, numeroFinito, textoNaoVazio, varreduraProibida } from './catalogoComum.ts';
import { motivoDoItem, type LimitesCatalogo } from './catalogoValidar.ts';

/*
 * Importação, mesclagem e conferência de itens do catálogo de marcenaria (ficha E5-catalogo). A importação é defensiva:
 * só os casos fatais do formato lançam; item ruim vira linha de `ignorados` com motivo, e o bom entra como cópia profunda.
 */

type TipoItem = 'chapa' | 'fita' | 'ferragem';

export interface IgnoradoCatalogo {
  tipo: TipoItem;
  id: string;
  motivo: string;
}

export interface OpcoesImportacaoCatalogo {
  formato: string;
  versao: number;
  limites: LimitesCatalogo;
}

interface ListaImportada<T> {
  itens: T[];
  ignorados: IgnoradoCatalogo[];
}

function conferirChapa(bruto: Record<string, unknown>): string | null {
  if (!textoNaoVazio(bruto['nome'])) return 'nome ausente ou vazio';
  if (typeof bruto['material'] !== 'string') return 'material inválido';
  if (!numeroFinito(bruto['espessura'])) return 'espessura inválida';
  if (!numeroFinito(bruto['largura'])) return 'largura inválida';
  if (!numeroFinito(bruto['altura'])) return 'altura inválida';
  if (typeof bruto['veio'] !== 'boolean') return 'veio inválido';
  if (!numeroFinito(bruto['refilo'])) return 'refilo inválido';
  if (bruto['custoM2'] !== undefined && !numeroFinito(bruto['custoM2'])) return 'custo por m2 inválido';
  if (bruto['cor'] !== undefined && typeof bruto['cor'] !== 'string') return 'cor inválida';
  return null;
}

function conferirFita(bruto: Record<string, unknown>): string | null {
  if (!textoNaoVazio(bruto['nome'])) return 'nome ausente ou vazio';
  if (!numeroFinito(bruto['espessura'])) return 'espessura inválida';
  if (!numeroFinito(bruto['altura'])) return 'altura inválida';
  if (bruto['custoM'] !== undefined && !numeroFinito(bruto['custoM'])) return 'custo por metro inválido';
  if (bruto['cor'] !== undefined && typeof bruto['cor'] !== 'string') return 'cor inválida';
  return null;
}

function conferirFerragem(bruto: Record<string, unknown>): string | null {
  if (!textoNaoVazio(bruto['nome'])) return 'nome ausente ou vazio';
  if (typeof bruto['unidade'] !== 'string') return 'unidade inválida';
  if (bruto['codigo'] !== undefined && typeof bruto['codigo'] !== 'string') return 'código inválido';
  if (!custoValido(bruto['custo'])) return 'custo inválido';
  return null;
}

function copiarChapa(bruto: Record<string, unknown>): Chapa {
  const chapa: Chapa = {
    id: bruto['id'] as string,
    nome: bruto['nome'] as string,
    material: bruto['material'] as string,
    espessura: bruto['espessura'] as number,
    largura: bruto['largura'] as number,
    altura: bruto['altura'] as number,
    veio: bruto['veio'] as boolean,
    refilo: bruto['refilo'] as number,
  };
  if (bruto['custoM2'] !== undefined) chapa.custoM2 = bruto['custoM2'] as number;
  if (bruto['cor'] !== undefined) chapa.cor = bruto['cor'] as string;
  return chapa;
}

function copiarFita(bruto: Record<string, unknown>): Fita {
  const fita: Fita = {
    id: bruto['id'] as string,
    nome: bruto['nome'] as string,
    espessura: bruto['espessura'] as number,
    altura: bruto['altura'] as number,
  };
  if (bruto['custoM'] !== undefined) fita.custoM = bruto['custoM'] as number;
  if (bruto['cor'] !== undefined) fita.cor = bruto['cor'] as string;
  return fita;
}

function copiarFerragem(bruto: Record<string, unknown>): FerragemCatalogo {
  const ferragem: FerragemCatalogo = {
    id: bruto['id'] as string,
    nome: bruto['nome'] as string,
    unidade: bruto['unidade'] as FerragemCatalogo['unidade'],
  };
  if (bruto['codigo'] !== undefined) ferragem.codigo = bruto['codigo'] as string;
  if (bruto['custo'] !== undefined) ferragem.custo = bruto['custo'] as number;
  return ferragem;
}

function importarLista<T>(
  brutos: unknown[],
  tipo: TipoItem,
  conferirCampos: (bruto: Record<string, unknown>) => string | null,
  copiar: (bruto: Record<string, unknown>) => T,
  limites: LimitesCatalogo,
): ListaImportada<T> {
  const itens: T[] = [];
  const ignorados: IgnoradoCatalogo[] = [];
  const vistos = new Set<string>();

  for (const bruto of brutos) {
    const idRelato = ehObjetoSimples(bruto) && typeof bruto['id'] === 'string' ? bruto['id'] : '(sem id)';
    if (!ehObjetoSimples(bruto)) {
      ignorados.push({ tipo, id: idRelato, motivo: 'não é um item' });
      continue;
    }

    const varredura = varreduraProibida(bruto);
    if (varredura === 'proibida') {
      ignorados.push({ tipo, id: idRelato, motivo: 'contém chave proibida (__proto__, constructor ou prototype)' });
      continue;
    }
    if (varredura === 'fundo') {
      ignorados.push({ tipo, id: idRelato, motivo: 'aninhamento excessivo' });
      continue;
    }

    const id = bruto['id'];
    if (!idValido(id)) {
      ignorados.push({ tipo, id: idRelato, motivo: 'id ausente ou inválido' });
      continue;
    }
    if (vistos.has(id)) {
      ignorados.push({ tipo, id, motivo: `id repetido no arquivo: ${id}` });
      continue;
    }

    const motivoCampos = conferirCampos(bruto);
    if (motivoCampos !== null) {
      ignorados.push({ tipo, id, motivo: motivoCampos });
      continue;
    }

    const item = copiar(bruto);
    const motivo = motivoDoItem(item, tipo, limites);
    if (motivo !== null) {
      ignorados.push({ tipo, id, motivo });
      continue;
    }

    vistos.add(id);
    itens.push(structuredClone(item));
  }

  return { itens, ignorados };
}

/** Importa um arquivo `hestia-catalogo`; só lança nos casos fatais do formato. */
export function importarCatalogoInterno(
  dados: unknown,
  opcoes: OpcoesImportacaoCatalogo,
): { catalogo: Catalogo; ignorados: IgnoradoCatalogo[] } {
  if (!ehObjetoSimples(dados)) throw new Error('O arquivo não é um catálogo do Hestia.');
  if (dados['formato'] !== opcoes.formato) throw new Error('O arquivo não é um catálogo do Hestia.');

  const versao = dados['versao'];
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    throw new Error('Versão do arquivo de catálogo ausente ou inválida.');
  }
  if (versao > opcoes.versao) {
    throw new Error(
      `Arquivo mais novo que este programa: versão ${versao} do formato, este Hestia lê até a ${opcoes.versao}. Atualize o Hestia para importá-lo.`,
    );
  }

  const catalogoBruto = dados['catalogo'];
  if (!ehObjetoSimples(catalogoBruto)) throw new Error('O arquivo não traz o catálogo.');
  const chapasBrutas = catalogoBruto['chapas'];
  const fitasBrutas = catalogoBruto['fitas'];
  const ferragensBrutas = catalogoBruto['ferragens'];
  if (!Array.isArray(chapasBrutas) || !Array.isArray(fitasBrutas) || !Array.isArray(ferragensBrutas)) {
    throw new Error('O catálogo do arquivo não traz as três listas (chapas, fitas e ferragens).');
  }

  const chapas = importarLista(chapasBrutas, 'chapa', conferirChapa, copiarChapa, opcoes.limites);
  const fitas = importarLista(fitasBrutas, 'fita', conferirFita, copiarFita, opcoes.limites);
  const ferragens = importarLista(ferragensBrutas, 'ferragem', conferirFerragem, copiarFerragem, opcoes.limites);

  return {
    catalogo: { chapas: chapas.itens, fitas: fitas.itens, ferragens: ferragens.itens },
    ignorados: [...chapas.ignorados, ...fitas.ignorados, ...ferragens.ignorados],
  };
}

/** Junta `extra` a `base` sem repetir id (o de `base` vence). Sempre devolve cópia profunda. */
export function mesclarCatalogoInterno(base: Catalogo, extra: Catalogo): { catalogo: Catalogo; ignorados: string[] } {
  const catalogo = structuredClone(base);
  const ignorados: string[] = [];

  const juntar = <T extends { id: string }>(destino: T[], fonte: T[]): void => {
    const vistos = new Set(destino.map((item) => item.id));
    for (const item of fonte) {
      if (vistos.has(item.id)) {
        ignorados.push(item.id);
        continue;
      }
      vistos.add(item.id);
      destino.push(structuredClone(item));
    }
  };

  juntar(catalogo.chapas, extra.chapas);
  juntar(catalogo.fitas, extra.fitas);
  juntar(catalogo.ferragens, extra.ferragens);

  return { catalogo, ignorados };
}
