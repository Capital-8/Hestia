import type { Vec2 } from '@hestia/geom';
import { newId, normalizarAngulo, type Component, type Familia } from '@hestia/model';
import { ToolBase } from './base.ts';
import { pegadaPreviewItems } from './componentGhost.ts';
import type { PointerInfo } from './types.ts';

/** Passo do giro por tecla: 90° anti-horário. */
const PASSO = Math.PI / 2;

/**
 * Ferramenta Componente (Revit: Place Component): a família e o tipo vêm das opções; o fantasma da pegada segue o
 * cursor e o clique insere uma instância no nível ativo. Fica ativa para colocar várias; R gira 90° (Shift+R −90°),
 * M espelha e Esc sai. Sem família escolhida (ou fora do projeto) nada é inserido.
 */
export class ComponentTool extends ToolBase {
  readonly id = 'component';
  readonly label = 'Componente';
  readonly hint = 'Componente: escolha a família, clique para inserir. R gira 90°, Shift+R −90°, M espelha. Esc sai.';
  private rotation = 0;
  private mirrored = false;
  private lastPointer: PointerInfo | null = null;

  protected reset(): void {
    this.items = [];
    this.inf = null;
    this.lastPointer = null;
    this.rotation = 0;
    this.mirrored = false;
  }

  protected busy(): boolean {
    return false;
  }

  override start(): void {
    super.start();
    this.avisoDaFamilia();
  }

  /** Família do projeto escolhida nas opções, ou null (com a mensagem correspondente na barra de status). */
  private familia(): Familia | null {
    const id = this.env.options().componentFamilyId;
    if (!id) {
      this.env.say('Escolha uma família de componente.');
      return null;
    }
    const familia = this.env.project().componentFamilies?.[id];
    if (!familia) {
      this.env.say('Família de componente não encontrada no projeto.');
      return null;
    }
    return familia;
  }

  /** Aviso de abertura sem mexer na prévia (a família pode ser escolhida depois, na barra de opções). */
  private avisoDaFamilia(): void {
    const id = this.env.options().componentFamilyId;
    if (!id) this.env.say('Escolha uma família de componente.');
    else if (!this.env.project().componentFamilies?.[id]) this.env.say('Família de componente não encontrada no projeto.');
  }

  /** Instância de prévia (id fixo) ou a que será inserida, na posição e com a rotação/espelho correntes. */
  private draft(familia: Familia, at: Vec2, id: string): Component {
    return {
      id,
      kind: 'component',
      familyId: familia.id,
      typeId: this.env.options().componentTypeId ?? null,
      levelId: this.env.levelId(),
      x: at.x,
      y: at.y,
      z: 0,
      rotation: this.rotation,
      mirrored: this.mirrored,
      values: undefined,
      mark: '',
      order: 0,
    };
  }

  /** Redesenha a prévia na última posição do ponteiro (depois de girar ou espelhar). */
  private refreshPreview(): void {
    if (this.lastPointer) this.move(this.lastPointer);
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.lastPointer = p;
    this.items = [];
    const familia = this.familia();
    if (!familia) {
      this.inf = null;
      return;
    }
    const inf = this.snap(p);
    const c = this.draft(familia, inf.point, 'preview');
    this.items.push(...pegadaPreviewItems(this.env.project(), c), { kind: 'point', at: inf.point });
  }

  override click(p: PointerInfo): void {
    this.move(p);
    const familia = this.familia();
    if (!familia) return;
    const at = this.inf?.point ?? p.raw;
    const c = this.draft(familia, at, newId('cm'));
    try {
      this.env.transaction('Inserir componente', () => this.env.exec({ type: 'addComponent', component: c }));
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : String(e));
      return;
    }
    this.env.say(`${familia.nome} inserido. Clique para inserir outro; Esc sai.`);
  }

  /** R gira 90° anti-horário (sentido 1) ou horário (sentido −1). */
  rotate(sentido: 1 | -1 = 1): void {
    this.rotation = normalizarAngulo(this.rotation + sentido * PASSO);
    this.refreshPreview();
  }

  /** M espelha a instância no eixo local X. */
  mirror(): void {
    this.mirrored = !this.mirrored;
    this.refreshPreview();
  }

  /** Espaço também gira (Revit: Place Component), além de R/Shift+R. */
  override space(): void {
    this.rotate(1);
  }

  /** Atalhos da ferramenta: R/Shift+R giram, M espelha. */
  key(tecla: string, shift = false): boolean {
    const k = tecla.toLowerCase();
    if (k === 'r') {
      this.rotate(shift ? -1 : 1);
      return true;
    }
    if (k === 'm') {
      this.mirror();
      return true;
    }
    return false;
  }
}
