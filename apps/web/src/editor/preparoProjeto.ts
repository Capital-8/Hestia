/**
 * Fila de preparo do projeto em segundo plano (fase 2 da abertura). Pura: o agendador, o relógio e o detector de
 * atividade do usuário são injetados, então o teste controla o tempo.
 *
 * Regras:
 *  - uma tarefa por vez, na ordem de prioridade (menor número primeiro; empate pela ordem de entrada);
 *  - antes de iniciar uma tarefa, se o usuário está em gesto (`usuarioAtivo`), espera `esperaMs` e tenta de novo;
 *  - tarefa `pesada` (trabalho de CPU na thread principal) só começa `intervaloPesadasMs` depois do fim da anterior,
 *    para a interface tratar os eventos acumulados entre duas delas;
 *  - `priorizar(id)` leva a tarefa (e, com `priorizarGrupo`, as que casam) para a frente da fila;
 *  - `cancelar()` descarta tudo: o que estava em curso termina, mas o resultado é ignorado e nada novo começa.
 */

export interface TarefaPreparo {
  id: string;
  /** Grupo para o progresso e para `priorizarGrupo` (ex.: 'nivel', 'planta', 'corte'). */
  grupo: string;
  prioridade: number;
  /** Trabalho de CPU na thread principal (espaçado pelas outras regras). */
  pesada?: boolean;
  /** Executa a tarefa; pode devolver uma promessa (a fila espera). Erros são engolidos: o preparo é só aceleração. */
  executar(): void | Promise<void>;
}

export interface ProgressoPreparo {
  feitas: number;
  total: number;
  /** Grupo da tarefa em curso (ou da próxima), para o rótulo. */
  grupo: string | null;
}

export interface OpcoesPreparo {
  /** Agenda `f` para um turno ocioso do navegador, daqui a `atrasoMs`; devolve o cancelamento. */
  agendar(f: () => void, atrasoMs: number): () => void;
  agora(): number;
  /** O usuário fez algo nos últimos `janelaMs`? (sem argumento: a janela curta de um gesto). */
  usuarioAtivo?(janelaMs?: number): boolean;
  aoProgresso?(p: ProgressoPreparo): void;
  esperaMs?: number;
  intervaloPesadasMs?: number;
  /** Tarefa pesada só começa com o usuário parado por este tempo (ms). */
  ociosoParaPesadasMs?: number;
}

export class PreparoProjeto {
  private fila: TarefaPreparo[] = [];
  private ordem = 0;
  private readonly ordens = new Map<string, number>();
  private feitas = 0;
  private total = 0;
  private geracao = 0;
  private rodando = false;
  private emCurso: TarefaPreparo | null = null;
  private fimUltima = Number.NEGATIVE_INFINITY;
  private cancelaAgenda: (() => void) | null = null;
  private readonly esperaMs: number;
  private readonly intervaloMs: number;

  constructor(private readonly o: OpcoesPreparo) {
    this.esperaMs = o.esperaMs ?? 150;
    this.intervaloMs = o.intervaloPesadasMs ?? 60;
  }

  get progresso(): ProgressoPreparo {
    return { feitas: this.feitas, total: this.total, grupo: this.emCurso?.grupo ?? this.fila[0]?.grupo ?? null };
  }

  get pendentes(): number {
    return this.fila.length + (this.emCurso ? 1 : 0);
  }

  adicionar(t: TarefaPreparo): void {
    if (this.fila.some((x) => x.id === t.id) || this.emCurso?.id === t.id) return;
    this.ordens.set(t.id, this.ordem++);
    this.fila.push(t);
    this.total++;
    this.ordenar();
    this.avisar();
    this.agendarProxima(0);
  }

  /** Leva a tarefa `id` à frente da fila. Devolve false se ela não está pendente. */
  priorizar(id: string): boolean {
    const t = this.fila.find((x) => x.id === id);
    if (!t) return false;
    t.prioridade = Number.NEGATIVE_INFINITY;
    this.ordenar();
    return true;
  }

  priorizarGrupo(grupo: string, casa: (id: string) => boolean): void {
    for (const t of this.fila) if (t.grupo === grupo && casa(t.id)) t.prioridade = Number.NEGATIVE_INFINITY;
    this.ordenar();
  }

  /** Descarta a fila (nova abertura, edição que invalida). */
  cancelar(): void {
    this.geracao++;
    this.fila = [];
    this.ordens.clear();
    this.cancelaAgenda?.();
    this.cancelaAgenda = null;
    this.rodando = false;
    this.emCurso = null;
    this.feitas = 0;
    this.total = 0;
    this.avisar();
  }

  private ordenar(): void {
    this.fila.sort((a, b) => (a.prioridade === b.prioridade ? this.ordens.get(a.id)! - this.ordens.get(b.id)! : a.prioridade < b.prioridade ? -1 : 1));
  }

  private avisar(): void {
    this.o.aoProgresso?.(this.progresso);
  }

  private agendarProxima(atraso: number): void {
    if (this.rodando || this.cancelaAgenda || this.fila.length === 0) return;
    const g = this.geracao;
    this.cancelaAgenda = this.o.agendar(() => {
      this.cancelaAgenda = null;
      if (g === this.geracao) this.passo(g);
    }, atraso);
  }

  private passo(g: number): void {
    const t = this.fila[0];
    if (!t || this.rodando) return;
    if (this.o.usuarioAtivo?.(t.pesada ? this.o.ociosoParaPesadasMs : undefined)) return this.agendarProxima(this.esperaMs);
    if (t.pesada) {
      const falta = this.fimUltima + this.intervaloMs - this.o.agora();
      if (falta > 0) return this.agendarProxima(falta);
    }
    this.fila.shift();
    this.emCurso = t;
    this.rodando = true;
    this.avisar();
    const terminar = (): void => {
      if (g !== this.geracao) return;
      this.rodando = false;
      this.emCurso = null;
      this.feitas++;
      this.fimUltima = this.o.agora();
      this.avisar();
      this.agendarProxima(0);
    };
    try {
      const r = t.executar();
      if (r && typeof (r as Promise<void>).then === 'function') (r as Promise<void>).then(terminar, terminar);
      else terminar();
    } catch {
      terminar();
    }
  }
}
