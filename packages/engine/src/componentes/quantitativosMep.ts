import { isComponent, type Component, type Familia, type Id, type Project, type Valor } from '@hestia/model';
import { resolverComponente } from './instancia.ts';
import type { CorpoResolvido, PerfilResolvido } from './corposTipos.ts';

/*
 * Quantitativos das famílias MEP e estruturais (ficha E3, CONTRATO §6). Agrupa as instâncias por categoria e tipo:
 * - tubulação: comprimento (`L`, em mm no texto, em m aqui) somado por DN; conexões (`conexao_tubo`) contadas por tipo;
 * - reservatório: volume útil (`volumeUtil`, derivado em litros) somado por tipo, quando o parâmetro existe;
 * - perfil estrutural: comprimento e massa por tipo (seção); massa = área do perfil resolvida × comprimento × 7850 kg por metro cúbico;
 * - eletroduto: comprimento somado por bitola (parâmetro `bitola`, ou `DN` quando não há `bitola`).
 * Puro e determinístico. Componente com erro de resolução fica de fora (o orçamento já avisa). Só lê corpos já resolvidos:
 * nada de fórmula aqui. Marcenaria e os outros grupos não entram: o orçamento de marcenaria segue em `orcamento.ts`.
 */

/** Densidade de referência do aço (kg por metro cúbico), CONTRATO §6: massa do perfil estrutural = área × comprimento × esta constante. */
export const DENSIDADE_ACO_KG_M3 = 7850;

/** Medidas do texto da família vêm em mm; o resolvido em m. */
const MM_PARA_M = 1e-3;

export interface LinhaTubulacaoDn {
  /** DN da instância; `null` quando o componente não tem o parâmetro `DN`. */
  dn: number | null;
  trechos: number;
  comprimentoM: number;
}

export interface LinhaConexaoTubo {
  familiaId: Id;
  tipoId: Id | null;
  nome: string;
  quantidade: number;
}

export interface LinhaReservatorio {
  familiaId: Id;
  tipoId: Id | null;
  nome: string;
  quantidade: number;
  /** Soma do volume útil (L); `null` quando nenhuma instância do grupo tem o parâmetro `volumeUtil`. */
  volumeUtilL: number | null;
}

export interface LinhaPerfilEstrutural {
  familiaId: Id;
  tipoId: Id | null;
  nome: string;
  quantidade: number;
  comprimentoM: number;
  massaKg: number;
}

export interface LinhaEletroduto {
  /** Bitola da instância; `null` quando não há `bitola` nem `DN`. */
  bitola: number | null;
  trechos: number;
  comprimentoM: number;
}

export interface QuantitativosMep {
  tubulacao: LinhaTubulacaoDn[];
  conexoesTubo: LinhaConexaoTubo[];
  reservatorios: LinhaReservatorio[];
  perfisEstruturais: LinhaPerfilEstrutural[];
  eletrodutos: LinhaEletroduto[];
}

export interface OpcoesQuantitativosMep {
  /** Nível (`Level.id`); ausente = todos os níveis. */
  nivel?: Id;
}

/** Área, em metros quadrados, de um contorno achatado `[u0, v0, u1, v1, …]` pela fórmula de Gauss (sem sinal). */
function areaDoContorno(pontos: readonly number[]): number {
  const n = Math.floor(pontos.length / 2);
  let soma = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    soma += pontos[2 * i]! * pontos[2 * j + 1]! - pontos[2 * j]! * pontos[2 * i + 1]!;
  }
  return Math.abs(soma) / 2;
}

/** Área, em metros quadrados, da seção: contorno externo menos os furos. */
export function areaDoPerfil(perfil: PerfilResolvido): number {
  let area = areaDoContorno(perfil.externo);
  for (const furo of perfil.furos) area -= areaDoContorno(furo);
  return Math.max(0, area);
}

/** Valor numérico de um parâmetro resolvido (mm, litros...); `null` se ausente ou não numérico. */
function numeroDoEnv(env: Readonly<Record<string, Valor>>, nome: string): number | null {
  const v = env[nome];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Comprimento (m) do componente pelo parâmetro `L` resolvido (mm); 0 quando ausente. */
function comprimentoDoEnv(env: Readonly<Record<string, Valor>>): number {
  return (numeroDoEnv(env, 'L') ?? 0) * MM_PARA_M;
}

/** Massa (kg) de todos os corpos de extrusão não vazios de um componente. */
function massaDosCorpos(corpos: readonly CorpoResolvido[]): { comprimentoM: number; massaKg: number } {
  let comprimentoM = 0;
  let massaKg = 0;
  for (const corpo of corpos) {
    if (corpo.vazio || corpo.forma.tipo !== 'extrusao') continue;
    const area = areaDoPerfil(corpo.forma.perfil);
    comprimentoM += corpo.forma.comprimento;
    massaKg += area * corpo.forma.comprimento * DENSIDADE_ACO_KG_M3;
  }
  return { comprimentoM, massaKg };
}

function nomeDoTipo(familia: Familia | undefined, tipoId: Id | null, fallback: Id): string {
  if (familia === undefined) return fallback;
  const tipo = tipoId === null ? undefined : familia.tipos.find((t) => t.id === tipoId);
  return tipo?.nome ?? familia.nome;
}

function cmpTexto(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compararPorNomeEId(a: { nome: string; familiaId: Id; tipoId: Id | null }, b: { nome: string; familiaId: Id; tipoId: Id | null }): number {
  return a.nome.localeCompare(b.nome) || cmpTexto(a.familiaId, b.familiaId) || cmpTexto(a.tipoId ?? '', b.tipoId ?? '');
}

function componentesDoProjeto(p: Project, nivel?: Id): Component[] {
  const lista: Component[] = [];
  for (const id of Object.keys(p.elements).sort()) {
    const e = p.elements[id];
    if (e === undefined || !isComponent(e)) continue;
    if (nivel !== undefined && e.levelId !== nivel) continue;
    lista.push(e);
  }
  return lista;
}

/**
 * Quantitativos MEP e estruturais do projeto. Sem componentes desses grupos: listas vazias. Ordens determinísticas:
 * DN crescente, bitola crescente e, nos grupos por tipo, nome depois família depois tipo.
 */
export function quantitativosMepDoProjeto(p: Project, opcoes: OpcoesQuantitativosMep = {}): QuantitativosMep {
  const dnPorValor = new Map<number | null, LinhaTubulacaoDn>();
  const bitolas = new Map<number | null, LinhaEletroduto>();
  const conexoes = new Map<string, LinhaConexaoTubo>();
  const reservatorios = new Map<string, LinhaReservatorio>();
  const perfis = new Map<string, LinhaPerfilEstrutural>();

  for (const c of componentesDoProjeto(p, opcoes.nivel)) {
    const familia: Familia | undefined = p.componentFamilies?.[c.familyId];
    if (familia === undefined) continue;
    const res = resolverComponente(p, c);
    if (res.erros.length > 0) continue;
    const chave = `${c.familyId}|${c.typeId ?? ''}`;
    const nome = nomeDoTipo(familia, c.typeId ?? null, c.familyId);
    const env = res.env;

    switch (familia.categoria) {
      case 'tubulacao': {
        const dn = numeroDoEnv(env, 'DN');
        const linha = dnPorValor.get(dn) ?? { dn, trechos: 0, comprimentoM: 0 };
        linha.trechos += 1;
        linha.comprimentoM += comprimentoDoEnv(env);
        dnPorValor.set(dn, linha);
        break;
      }
      case 'conexao_tubo': {
        const linha = conexoes.get(chave) ?? { familiaId: c.familyId, tipoId: c.typeId ?? null, nome, quantidade: 0 };
        linha.quantidade += 1;
        conexoes.set(chave, linha);
        break;
      }
      case 'reservatorio': {
        const volume = numeroDoEnv(env, 'volumeUtil');
        const linha = reservatorios.get(chave) ?? { familiaId: c.familyId, tipoId: c.typeId ?? null, nome, quantidade: 0, volumeUtilL: null };
        linha.quantidade += 1;
        if (volume !== null) linha.volumeUtilL = (linha.volumeUtilL ?? 0) + volume;
        reservatorios.set(chave, linha);
        break;
      }
      case 'perfil_estrutural': {
        const { comprimentoM, massaKg } = massaDosCorpos(res.corpos ?? []);
        const linha = perfis.get(chave) ?? { familiaId: c.familyId, tipoId: c.typeId ?? null, nome, quantidade: 0, comprimentoM: 0, massaKg: 0 };
        linha.quantidade += 1;
        linha.comprimentoM += comprimentoM;
        linha.massaKg += massaKg;
        perfis.set(chave, linha);
        break;
      }
      case 'eletroduto': {
        const bitola = numeroDoEnv(env, 'bitola') ?? numeroDoEnv(env, 'DN');
        const linha = bitolas.get(bitola) ?? { bitola, trechos: 0, comprimentoM: 0 };
        linha.trechos += 1;
        linha.comprimentoM += comprimentoDoEnv(env);
        bitolas.set(bitola, linha);
        break;
      }
      default:
        break;
    }
  }

  /* Numérico crescente; `null` (sem parâmetro) vai por último. */
  const porValor = (a: number | null, b: number | null): number => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  };
  const porDn = (a: LinhaTubulacaoDn, b: LinhaTubulacaoDn): number => porValor(a.dn, b.dn);
  const porBitola = (a: LinhaEletroduto, b: LinhaEletroduto): number => porValor(a.bitola, b.bitola);
  const ordenarTipo = <T extends { nome: string; familiaId: Id; tipoId: Id | null }>(mapa: Map<string, T>): T[] => [...mapa.values()].sort(compararPorNomeEId);

  return {
    tubulacao: [...dnPorValor.values()].sort(porDn),
    conexoesTubo: ordenarTipo(conexoes),
    reservatorios: ordenarTipo(reservatorios),
    perfisEstruturais: ordenarTipo(perfis),
    eletrodutos: [...bitolas.values()].sort(porBitola),
  };
}
