import { ToolBase } from './base.ts';

/**
 * Telhado (id `roof` do registro). Criar e editar passam pelo modo de perímetro: a faixa abre "Criar/Editar perímetro"
 * para o telhado (`PerimeterMode.intercepta`), então esta ferramenta não desenha nada. Existe só porque o registro
 * (`createTool`) precisa de uma ferramenta para cada id.
 */
export class RoofTool extends ToolBase {
  readonly id = 'roof';
  readonly label = 'Telhado';
  readonly hint = this.t('tl_hint_roof');

  protected reset(): void {}

  protected busy(): boolean {
    return false;
  }
}
