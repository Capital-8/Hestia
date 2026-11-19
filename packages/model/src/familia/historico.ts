import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';

/*
 * Histórico de desfazer/refazer do editor de famílias (molde: `ProjectStore` em `history.ts`, que usa patches do immer).
 * FICHA E1-historico: implementar a classe. Testes em `historico.test.ts`. Genérica: serve a qualquer estado imutável `T`.
 */

enablePatches();

type Ouvinte = () => void;

interface Passo {
  rotulo: string;
  patches: Patch[];
  inverso: Patch[];
}

/** Grupo aberto por `agrupar`: acumula os patches dos `exec` internos até fechar. */
interface Grupo {
  rotulo: string;
  patches: Patch[];
  inverso: Patch[];
}

export class HistoricoFamilia<T extends object> {
  /** Contador que cresce a cada mudança de `atual` (exec, desfazer, refazer); chave de cache para a interface. */
  versao = 0;

  private atualInterno: T;
  private readonly limite: number;
  private passados: Passo[] = [];
  private futuros: Passo[] = [];
  private ouvintes = new Set<Ouvinte>();
  private grupo: Grupo | null = null;

  /** `limite`: máximo de passos guardados em "desfazer"; ao passar disso o mais antigo é descartado. */
  constructor(inicial: T, limite = 200) {
    this.atualInterno = inicial;
    this.limite = Math.max(0, Math.floor(limite));
  }

  /** Estado atual (objeto imutável; nunca é alterado no lugar: cada mudança cria um novo). */
  get atual(): T {
    return this.atualInterno;
  }

  get podeDesfazer(): boolean {
    return this.passados.length > 0;
  }

  get podeRefazer(): boolean {
    return this.futuros.length > 0;
  }

  /** Rótulo do próximo passo a desfazer / refazer, ou `null`. */
  get rotuloDesfazer(): string | null {
    return this.passados[this.passados.length - 1]?.rotulo ?? null;
  }

  get rotuloRefazer(): string | null {
    return this.futuros[this.futuros.length - 1]?.rotulo ?? null;
  }

  /**
   * Aplica `receita` (estilo immer: altera o rascunho) como UM passo de desfazer chamado `rotulo`. Limpa o "refazer".
   * Se a receita não mudar nada (nenhum patch), NÃO cria passo nem notifica. Se lançar, o estado e o histórico ficam
   * como estavam e a exceção sobe. Dentro de `agrupar`, o passo entra no grupo em vez de criar um próprio.
   */
  exec(rotulo: string, receita: (rascunho: Draft<T>) => void): void {
    const [seguinte, patches, inverso] = produceWithPatches(this.atualInterno, (rascunho) => {
      receita(rascunho);
    });
    if (patches.length === 0) return;
    this.atualInterno = seguinte;
    if (this.grupo) {
      this.grupo.patches.push(...patches);
      this.grupo.inverso.unshift(...inverso);
      return;
    }
    this.passados.push({ rotulo, patches, inverso });
    this.futuros = [];
    this.descartarAntigos();
    this.emitir();
  }

  /**
   * Junta tudo que `fn` executar via `exec` num único passo `rotulo` (arrastar uma cota = 1 desfazer). Se nada mudar, não
   * cria passo. Se `fn` lançar, o estado volta ao de antes do grupo. Grupos aninhados valem como um só (o de fora manda).
   */
  agrupar(rotulo: string, fn: () => void): void {
    if (this.grupo) {
      fn();
      return;
    }
    const antes = this.atualInterno;
    const grupo: Grupo = { rotulo, patches: [], inverso: [] };
    this.grupo = grupo;
    try {
      fn();
    } catch (erro) {
      this.grupo = null;
      this.atualInterno = antes;
      throw erro;
    }
    this.grupo = null;
    if (grupo.patches.length === 0) return;
    this.passados.push({ rotulo: grupo.rotulo, patches: grupo.patches, inverso: grupo.inverso });
    this.futuros = [];
    this.descartarAntigos();
    this.emitir();
  }

  /** Devolve `false` (sem efeito) quando não há o que desfazer. */
  desfazer(): boolean {
    const passo = this.passados.pop();
    if (!passo) return false;
    this.atualInterno = applyPatches(this.atualInterno, passo.inverso);
    this.futuros.push(passo);
    this.emitir();
    return true;
  }

  refazer(): boolean {
    const passo = this.futuros.pop();
    if (!passo) return false;
    this.atualInterno = applyPatches(this.atualInterno, passo.patches);
    this.passados.push(passo);
    this.descartarAntigos();
    this.emitir();
    return true;
  }

  /** Chamado depois de cada mudança de `atual`. Devolve a função que cancela a assinatura. */
  assinar(ouvinte: Ouvinte): () => void {
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  }

  private descartarAntigos(): void {
    const excedente = this.passados.length - this.limite;
    if (excedente > 0) this.passados.splice(0, excedente);
  }

  private emitir(): void {
    this.versao += 1;
    // Copia a lista: um ouvinte pode cancelar a própria assinatura durante a notificação.
    for (const ouvinte of [...this.ouvintes]) ouvinte();
  }
}
