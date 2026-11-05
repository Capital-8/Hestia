import { ToolBase } from './base.ts';

/**
 * Piso (Revit: Floor). Sem modos próprios: o contorno é criado pelo modo "Criar/Editar perímetro", para onde a faixa
 * desvia a escolha (`PerimeterMode.intercepta`). A classe fica no registro de ferramentas e não chega a ser ativada.
 */
export class FloorTool extends ToolBase {
  readonly id = 'floor';
  readonly label = 'Piso';
  override get hint(): string {
    return this.t('tl_hint_floor');
  }

  protected reset(): void {
    // Sem estado próprio: nada a limpar.
  }

  protected busy(): boolean {
    return false;
  }
}
