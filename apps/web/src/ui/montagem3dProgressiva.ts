import type { ResolvedLevel } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { chavesDeNivel, type Scene3DOptions } from '@hestia/render';
import { interacaoAtiva, quandoLivre } from '../editor/interacaoAtiva.ts';
import { useUi } from '../editor/state.ts';
import { criarFonteNiveisWorker } from './montagem3dNiveis.ts';
import { edicaoSoDeEsquadrias } from './edicaoDeEsquadrias.ts';
import { publicarProgresso3d } from './progresso3d.ts';

/** Lote da primeira fatia: o nível visível e os dois vizinhos mais próximos, na mesma montagem síncrona. */
export const LOTE_INICIAL = 3;
/** Teto do lote: fatias grandes demais voltam a travar a tela mesmo com o orçamento. */
export const LOTE_MAXIMO = 8;
/** Com worker, níveis recebidos por atualização de cena: evita um `ModelScene.update` O(projeto) por nível. */
export const NIVEIS_POR_APLICACAO = 3;
/** Orçamento (ms) de uma fatia quando não se informa outro. */
export const ORCAMENTO_PADRAO_MS = 12;
/** Prazo (ms) de uma resposta do worker antes de calcular o nível na thread da interface (rede de segurança). */
export const PRAZO_WORKER_MS = 8000;
/** Pedidos que podem estar no worker ao mesmo tempo: a resolução de um nível corre enquanto a cena monta o anterior. */
export const PEDIDOS_EM_VOO = 2;

/** Cena que recebe os níveis: o mesmo contrato de `ModelScene.update`. */
export interface CenaMontagem {
  update(p: Project, niveis: ResolvedLevel[], opt: Scene3DOptions): void;
  /**
   * Caminho rápido da edição de esquadrias (ver `ModelScene.atualizarAberturas`): troca só as peças da parede hospedeira
   * no nível já montado. Falso = a cena não pôde provar a independência e nada mudou (a montagem segue o caminho comum).
   */
  atualizarAberturas?(p: Project, anterior: Project, nivel: Id, paredes: readonly Id[], resolvido: ResolvedLevel, opt: Scene3DOptions): boolean;
}

export { edicaoSoDeEsquadrias } from './edicaoDeEsquadrias.ts';

/** De onde vem cada nível: o pronto em segundo plano (quando há) ou o cálculo na hora. */
export interface FonteNiveis {
  /** Resolução pronta em segundo plano, sem calcular. `null` se ainda não chegou. Opcional. */
  pronto?(id: Id): ResolvedLevel | null;
  /** Resolve o nível na thread da interface (ou devolve o que o cache já tem). */
  resolver(id: Id): ResolvedLevel;
}

/**
 * Worker da montagem 3D (ver `montagem3dNiveis.ts`): resolve o nível fora da thread da interface, um pedido de cada
 * vez, na ordem em que a montagem pede. `pedir` rejeita quando o pedido é cancelado.
 */
export interface FonteWorker {
  /** Prepara o projeto no worker (a estrutura atravessa uma vez por projeto). */
  iniciar(projeto: Project): void;
  /** Pede a resolução de um nível; o resultado é o mesmo de `resolveLevel` na thread principal. */
  pedir(nivel: Id, projeto: Project): Promise<ResolvedLevel>;
  /** Cancela os pedidos em curso e os que ainda não saíram. */
  cancelar(): void;
  /** Desliga o worker (desmontagem da vista). */
  encerrar(): void;
}

export interface OpcoesMontagem {
  cena: CenaMontagem;
  fonte: FonteNiveis;
  /** Chamado a cada fatia que muda a cena: a interface redesenha. */
  aoAtualizar: () => void;
  /** Chamado quando todos os níveis estão na cena. */
  aoConcluir: () => void;
  /** Agenda a próxima fatia síncrona. Padrão: `requestIdleCallback` quando existe, senão `setTimeout`. */
  agendar?: (tarefa: () => void) => void;
  /** Relógio (ms) para medir a fatia e o prazo do worker. Padrão: `performance.now`. */
  relogio?: () => number;
  /** Orçamento (ms) de uma fatia: o lote cresce ou encolhe para ficar perto dele. */
  orcamentoMs?: number;
  /**
   * Worker que resolve os níveis (ver `FonteWorker`). Presente, a montagem **não calcula** níveis na thread da
   * interface: a primeira fatia traz só o nível visível e cada nível seguinte chega do worker (até `PEDIDOS_EM_VOO`
   * pedidos em voo, na ordem da montagem). Ausente, o comportamento é o de sempre: fatias síncronas com lote adaptativo.
   */
  worker?: FonteWorker | null;
  /** Prazo (ms) de uma resposta do worker antes da rede de segurança (padrão `PRAZO_WORKER_MS`). */
  prazoWorkerMs?: number;
  /**
   * Gesto de câmera (órbita, pan, zoom) em andamento ou recém-terminado. Com gesto ativo, nenhuma fatia síncrona roda: a
   * montagem espera o fim dele (`quandoLivre`), e a cena continua mostrando a malha antiga dos níveis ainda pendentes.
   * Padrão: o sinal global de `editor/interacaoAtiva.ts`.
   */
  interacaoAtiva?: () => boolean;
  /** Roda `acao` quando não houver gesto ativo (espera e confere de novo). Padrão: `quandoLivre` do sinal global. */
  quandoLivre?: (acao: () => void) => unknown;
}

/** Níveis na ordem de montagem: o visível primeiro, depois os mais perto dele. Empate: a ordem do projeto. */
export function ordemDeMontagem(ids: readonly Id[], visivel: Id | null): Id[] {
  const origem = Math.max(0, visivel ? ids.indexOf(visivel) : 0);
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => Math.abs(a.i - origem) - Math.abs(b.i - origem) || a.i - b.i)
    .map((x) => x.id);
}

/** Tamanho do próximo lote: dobra quando a fatia coube com folga, divide quando estourou o orçamento (mínimo 1). */
export function proximoLote(atual: number, duracaoMs: number, orcamentoMs: number): number {
  if (duracaoMs > orcamentoMs) return Math.max(1, Math.floor(atual / 2));
  if (duracaoMs < orcamentoMs / 2) return Math.min(LOTE_MAXIMO, atual * 2);
  return atual;
}

/** Agenda por tempo ocioso quando o navegador tem; senão por macrotarefa (o mesmo efeito de ceder a thread). */
function agendarPadrao(tarefa: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(tarefa, { timeout: 100 });
  else setTimeout(tarefa, 0);
}

/**
 * Chave de conteúdo de cada nível (`chavesDeNivel`): duas chaves iguais garantem a mesma geometria resolvida. A marca da
 * vista fica de fora — tema, arestas e sombras mudam a malha da cena, não a resolução do nível, então não podem custar
 * uma re-resolução.
 */
function chavesDoProjeto(p: Project): Map<Id, string> {
  return chavesDeNivel(p, '');
}

/**
 * Monta a 3D por níveis, em fatias, sem bloquear a tela.
 *
 * Prewarm completo: quando `iniciar` roda e `fonte.pronto` já tem todos os níveis (prewarm da planta terminou), a
 * montagem aplica todos num único `update` — o primeiro quadro já vem completo, sem worker nem cálculo na hora. Se
 * faltar algum, o caminho progressivo abaixo segue como antes.
 *
 * Com worker (`worker` em `OpcoesMontagem`), a thread da interface não calcula nenhum nível: a primeira fatia traz só o
 * nível visível (vindo do segundo plano, ou calculado uma vez, para o primeiro quadro ter o que mostrar) e os demais
 * chegam do worker, com até `PEDIDOS_EM_VOO` pedidos em voo, na ordem da montagem. Cada resposta monta um nível na cena
 * e reabastece a fila; o trabalho da thread da interface por nível fica só a montagem da cena. Nível que o segundo
 * plano da planta já entregou é usado direto, sem pedir de novo ao worker.
 *
 * Sem worker (ou se ele falhar duas vezes), a montagem é a de sempre: a primeira fatia (visível e vizinhos) é síncrona
 * e as seguintes entram em lotes cujo tamanho se ajusta ao orçamento de tempo.
 *
 * A cena é sempre atualizada com os níveis já prontos, na ordem do projeto: quando o último chega, a chamada é
 * idêntica à montagem completa (`ModelScene.update` com todos os níveis).
 *
 * Cancelamento: `iniciar` (outro projeto ou outra chave) e `cancelar` invalidam os pedidos e as fatias por geração.
 *
 * Atualização incremental (`atualizar`): depois da primeira montagem, uma edição não remonta o projeto inteiro. As chaves
 * de conteúdo por nível (`chavesDeNivel`) dizem quais níveis continuam válidos; só o editado e os vizinhos por cota (a
 * chave deles inclui o conteúdo do vizinho) voltam para a fila. Tema e mostrar/ocultar níveis não mudam geometria: só
 * reaplicam a cena.
 */
export class Montagem3dProgressiva {
  private geracao = 0;
  private ordemProjeto: Id[] = [];
  private pendentes: Id[] = [];
  private prontos = new Map<Id, ResolvedLevel>();
  private projeto: Project | null = null;
  /** Chave de conteúdo de cada nível da geometria em `prontos` (ver `chavesDeNivel`). */
  private chaves = new Map<Id, string>();
  /** Níveis alterados nesta atualização: não podem usar o `pronto` do segundo plano (pode ser da versão anterior). */
  private forcar = new Set<Id>();
  /** Todos os níveis do projeto corrente já estão na cena (o projeto fica guardado para a próxima atualização). */
  private concluido = false;
  private opcoes: Scene3DOptions | null = null;
  private lote = LOTE_INICIAL;
  /** Níveis recebidos desde a última atualização da cena (agrupa as respostas do worker). */
  private recebidosDesdeAplicar = 0;
  private readonly agendar: (tarefa: () => void) => void;
  private readonly relogio: () => number;
  private readonly emGesto: () => boolean;
  private readonly esperarGesto: (acao: () => void) => unknown;
  /** Último `ResolvedLevel` de cada nível que a cena já mostra e que a edição invalidou: fica na cena até o novo chegar. */
  private antigos = new Map<Id, ResolvedLevel>();
  private readonly orcamentoMs: number;
  private readonly prazoWorkerMs: number;
  /** Worker dos níveis; `null` depois de desistir dele (duas falhas) ou quando não há. */
  private worker: FonteWorker | null;
  /** Níveis pedidos e ainda sem resposta. */
  private emVoo = new Set<Id>();
  /** Níveis que o worker respondeu e ainda não entraram na cena. */
  private recebidos = new Map<Id, ResolvedLevel>();
  /** Prazo da fila do worker (rearmado a cada resposta). */
  private prazo: ReturnType<typeof setTimeout> | null = null;
  /** Quantos níveis o worker falhou seguidos: dois e a montagem volta ao caminho síncrono. */
  private falhas = 0;
  /** Há um passo de montagem agendado (um nível por tarefa). */
  private passoAgendado = false;

  constructor(private readonly op: OpcoesMontagem) {
    this.agendar = op.agendar ?? agendarPadrao;
    this.relogio = op.relogio ?? (() => performance.now());
    this.emGesto = op.interacaoAtiva ?? interacaoAtiva;
    this.esperarGesto = op.quandoLivre ?? quandoLivre;
    this.orcamentoMs = op.orcamentoMs ?? ORCAMENTO_PADRAO_MS;
    this.prazoWorkerMs = op.prazoWorkerMs ?? PRAZO_WORKER_MS;
    this.worker = op.worker ?? null;
  }

  /** Quantos níveis já estão na cena. */
  get montados(): number {
    return this.prontos.size;
  }

  /** Quantos níveis o projeto tem (denominador do progresso). */
  get total(): number {
    return this.ordemProjeto.length;
  }

  /** Todos os níveis já estavam resolvidos ao iniciar: a montagem segue só em fatias síncronas, sem worker. */
  private soFatias = false;

  /** A montagem está usando o worker (e não o caminho síncrono). */
  get usandoWorker(): boolean {
    return this.worker !== null && this.pendentes.length > 0;
  }

  /** Começa a montagem de `p`: cancela a anterior, faz a primeira fatia na hora e segue no worker ou em fatias. */
  iniciar(p: Project, opt: Scene3DOptions, visivel: Id | null): void {
    const geracao = this.interromper();
    this.projeto = p;
    this.opcoes = opt;
    this.ordemProjeto = p.levels.map((l) => l.id);
    this.pendentes = ordemDeMontagem(this.ordemProjeto, visivel);
    this.chaves = chavesDoProjeto(p);
    this.prontos = new Map();
    this.antigos = new Map();
    this.forcar.clear();
    this.recebidosDesdeAplicar = 0;
    this.lote = this.worker ? 1 : LOTE_INICIAL;
    this.falhas = 0;
    this.concluido = false;
    // Prewarm completo: todos os níveis já estão resolvidos (segundo plano/cache); o que custa é montar a malha de cada
    // um (cerca de 1 s por pavimento grande). Montar todos num `update` travava a tela por ~9 s: entram em fatias de um
    // pavimento (o visível primeiro), sem worker, cedendo a thread entre elas.
    this.soFatias = this.todosProntos() !== null;
    if (this.soFatias) this.lote = 1;
    if (this.worker && !this.soFatias) this.worker.iniciar(p);
    // Primeira fatia na hora: com worker, só o visível (o primeiro quadro mostra o pavimento ativo).
    this.fatia(geracao);
    if (this.worker && !this.soFatias && this.pendentes.length > 0) this.bombear(geracao);
  }

  /**
   * Atualiza a montagem para `p` sem remontar o que continua válido. A primeira chamada (sem projeto anterior) é o mesmo
   * `iniciar`. As seguintes:
   *   - mesmo projeto, ou os mesmos `elements` e `levels`: tema, arestas, sombras e mostrar/ocultar níveis só reaplicam a
   *     cena — nenhum nível é re-resolvido;
   *   - geometria nova: só os níveis com chave de conteúdo diferente (o editado e os vizinhos por cota) voltam para a
   *     fila, na ordem de montagem com o visível primeiro (ver `revalidar`).
   */
  atualizar(p: Project, opt: Scene3DOptions, visivel: Id | null): void {
    const anterior = this.projeto;
    if (!anterior) return this.iniciar(p, opt, visivel);
    this.projeto = p;
    this.opcoes = opt;
    this.ordemProjeto = p.levels.map((l) => l.id);
    if (p === anterior || (p.elements === anterior.elements && p.levels === anterior.levels)) {
      // Geometria igual: a cena recebe o tema/visibilidade novos com os níveis que já estão prontos.
      this.aplicar();
      if (this.pendentes.length === 0) this.concluir();
      return;
    }
    if (this.tentarRapido(anterior, p)) return;
    this.revalidar(p, visivel);
  }

  /**
   * Edição só de esquadrias com a montagem concluída: pede à cena que troque as peças da parede hospedeira (sem
   * `revalidar`, sem remontar o nível nem os vizinhos). Só o nível editado é re-resolvido, com os caches do motor.
   */
  private tentarRapido(anterior: Project, p: Project): boolean {
    const cena = this.op.cena;
    if (!this.concluido || this.pendentes.length > 0 || !cena.atualizarAberturas || !this.opcoes) return false;
    const edicao = edicaoSoDeEsquadrias(anterior, p);
    if (!edicao || !this.prontos.has(edicao.nivel)) return false;
    const resolvido = this.op.fonte.resolver(edicao.nivel);
    if (!cena.atualizarAberturas(p, anterior, edicao.nivel, edicao.paredes, resolvido, this.opcoes)) return false;
    this.interromper();
    this.prontos.set(edicao.nivel, resolvido);
    this.chaves = chavesDoProjeto(p);
    this.op.aoAtualizar();
    return true;
  }

  /** Para a montagem em curso: os pedidos e as fatias agendadas não fazem mais nada. */
  cancelar(): void {
    this.geracao++;
    this.worker?.cancelar();
    this.limparPrazo();
    this.emVoo.clear();
    this.recebidos.clear();
    this.passoAgendado = false;
    this.projeto = null;
    this.pendentes = [];
    this.prontos = new Map();
    this.antigos = new Map();
    this.chaves = new Map();
    this.forcar.clear();
    this.recebidosDesdeAplicar = 0;
    this.concluido = false;
  }

  /**
   * Monta todos os níveis pendentes de uma vez, sem fatias nem worker. A prévia do Colar alinhado precisa do modelo
   * completo no primeiro quadro: um pavimento por fatia faria a cena "crescer" na frente do usuário.
   */
  montarTudo(): void {
    if (!this.projeto || !this.opcoes) return;
    if (this.pendentes.length === 0) {
      this.aplicar();
      this.concluir();
      return;
    }
    this.interromper();
    for (const id of this.ordemProjeto) {
      if (this.prontos.has(id)) continue;
      this.prontos.set(id, this.nivel(id));
    }
    this.antigos.clear();
    this.pendentes = [];
    this.aplicar();
    this.concluir();
  }

  /** Desliga o worker (desmontagem da vista). Depois disso a montagem ainda funciona em fatias síncronas. */
  encerrar(): void {
    this.cancelar();
    this.worker?.encerrar();
    this.worker = null;
  }

  /**
   * Geometria mudou: compara a chave de conteúdo de cada nível (`chavesDeNivel`) com a da montagem guardada e mantém os
   * que continuam iguais. Só entra na fila o que mudou — o nível editado, os vizinhos por cota e o que entrou ou saiu do
   * projeto. O pipeline é o mesmo de `iniciar` (fatias ou worker), agora sobre uma fila pequena.
   */
  private revalidar(p: Project, visivel: Id | null): void {
    const geracao = this.interromper();
    const chaves = chavesDoProjeto(p);
    const prontos = new Map<Id, ResolvedLevel>();
    const antigos = new Map<Id, ResolvedLevel>();
    for (const id of this.ordemProjeto) {
      const nivel = this.prontos.get(id);
      if (nivel && this.chaves.get(id) === chaves.get(id)) prontos.set(id, nivel);
      // Nível invalidado: a malha antiga (ou a antiga que já esperava) continua na cena até o novo ficar pronto.
      else if (nivel ?? this.antigos.get(id)) antigos.set(id, (nivel ?? this.antigos.get(id))!);
    }
    this.antigos = antigos;
    this.chaves = chaves;
    this.prontos = prontos;
    // Ordem de montagem do projeto (o visível primeiro), só com o que precisa ser re-resolvido.
    this.pendentes = ordemDeMontagem(this.ordemProjeto, visivel).filter((id) => !prontos.has(id));
    // O `pronto` do segundo plano pode ser da versão anterior do projeto; para os níveis alterados, resolvemos de novo.
    this.forcar = new Set(this.pendentes);
    this.soFatias = false;
    this.recebidosDesdeAplicar = 0;
    this.falhas = 0;
    // Uma edição alcança poucos níveis: a primeira fatia sai no mesmo quadro (o nível editado, que é o visível). Os
    // demais níveis alcançados (vizinhos por cota, edição global) entram um por tarefa, e a cena segue mostrando a malha
    // antiga deles até lá (`antigos`): nada some nem pisca. Com gesto de câmera ativo, nem a primeira fatia roda agora.
    this.lote = 1;
    if (this.pendentes.length === 0) {
      this.aplicar();
      return this.concluir();
    }
    this.concluido = false;
    this.worker?.iniciar(p);
    if (this.emGesto()) {
      this.agendar(() => this.esperarGesto(() => this.fatia(geracao)));
      if (this.worker) this.bombear(geracao);
      return;
    }
    this.fatia(geracao);
    if (this.worker && this.pendentes.length > 0) this.bombear(geracao);
  }

  /** Invalida a montagem em curso (fatias e pedidos) e devolve a geração nova. */
  private interromper(): number {
    const geracao = ++this.geracao;
    this.worker?.cancelar();
    this.limparPrazo();
    this.emVoo.clear();
    this.recebidos.clear();
    this.passoAgendado = false;
    return geracao;
  }

  /** Uma fatia síncrona: resolve o próximo lote, atualiza a cena com o que está pronto e agenda a seguinte. */
  private fatia(geracao: number): void {
    if (geracao !== this.geracao || !this.projeto || !this.opcoes) return;
    const inicio = this.relogio();
    for (const id of this.pendentes.splice(0, this.lote)) {
      this.prontos.set(id, this.nivel(id));
      this.antigos.delete(id);
    }
    this.recebidosDesdeAplicar = 0;
    this.aplicar();
    if (this.pendentes.length === 0) return this.concluir();
    // Com worker, a partir daqui cada nível vem de um pedido (a fatia síncrona é só a primeira e a rede de segurança).
    if (this.worker && !this.soFatias) return;
    this.lote = proximoLote(this.lote, this.relogio() - inicio, this.orcamentoMs);
    this.agendar(() => this.esperarGesto(() => this.fatia(geracao)));
  }

  /**
   * Mantém a fila do worker cheia (até `PEDIDOS_EM_VOO` pedidos) na ordem da montagem: enquanto a cena monta um nível,
   * o worker já resolve os próximos. Cada resposta entra na cena na ordem do projeto; um passo de cena por resposta
   * mantém a tarefa curta e o `resolveLevel` fora da thread da interface.
   */
  private bombear(geracao: number): void {
    const worker = this.worker;
    const projeto = this.projeto;
    if (!worker || !projeto || geracao !== this.geracao) return;
    if (this.pendentes.length === 0) return;
    // O segundo plano já entregou: monta um por tarefa, sem pedir ao worker (e sem duplicar o trabalho dele).
    const pronto = this.op.fonte.pronto;
    if (pronto) {
      for (const id of this.pendentes) {
        // Nível alterado: o `pronto` pode ser da versão anterior; pede ao worker (ou resolve na fatia).
        if (this.forcar.has(id)) continue;
        const nivel = pronto.call(this.op.fonte, id);
        if (!nivel || this.recebidos.has(id)) continue;
        this.emVoo.delete(id);
        this.recebidos.set(id, nivel);
        this.pedirPasso(geracao, () => this.montarRecebido(geracao));
        return;
      }
    }
    this.armarPrazo(geracao);
    for (const id of this.pendentes) {
      if (this.emVoo.size >= PEDIDOS_EM_VOO) break;
      if (this.emVoo.has(id) || this.recebidos.has(id)) continue;
      this.emVoo.add(id);
      worker.pedir(id, projeto).then(
        (nivel) => {
          if (geracao !== this.geracao) return;
          this.emVoo.delete(id);
          // Nível que já entrou na cena pela rede de segurança: a resposta atrasada é descartada.
          if (!this.pendentes.includes(id)) return;
          this.recebidos.set(id, nivel);
          // Um nível por tarefa, cedendo a thread e esperando o fim de um gesto de câmera.
          if (this.emGesto()) this.pedirPasso(geracao, () => this.montarRecebido(geracao));
          else this.montarRecebido(geracao);
        },
        () => {
          // Cancelado (outra montagem) ou falhou: só a falha da geração atual vira rede de segurança.
          if (geracao !== this.geracao) return;
          this.emVoo.delete(id);
          this.redeDeSeguranca(geracao);
        },
      );
    }
  }

  /** Agenda um passo da montagem (um nível por tarefa; não empilha passos). */
  private pedirPasso(geracao: number, acao: () => void): void {
    if (this.passoAgendado) return;
    this.passoAgendado = true;
    this.agendar(() =>
      this.esperarGesto(() => {
        this.passoAgendado = false;
        if (geracao === this.geracao) acao();
      }),
    );
  }

  /** Monta o primeiro nível pendente que o worker já entregou (ordem do projeto) e reabastece a fila. */
  private montarRecebido(geracao: number): void {
    if (geracao !== this.geracao || !this.projeto) return;
    this.limparPrazo();
    this.falhas = 0;
    const id = this.pendentes.find((x) => this.recebidos.has(x));
    if (id === undefined) return void this.bombear(geracao);
    const nivel = this.recebidos.get(id)!;
    this.recebidos.delete(id);
    this.pendentes = this.pendentes.filter((x) => x !== id);
    this.prontos.set(id, nivel);
    this.antigos.delete(id);
    this.recebidosDesdeAplicar++;
    // Agrupa as respostas do worker: um `ModelScene.update` a cada 3 níveis, não a cada nível. O primeiro nível e o
    // último sempre entram na cena na hora (primeiro quadro e conclusão).
    if (this.pendentes.length === 0 || this.recebidosDesdeAplicar >= NIVEIS_POR_APLICACAO) {
      this.recebidosDesdeAplicar = 0;
      this.aplicar();
    }
    if (this.pendentes.length === 0) return this.concluir();
    this.bombear(geracao);
  }

  /** O worker não respondeu (ou falhou): calcula um nível na thread da interface e tenta de novo; duas falhas, desiste. */
  private redeDeSeguranca(geracao: number): void {
    if (geracao !== this.geracao || !this.projeto) return;
    this.limparPrazo();
    this.lote = 1;
    if (++this.falhas >= 2) {
      this.worker?.cancelar();
      this.worker = null;
    }
    this.fatia(geracao);
    if (this.worker && this.pendentes.length > 0) this.bombear(geracao);
  }

  /** Prazo da fila do worker: sem resposta nesse tempo, a montagem calcula um nível aqui (rede de segurança). */
  private armarPrazo(geracao: number): void {
    this.limparPrazo();
    this.prazo = setTimeout(() => {
      this.prazo = null;
      if (geracao !== this.geracao || !this.worker) return;
      this.redeDeSeguranca(geracao);
    }, this.prazoWorkerMs);
  }

  private limparPrazo(): void {
    if (this.prazo === null) return;
    clearTimeout(this.prazo);
    this.prazo = null;
  }

  /** Cena com o que já está pronto, na ordem do projeto; avisa a interface. */
  private aplicar(): void {
    if (!this.projeto || !this.opcoes) return;
    const niveis = this.ordemProjeto.flatMap((id) => {
      const nivel = this.prontos.get(id) ?? this.antigos.get(id);
      return nivel ? [nivel] : [];
    });
    this.op.cena.update(this.projeto, niveis, this.opcoes);
    this.op.aoAtualizar();
  }

  private concluir(): void {
    // O projeto fica guardado: a próxima atualização compara as chaves com esta montagem em vez de recomeçar.
    if (this.concluido) return;
    this.concluido = true;
    this.limparPrazo();
    this.op.aoConcluir();
  }

  /**
   * Todos os níveis do projeto já prontos na fonte (`fonte.pronto`), na ordem do projeto. `null` quando não há fonte,
   * o projeto está vazio ou algum nível ainda não chegou — aí a montagem segue progressiva, como antes.
   */
  private todosProntos(): Map<Id, ResolvedLevel> | null {
    const pronto = this.op.fonte.pronto;
    if (!pronto || this.ordemProjeto.length === 0) return null;
    const niveis = new Map<Id, ResolvedLevel>();
    for (const id of this.ordemProjeto) {
      const nivel = pronto.call(this.op.fonte, id);
      if (!nivel) return null;
      niveis.set(id, nivel);
    }
    return niveis;
  }

  /** O pronto em segundo plano quando há; senão o que o worker acabou de entregar; senão calcula. */
  private nivel(id: Id): ResolvedLevel {
    const recebido = this.recebidos.get(id);
    if (recebido) {
      this.recebidos.delete(id);
      this.forcar.delete(id);
      return recebido;
    }
    // Nível alterado: não aceita o `pronto` (pode ser da versão anterior); resolve com o projeto atual.
    if (this.forcar.delete(id)) return this.op.fonte.resolver(id);
    return this.op.fonte.pronto?.(id) ?? this.op.fonte.resolver(id);
  }
}

/** Cena da vista 3D: o contrato da montagem mais o enquadramento inicial (`ModelScene`). */
export interface CenaVista3d extends CenaMontagem {
  fit(): void;
}

/**
 * Montagem da vista 3D do canvas: a interface redesenha a cada fatia, e a primeira vez que o modelo fica pronto a câmera
 * enquadra tudo (uma vez por sessão, como antes: `seen3d`). O enquadramento espera a última fatia, para não pular enquanto
 * os níveis chegam.
 *
 * Os níveis são resolvidos no worker (ver `montagem3dNiveis.ts`); sem `Worker` (ou se ele falhar), a montagem cai nas
 * fatias síncronas de antes, com o mesmo resultado.
 */
export function criarMontagemVista3d(
  cena: CenaVista3d,
  resolver: (id: Id) => ResolvedLevel,
  pronto?: (id: Id) => ResolvedLevel | null,
): Montagem3dProgressiva {
  const montagem: Montagem3dProgressiva = new Montagem3dProgressiva({
    cena,
    fonte: { resolver, pronto },
    aoAtualizar: () => {
      // Barra de progresso da montagem (ver `Progresso3D`): some quando todos os pavimentos estão na cena.
      publicarProgresso3d(montagem.montados, montagem.total);
      useUi.setState((x) => ({ previewTick: x.previewTick + 1 }));
    },
    aoConcluir: () => {
      publicarProgresso3d(montagem.total, montagem.total);
      // Montagem adiantada em segundo plano, com a planta na tela: o enquadramento fica para a primeira vez que a aba 3D aparece.
      if (useUi.getState().seen3d || useUi.getState().view !== '3d') return;
      cena.fit();
      useUi.setState({ seen3d: true });
    },
    worker: criarFonteNiveisWorker(),
  });
  return montagem;
}
