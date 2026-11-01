import { niveisAfetados, type JunctionLevel, type NiveisAfetados, type ResolvedLevel } from '@hestia/engine';
import { aplicarPatchNivel, type PatchNivel } from '@hestia/engine/src/fluxoPatch.ts';
import type { ClienteResolucao } from '@hestia/engine/src/worker/cliente.ts';
import type { TipoResolucao } from '@hestia/engine/src/worker/protocolo.ts';
import type { Id, Project } from '@hestia/model';
import type { EventoFluxo } from './fluxoEdicao.ts';
import { kernelExperimentalLigado } from './preferenciasKernel.ts';
import { criarClienteResolucao } from './resolveWorker.ts';

/** Atraso (ms) do aviso à interface: resoluções que chegam juntas geram um único redesenho. */
const ATRASO_AVISO_MS = 16;
/** Prazo (ms) do idle para o prewarm começar quando o navegador não avisa que está ocioso a tempo. */
const IDLE_TIMEOUT_MS = 500;

/** O que já está pronto para um nível: a resolução de nível e as junções (só o que foi pedido). */
interface Pronto {
  nivel?: ResolvedLevel;
  juncoes?: JunctionLevel;
}

/** Pedido em curso: um por vez, para que a prioridade (nível visível) valha a cada passo. */
interface Voo {
  nivel: Id;
  tipo: TipoResolucao;
  token: number;
  /** Versão do projeto em que o pedido saiu. */
  versao: number;
}

export interface OpcoesResolucaoProgressiva {
  /** Cliente do protocolo. Padrão: Worker quando o navegador tem, senão thread principal em fatias. */
  cliente?: ClienteResolucao;
  /** Chamado (com agrupamento) quando um nível fica pronto ou se invalida: a interface redesenha. */
  aoMudar?: () => void;
  /** Eventos do fluxo de edição vindos daqui: `exato`, `juncoes`, `descartado` e `concluido` (ver `fluxoEdicao.ts`). */
  aoEvento?: (evento: EventoFluxo) => void;
  /**
   * Agenda a fila e o prewarm (padrão: `requestIdleCallback` para começar, senão `setTimeout`). O segundo plano só
   * começa quando a thread está ociosa, para não competir com a planta.
   */
  agendarOcioso?: (tarefa: () => void) => void;
}

/** Ordem dos níveis em relação ao visível: o mais perto primeiro, desempate pelo índice. */
const distanciaAoVisivel = (ids: Id[], visivel: Id | null, i: number): number => Math.abs(i - Math.max(0, visivel ? ids.indexOf(visivel) : 0));

/** Agenda por tempo ocioso quando o navegador tem; senão por macrotarefa (o mesmo efeito de ceder a thread). */
function agendarOciosoPadrao(tarefa: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(tarefa, { timeout: IDLE_TIMEOUT_MS });
  else setTimeout(tarefa, 0);
}

/**
 * Resolução progressiva dos níveis do projeto. O nível visível e o seu vizinho imediato são resolvidos na hora (ver
 * `abrir`, que devolve esses ids e o controller resolve de forma síncrona). Os demais níveis, e as junções de todos,
 * são pedidos ao cliente de resolução em segundo plano, um por vez, com prioridade para o mais perto do visível.
 *
 * Invalidação: `atualizar(p)` roda a cada mudança do projeto e usa `niveisAfetados`, a mesma regra do cache síncrono. Só
 * o que a edição alcança sai dos prontos e tem pedido cancelado; o resto segue válido. `liberar(id)` cancela e tira
 * um nível da fila até ele voltar a ser o visível. `versao` cresce a cada nível pronto ou invalidado.
 *
 * Igualdade: o resultado é o mesmo de `executarResolucao` (ver testes). Nada aqui muda a geometria.
 */
export class ResolucaoProgressiva {
  private readonly cliente: ClienteResolucao;
  private readonly aoMudar: () => void;
  private readonly aoEvento: (evento: EventoFluxo) => void;
  private readonly agendarOcioso: (tarefa: () => void) => void;
  private projeto: Project | null = null;
  private versaoProjeto = 0;
  /** Último resultado exato aplicado de cada nível, com a versão do projeto de que saiu: base dos patches de diferença. */
  private readonly anteriores = new Map<Id, { versao: number; valor: ResolvedLevel }>();
  /** Versão a partir da qual um resultado vale, por nível, e a de piso para todos (mudança global). Mais antigo: descarta. */
  private readonly versaoMinima = new Map<Id, number>();
  private versaoMinimaGlobal = 0;
  /** Verdadeiro: `resolvido` devolve o último exato (possivelmente antigo) em vez de calcular na hora (ver `exatoAssincrono`). */
  exatoAssincrono = false;
  /** Já avisou `concluido` desde a última mudança do projeto. */
  private ocioso = true;
  private visivel: Id | null = null;
  private readonly prontos = new Map<Id, Pronto>();
  /** Níveis já resolvidos na thread da interface: o segundo plano não os refaz. */
  private readonly sincronos = new Set<Id>();
  /** Níveis liberados da planta: saem da fila até voltarem a ser o visível. */
  private readonly liberados = new Set<Id>();
  private voo: Voo | null = null;
  /** Verdadeiro depois de `cancelar()`: a fila não dispara mais pedidos até um `abrir`. */
  private parado = false;
  /**
   * Níveis do prewarm em curso (a 3D vai precisar deles). Enquanto não estiver `null`, a fila resolve só o `nivel`
   * desses alvos — as junções ficam para depois, quando o prewarm terminar. `null`: fila normal.
   */
  private preaquecendo: Set<Id> | null = null;
  /** Geração do prewarm: `abrir`/`cancelar` invalidam a tarefa ociosa já agendada. */
  private prewarmGeracao = 0;
  private tokens = 0;
  private avisoAgendado = false;
  private versaoResolucao = 0;

  constructor(opcoes: OpcoesResolucaoProgressiva = {}) {
    this.cliente = opcoes.cliente ?? criarClienteResolucao({ usarWorker: true, kernelExperimental: kernelExperimentalLigado() });
    this.aoMudar = opcoes.aoMudar ?? (() => undefined);
    this.aoEvento = opcoes.aoEvento ?? (() => undefined);
    this.agendarOcioso = opcoes.agendarOcioso ?? agendarOciosoPadrao;
  }

  /** Contador de versão da resolução: a planta observa para saber que algo ficou pronto ou mudou. */
  get versao(): number {
    return this.versaoResolucao;
  }

  /**
   * Abre um projeto: cancela o que restava do anterior e agenda o segundo plano. Devolve os níveis que devem ser
   * resolvidos já (o visível e o vizinho imediato), para o controller chamar `resolvido` neles.
   */
  abrir(p: Project, versao?: number): Id[] {
    this.parado = false;
    this.cancelarPrewarm();
    this.cliente.cancelarTodos();
    this.voo = null;
    this.prontos.clear();
    this.sincronos.clear();
    this.liberados.clear();
    this.anteriores.clear();
    this.versaoMinima.clear();
    this.projeto = p;
    this.versaoProjeto = versao ?? this.versaoProjeto + 1;
    this.versaoMinimaGlobal = this.versaoProjeto;
    this.ocioso = false;
    this.visivel = p.levels[0]?.id ?? null;
    this.versaoResolucao++;
    // A fila começa em tempo ocioso: a planta tem a prioridade do primeiro quadro.
    this.agendarOcioso(() => this.avancar());
    return p.levels.slice(0, 2).map((l) => l.id);
  }

  /**
   * Chamado a cada mudança do projeto: invalida só o que a edição alcança e reinicia a fila dos afetados. `versao` é a
   * versão do projeto (`store.version`); `niveis` os níveis afetados, quando quem chama já os calculou.
   */
  atualizar(p: Project, versao?: number, niveis?: NiveisAfetados): void {
    const antes = this.projeto;
    if (!antes) {
      this.projeto = p;
      return;
    }
    if (p === antes) return;
    const afetados = niveis ?? niveisAfetados(antes, p);
    this.projeto = p;
    // Um nível novo (ou removido) muda os alvos do prewarm em curso; liberado continua fora da fila.
    if (this.preaquecendo) this.preaquecendo = new Set(p.levels.map((l) => l.id).filter((id) => !this.liberados.has(id)));
    this.versaoProjeto = versao ?? this.versaoProjeto + 1;
    this.ocioso = false;
    if (afetados === 'todos') {
      this.versaoMinimaGlobal = this.versaoProjeto;
      this.cliente.cancelarTodos();
      if (this.voo) this.aoEvento({ tipo: 'descartado', nivel: this.voo.nivel, versao: this.voo.versao, motivo: 'versao-antiga' });
      this.voo = null;
      this.prontos.clear();
      this.sincronos.clear();
    } else {
      for (const id of afetados) this.invalidar(id);
    }
    this.versaoResolucao++;
    this.avisar();
    this.avancar();
  }

  /**
   * Resolve um nível para a planta: devolve o valor pronto em segundo plano, ou calcula na hora com `sincrono`.
   * Quando calcula, marca o nível como síncrono e cancela um pedido em curso dele. `prioritario` põe o nível
   * como visível para a fila (o nível que a planta mostra).
   */
  resolvido(id: Id, sincrono: () => ResolvedLevel, prioritario = false, exigirExato = false): ResolvedLevel {
    if (prioritario) this.priorizar(id);
    const pronto = this.nivelPronto(id);
    if (pronto) return pronto;
    const anterior = this.anteriores.get(id);
    // Nível liberado não está na fila: o recálculo não viria, então devolver o antigo seria devolver para sempre.
    if (this.exatoAssincrono && !exigirExato && anterior && !this.liberados.has(id)) return anterior.valor;
    this.sincronos.add(id);
    if (this.voo?.nivel === id) this.cancelarVoo();
    const valor = sincrono();
    this.anteriores.set(id, { versao: this.versaoProjeto, valor });
    return valor;
  }

  /** O resultado do nível ainda não é o da versão atual do projeto (há um recálculo a caminho). */
  pendente(id: Id): boolean {
    return !this.prontos.get(id)?.nivel && !this.sincronos.has(id);
  }

  /**
   * Resolução de nível já pronta (senão `null`). Não calcula nada. Inclui o nível calculado na thread da interface na
   * abertura (`resolvido`): ele também está pronto e a 3D pode usá-lo sem refazer o cálculo.
   */
  nivelPronto(id: Id): ResolvedLevel | null {
    const pronto = this.prontos.get(id)?.nivel;
    if (pronto) return pronto;
    if (this.sincronos.has(id)) return this.anteriores.get(id)?.valor ?? null;
    return null;
  }

  /** Todos os níveis do projeto (ou os `alvos`) já têm resolução pronta: a 3D pode montar de uma vez. */
  niveisProntos(alvos?: readonly Id[]): boolean {
    if (!this.projeto) return false;
    const ids = alvos ?? this.projeto.levels.map((l) => l.id);
    return ids.every((id) => this.nivelPronto(id) !== null);
  }

  /**
   * Prewarm dos níveis para a primeira abertura da 3D: agenda em tempo ocioso a resolução dos níveis ainda não prontos
   * (todos, por padrão), um pedido de cada vez e sem as junções — a 3D só precisa do `nivel`. Usa a mesma fila e o mesmo
   * cache da planta (`receber`/`nivelPronto`), então não há cálculo duplicado: nível já pronto não é pedido de novo.
   *
   * É idempotente e não bloqueia a planta: cada passo cede a thread e o pedido segue no cliente de resolução. `abrir` e
   * `cancelar` invalidam a tarefa ociosa pendente e encerram o prewarm.
   */
  preaquecerNiveis(alvos?: readonly Id[]): void {
    const p = this.projeto;
    if (!p || this.parado) return;
    const ids = (alvos ?? p.levels.map((l) => l.id)).filter((id) => !this.liberados.has(id));
    if (ids.length === 0 || this.niveisProntos(ids)) return; // nada a fazer: não acorda a fila à toa
    this.preaquecendo = new Set(ids);
    const geracao = this.prewarmGeracao;
    this.agendarOcioso(() => {
      if (geracao !== this.prewarmGeracao || this.parado) return; // cancelado por `abrir`/`cancelar`
      this.avancar();
    });
  }

  /**
   * Põe um resultado já conhecido como pronto do nível (ex.: restaurado do cache de geometria na abertura). Não mexe no
   * nível em voo nem no calculado na hora. Devolve false se não coube (nível em voo, já pronto ou calculado).
   */
  semear(id: Id, valor: ResolvedLevel): boolean {
    if (!this.projeto || this.voo?.nivel === id || this.sincronos.has(id) || this.prontos.get(id)?.nivel) return false;
    const e: Pronto = this.prontos.get(id) ?? {};
    e.nivel = valor;
    this.prontos.set(id, e);
    this.anteriores.set(id, { versao: this.versaoProjeto, valor });
    this.versaoResolucao++;
    this.avisar();
    return true;
  }

  /** Junções de um nível, se já estiverem prontas em segundo plano (senão `null`). */
  juncoes(id: Id): JunctionLevel | null {
    return this.prontos.get(id)?.juncoes ?? null;
  }

  /** Libera um nível (aba de planta fechada): cancela o pedido dele e tira-o da fila até voltar a ser o visível. */
  liberar(id: Id): void {
    this.prontos.delete(id);
    this.sincronos.delete(id);
    this.liberados.add(id);
    // Nível liberado sai também do prewarm, senão ele esperaria para sempre por um resultado que não virá.
    if (this.preaquecendo) {
      this.preaquecendo.delete(id);
      if (this.preaquecendo.size === 0) this.preaquecendo = null;
    }
    if (this.voo?.nivel === id) this.cancelarVoo();
  }

  /** Desliga o segundo plano (desmontagem). Os pedidos pendentes são cancelados. */
  cancelar(): void {
    this.parado = true;
    this.cancelarPrewarm();
    this.cliente.cancelarTodos();
    this.voo = null;
  }

  /** Encerra o prewarm e invalida a tarefa ociosa já agendada. */
  private cancelarPrewarm(): void {
    this.preaquecendo = null;
    this.prewarmGeracao++;
  }

  /** Pedido de quem prepara o projeto em segundo plano: `id` passa à frente na fila de resolução (ver `preparoProjeto.ts`). */
  priorizarNivel(id: Id): void {
    this.priorizar(id);
  }

  /** Torna `id` o nível visível para a fila, sem cancelar o pedido em curso (ele termina e o próximo já é o visível). */
  private priorizar(id: Id): void {
    this.liberados.delete(id);
    if (this.visivel === id) return;
    this.visivel = id;
  }

  /** Tira um nível da resolução em segundo plano: pronto, síncrono ou em curso, ele vira pendente de novo. */
  private invalidar(id: Id): void {
    this.prontos.delete(id);
    this.sincronos.delete(id);
    this.versaoMinima.set(id, this.versaoProjeto);
    this.cliente.cancelarNivel(id);
    if (this.voo?.nivel === id) {
      this.aoEvento({ tipo: 'descartado', nivel: id, versao: this.voo.versao, motivo: 'versao-antiga' });
      this.voo = null;
    }
  }

  /** O resultado de `versao` ainda vale para o nível? Não vale se uma edição posterior o alcançou (descarte por versão). */
  private vale(nivel: Id, versao: number): boolean {
    return versao >= Math.max(this.versaoMinimaGlobal, this.versaoMinima.get(nivel) ?? 0);
  }

  /** Cancela o pedido em curso e segue a fila (o cancelamento chega como rejeição, tratada em `avancar`). */
  private cancelarVoo(): void {
    if (!this.voo) return;
    this.cliente.cancelarNivel(this.voo.nivel);
    this.voo = null;
    this.avancar();
  }

  /** Próximo pedido: o nível mais perto do visível que ainda falta, primeiro `nivel` e depois `juncoes`. */
  private proximo(): { nivel: Id; tipo: TipoResolucao } | null {
    const p = this.projeto;
    if (!p) return null;
    const ids = p.levels.map((l) => l.id);
    let melhor: { nivel: Id; tipo: TipoResolucao; distancia: number } | null = null;
    ids.forEach((id, i) => {
      if (this.preaquecendo && !this.preaquecendo.has(id)) return; // prewarm: só os alvos
      const tipo = this.tipoPendente(id);
      if (!tipo) return;
      const distancia = distanciaAoVisivel(ids, this.visivel, i);
      if (!melhor || distancia < melhor.distancia) melhor = { nivel: id, tipo, distancia };
    });
    return melhor;
  }

  private tipoPendente(id: Id): TipoResolucao | null {
    if (this.liberados.has(id)) return null;
    const e = this.prontos.get(id);
    if (!e?.nivel && !this.sincronos.has(id)) return 'nivel';
    // No prewarm só o nível importa (é o que a 3D usa); as junções voltam quando ele terminar.
    if (this.preaquecendo) return null;
    if (!e?.juncoes) return 'juncoes';
    return null;
  }

  /** Dispara o próximo pedido se nenhum está em curso. Um pedido por vez. */
  private avancar(): void {
    if (this.parado || this.voo || !this.projeto) return;
    // Prewarm concluído (ou alvos todos prontos): a fila volta ao normal, com as junções.
    if (this.preaquecendo && this.niveisProntos([...this.preaquecendo])) this.preaquecendo = null;
    const alvo = this.proximo();
    if (!alvo) {
      if (!this.ocioso) {
        this.ocioso = true;
        this.aoEvento({ tipo: 'concluido', versao: this.versaoProjeto });
      }
      return;
    }
    const token = ++this.tokens;
    const versao = this.versaoProjeto;
    this.voo = { nivel: alvo.nivel, tipo: alvo.tipo, token, versao };
    // O nível sai como patch: só a diferença para o último resultado que já foi aplicado (ver `fluxoPatch.ts`).
    const pedido = alvo.tipo === 'nivel' ? 'patchNivel' : alvo.tipo;
    this.cliente
      .resolver(pedido, alvo.nivel, this.projeto, versao, alvo.tipo === 'nivel' ? (this.anteriores.get(alvo.nivel)?.versao ?? null) : null)
      .then((valor) => this.receber(token, alvo.tipo, alvo.nivel, versao, valor))
      .catch(() => undefined) // cancelado (ResolucaoCancelada) ou falha: a fila segue
      .finally(() => {
        if (this.voo?.token === token) {
          this.voo = null;
          this.avancar();
        }
      });
  }

  private receber(token: number, tipo: TipoResolucao, nivel: Id, versao: number, valor: unknown): void {
    if (this.voo?.token !== token) return;
    if (!this.vale(nivel, versao)) {
      this.aoEvento({ tipo: 'descartado', nivel, versao, motivo: 'versao-antiga' });
      return;
    }
    const e: Pronto = this.prontos.get(nivel) ?? {};
    if (tipo === 'nivel') {
      const patch = valor as PatchNivel;
      const novo = aplicarPatchNivel(this.anteriores.get(nivel)?.valor ?? null, patch);
      // Patch que não cabe no estado daqui (a base não é a que temos): esquece o anterior e a fila pede o completo.
      if (!novo) return void this.anteriores.delete(nivel);
      this.anteriores.set(nivel, { versao: patch.versao, valor: novo });
      e.nivel = novo;
    } else e.juncoes = valor as JunctionLevel;
    this.prontos.set(nivel, e);
    this.versaoResolucao++;
    this.aoEvento(tipo === 'nivel' ? { tipo: 'exato', versao, patch: valor as PatchNivel } : { tipo: 'juncoes', nivel, versao });
    this.avisar();
  }

  /** Avisa a interface, agrupando respostas que chegam perto uma da outra. */
  private avisar(): void {
    if (this.avisoAgendado) return;
    this.avisoAgendado = true;
    setTimeout(() => {
      this.avisoAgendado = false;
      this.aoMudar();
    }, ATRASO_AVISO_MS);
  }
}
