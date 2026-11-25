import { conexoesIssue, type Component, type DominioLigacao, type Id, type Project } from '@hestia/model';
import { resolverComponente } from './instancia.ts';
import { dnDaInstancia } from './trocaBitolaGeometria.ts';
import { trechosAcimaDoLimite } from './curvasEntreCaixas.ts';
import { diagnosticarEletrica } from '../eletrica/diagnosticoEletrico.ts';
import { afastamentoDoPar, ligacaoNoMundo, ligacoesCompativeis, type LigacaoNoMundo } from './ligacoesEncaixe.ts';

/*
 * Diagnóstico da REDE MEP (ficha C7, CONTRATO §3 e §7). Função pura: lê o projeto e devolve a lista de problemas com CÓDIGOS e
 * números (sem texto), para a interface traduzir. Nunca lança: uma instância com família ausente simplesmente não tem ligações.
 * Ordem da saída: a das instâncias no projeto (determinística). Unidades: ligações resolvidas em metros; os valores de saída
 * (`valor`) saem em mm ou em % conforme o código.
 */

/** Afastamento máximo (m) entre as duas pontas de uma conexão antes de ela "deixar de se tocar": 5 mm. */
export const AFASTAMENTO_MAXIMO_CONEXAO = 0.005;

/** Limite de declividade de um trecho de um domínio: faixa em % e o diâmetro (mm) até o qual a faixa vale. */
export interface LimiteDeclividade {
  minPercentual: number;
  maxPercentual: number;
  dnMaxMm: number;
}

/** Declividade permitida por domínio. Só o esgoto tem limite nesta fase; o resto não é verificado por inclinação. */
export const LIMITES_DECLIVIDADE: Partial<Record<DominioLigacao, LimiteDeclividade>> = {
  // CONFERIR: norma. Valores do roteiro da ficha C7 (esgoto, DN até 100 mm): 1 % a 5 %. Confirmar com a norma antes de liberar.
  esgoto: { minPercentual: 1, maxPercentual: 5, dnMaxMm: 100 },
};

/** Códigos dos diagnósticos (a interface escolhe o texto em cada idioma). */
export type CodigoDiagnostico =
  | 'ligacao_aberta'
  | 'conexao_invalida'
  | 'conexao_afastada'
  | 'incompativel'
  | 'inclinacao_fora_limite'
  | 'rede_sem_saida'
  | 'curvas_entre_caixas'
  // Elétrica, só traçado (ficha C5).
  | 'circuito_sem_quadro'
  | 'ponto_sem_eletroduto'
  | 'dispositivo_sem_eletroduto'
  | 'quadro_sem_posicao'
  | 'ponto_potencia_zero';

/** Um problema da rede. `ligacaoId`/`outroId` aparecem quando o problema é de uma ligação ou de uma conexão. */
export interface Diagnostico {
  codigo: CodigoDiagnostico;
  /** Instância onde o problema aparece (é a que a interface seleciona e enquadra). */
  elementId: Id;
  ligacaoId?: string;
  /** Instância da outra ponta, na conexão. */
  outroId?: Id;
  /** Número do diagnóstico: mm (`conexao_afastada`), % (`inclinacao_fora_limite`) ou nº de instâncias (`rede_sem_saida`). */
  valor?: number;
  /** Circuito do problema (códigos elétricos). */
  circuitoId?: Id;
  /** Limite que `valor` ultrapassou (posições do quadro). */
  limite?: number;
  /** Motivo fixo do engine, quando o código é `incompativel` ou `conexao_invalida` (texto do motor, em português). */
  motivo?: string;
}

/** Ligação de MEP com `propriedades.tampao` diferente de zero está fechada de propósito: não é ligação aberta. */
const CHAVE_TAMPAO = 'tampao';

/** Verdadeiro se a ligação resolvida declara tampão (fechamento intencional). */
function tampaoDeclarado(lig: LigacaoNoMundo): boolean {
  return (lig.propriedades[CHAVE_TAMPAO] ?? 0) !== 0;
}

/**
 * Verdadeiro se esta ponta é a que confere a conexão. Cada conexão é checada uma vez, pela ponta de chave menor
 * (`id` da instância + quebra + `id` da ligação), para não repetir o mesmo diagnóstico nos dois lados.
 */
function ehPontaCanonica(idA: Id, ligA: string, idB: Id, ligB: string): boolean {
  return `${idA}\n${ligA}` < `${idB}\n${ligB}`;
}

/** Ligações de cada instância já no mundo (uma vez por instância). */
function ligacoesDoProjeto(p: Project, instancias: Component[]): Map<Id, LigacaoNoMundo[]> {
  return new Map<Id, LigacaoNoMundo[]>(instancias.map((c): [Id, LigacaoNoMundo[]] => [c.id, (resolverComponente(p, c).ligacoes ?? []).map((l) => ligacaoNoMundo(l, c))]));
}

/**
 * Ligações desta instância: as abertas sem tampão são sempre apontadas; as conexões só são comparadas (afastamento e
 * compatibilidade) quando a conexão da instância é íntegra (`integra`), porque com ela quebrada não há par confiável.
 */
function diagnosticarConexoes(p: Project, c: Component, noMundo: Map<Id, LigacaoNoMundo[]>, integra: boolean, out: Diagnostico[]): void {
  for (const lig of noMundo.get(c.id) ?? []) {
    const cx = c.ligacoes?.[lig.id];
    if (!cx) {
      if (!tampaoDeclarado(lig)) out.push({ codigo: 'ligacao_aberta', elementId: c.id, ligacaoId: lig.id });
      continue;
    }
    if (!integra) continue;
    const outro = p.elements[cx.componenteId];
    if (outro?.kind !== 'component' || !ehPontaCanonica(c.id, lig.id, outro.id, cx.ligacaoId)) continue;
    const alvo = noMundo.get(outro.id)?.find((l) => l.id === cx.ligacaoId);
    if (!alvo) continue;
    const afastamento = afastamentoDoPar(lig, alvo);
    if (afastamento > AFASTAMENTO_MAXIMO_CONEXAO) {
      out.push({ codigo: 'conexao_afastada', elementId: c.id, ligacaoId: lig.id, outroId: outro.id, valor: afastamento * 1000 });
    }
    const compat = ligacoesCompativeis(lig, alvo);
    if (!compat.ok) out.push({ codigo: 'incompativel', elementId: c.id, ligacaoId: lig.id, outroId: outro.id, motivo: compat.motivo });
  }
}

/** Declividade de um trecho de dois pontos (% = |Δz| / distância horizontal). Vertical ou muito curto: sem valor. */
function declividadePercentual(a: LigacaoNoMundo, b: LigacaoNoMundo): number | null {
  const dh = Math.hypot(b.posicaoMundo[0] - a.posicaoMundo[0], b.posicaoMundo[1] - a.posicaoMundo[1]);
  if (dh < 1e-9) return null;
  return (Math.abs(b.posicaoMundo[2] - a.posicaoMundo[2]) / dh) * 100;
}

/** Folga (mm) ao comparar o diâmetro da ligação com `dnMaxMm` quando a instância não tem o parâmetro `DN` (CONFERIR). */
const FOLGA_DN_MM = 2;

/**
 * Verdadeiro se o trecho passa do DN máximo da faixa. Compara o DN NOMINAL da instância (parâmetro `DN`); o diâmetro da
 * ligação é o externo (DN 100 da Krona = 101,6 mm), que estouraria `dnMaxMm: 100` e tiraria o trecho da conferência.
 * Sem `DN` na família, cai no diâmetro da ligação com folga de `FOLGA_DN_MM`.
 */
function dnAcimaDoLimite(p: Project, c: Component, lig: LigacaoNoMundo, limite: LimiteDeclividade): boolean {
  const dn = dnDaInstancia(p, c);
  return dn !== null ? dn > limite.dnMaxMm : lig.diametro * 1000 > limite.dnMaxMm + FOLGA_DN_MM;
}

/** Trecho com duas pontas do mesmo domínio que tem limite de declividade: confere a faixa. */
function diagnosticarInclinacao(p: Project, c: Component, noMundo: Map<Id, LigacaoNoMundo[]>, out: Diagnostico[]): void {
  const ligs = noMundo.get(c.id) ?? [];
  if (ligs.length !== 2) return;
  const [a, b] = ligs;
  if (!a || !b || a.dominio !== b.dominio || a.secao !== 'redonda') return;
  const limite = LIMITES_DECLIVIDADE[a.dominio];
  if (!limite || dnAcimaDoLimite(p, c, a, limite)) return;
  const pct = declividadePercentual(a, b);
  if (pct === null) return;
  if (pct < limite.minPercentual || pct > limite.maxPercentual) out.push({ codigo: 'inclinacao_fora_limite', elementId: c.id, valor: pct });
}

/** Componentes conexos das instâncias pelas conexões gravadas (só as que apontam para instâncias existentes). */
function gruposConectados(p: Project, instancias: Component[]): Component[][] {
  const vistos = new Set<Id>();
  const grupos: Component[][] = [];
  for (const inicio of instancias) {
    if (vistos.has(inicio.id)) continue;
    vistos.add(inicio.id);
    const grupo: Component[] = [];
    const pilha: Component[] = [inicio];
    for (let atual = pilha.pop(); atual; atual = pilha.pop()) {
      grupo.push(atual);
      for (const cx of Object.values(atual.ligacoes ?? {})) {
        const outro = p.elements[cx.componenteId];
        if (outro?.kind === 'component' && !vistos.has(outro.id)) {
          vistos.add(outro.id);
          pilha.push(outro);
        }
      }
    }
    grupos.push(grupo);
  }
  return grupos;
}

/**
 * Rede sem saída: um grupo conectado de pelo menos duas instâncias em que nenhuma ligação tem fluxo de saída (`saida` ou
 * `ambos`). Uma conexão válida sempre tem uma ponta de saída, então este código aparece sobretudo com conexões incompatíveis.
 */
function diagnosticarRedes(p: Project, instancias: Component[], noMundo: Map<Id, LigacaoNoMundo[]>, out: Diagnostico[]): void {
  for (const grupo of gruposConectados(p, instancias)) {
    if (grupo.length < 2) continue;
    const temSaida = grupo.some((c) => (noMundo.get(c.id) ?? []).some((l) => l.fluxo !== 'entrada'));
    if (temSaida) continue;
    // Id menor do grupo: ponto estável para a interface selecionar.
    const primeiro = grupo.map((c) => c.id).sort()[0];
    if (primeiro !== undefined) out.push({ codigo: 'rede_sem_saida', elementId: primeiro, valor: grupo.length });
  }
}

/**
 * Diagnóstico da rede MEP do projeto (ficha C7): ligações abertas sem tampão, conexões invalidas, conexões que se afastaram
 * (> 5 mm), incompatibilidade de domínio, seção, bitola, direção ou fluxo, trecho de esgoto com declividade fora da faixa e
 * rede sem saída e trecho de eletroduto com curvas demais entre caixas. Lista vazia = rede sem avisos.
 */
export function diagnosticarRede(p: Project): Diagnostico[] {
  const instancias = Object.values(p.elements).filter((e): e is Component => e.kind === 'component');
  const noMundo = ligacoesDoProjeto(p, instancias);
  const out: Diagnostico[] = [];
  for (const c of instancias) {
    const invalida = conexoesIssue(p, c);
    if (invalida) out.push({ codigo: 'conexao_invalida', elementId: c.id, motivo: invalida });
    diagnosticarConexoes(p, c, noMundo, invalida === null, out);
    diagnosticarInclinacao(p, c, noMundo, out);
  }
  diagnosticarRedes(p, instancias, noMundo, out);
  // Eletroduto: trecho entre caixas com mais curvas que o limite (provisório, CONFERIR em `curvasEntreCaixas.ts`).
  for (const t of trechosAcimaDoLimite(p)) {
    const primeiro = t.componentes[0];
    if (primeiro !== undefined) out.push({ codigo: 'curvas_entre_caixas', elementId: primeiro, valor: t.curvas });
  }
  // Elétrica: circuitos, pontos e quadros (só traçado).
  out.push(...diagnosticarEletrica(p));
  return out;
}
