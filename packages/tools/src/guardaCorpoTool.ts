import { ToolBase } from './base.ts';

/**
 * Ferramenta de guarda-corpo (decisão 0055, Fase 6a). Esqueleto da Fase 1: registrada em `registry.ts` mas fora da faixa
 * da fita até a 6a traçar o caminho manual, com snap em borda de laje, parede e escada.
 */
export class GuardaCorpoTool extends ToolBase {
  readonly id = 'railing';
  readonly label = 'Guarda-corpo';
  readonly hint = 'Guarda-corpo';

  protected reset(): void {
    this.items = [];
  }

  protected busy(): boolean {
    return false;
  }
}
