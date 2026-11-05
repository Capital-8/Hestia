import { ToolBase } from './base.ts';

/**
 * Laje (Revit: Floor estrutural / ArchiCAD: Slab). Sem modos próprios: o contorno é criado pelo modo "Criar/Editar
 * perímetro", para onde a faixa desvia a escolha (`PerimeterMode.intercepta`). A classe fica no registro de ferramentas
 * e não chega a ser ativada.
 */
export class SlabTool extends ToolBase {
  readonly id = 'slab';
  readonly label = 'Laje';
  override get hint(): string {
    return this.t('tl_hint_slab');
  }

  protected reset(): void {
    // Sem estado próprio: nada a limpar.
  }

  protected busy(): boolean {
    return false;
  }
}
