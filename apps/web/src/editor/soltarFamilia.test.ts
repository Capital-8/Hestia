import { describe, expect, it } from 'vitest';
import {
  posarArrastado as posarArrastadoReal,
  type CaixaLocal,
  type EntradaArrasto,
  type FaceDeParede,
} from '@hestia/engine';
import { createEmptyProject, familiaDaBiblioteca, ProjectStore, type Id } from '@hestia/model';
import { soltarFamilia, type DepsSoltarFamilia } from './soltarFamilia.ts';

const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [1.2, 0.6, 0.9] };

/** Dependências de teste: sem entorno, a pose desejada é devolvida intacta. */
function deps(overrides: Partial<DepsSoltarFamilia> = {}): { deps: DepsSoltarFamilia; avisos: string[]; selecionados: Id[][] } {
  const avisos: string[] = [];
  const selecionados: Id[][] = [];
  let sequencia = 0;
  const base: DepsSoltarFamilia = {
    caixaLocalDoComponente: () => CAIXA,
    corposDoNivel: () => [],
    facesDasParedes: () => [],
    posarArrastado: (entrada) => ({ pose: entrada.alvo.pose, colisoes: { moveis: [], paredes: [] }, guias: [] }),
    familiaDaBiblioteca,
    newId: (prefix) => `${prefix}_${++sequencia}`,
    selecionar: (ids) => selecionados.push(ids),
    avisar: (mensagem) => avisos.push(mensagem),
  };
  return { deps: { ...base, ...overrides }, avisos, selecionados };
}

describe('soltarFamilia', () => {
  it('ponto no vazio cria o componente na posição, carrega a família e seleciona o novo id', () => {
    const store = new ProjectStore(createEmptyProject());
    const d = deps();
    const r = soltarFamilia({ store, familiaId: 'fam_comoda', levelId: 'lv_0', ponto: { x: 1.5, y: 2.25 }, deps: d.deps });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const componente = store.project.elements[r.id];
    expect(componente?.kind).toBe('component');
    if (componente?.kind !== 'component') return;
    expect(componente.x).toBe(1.5);
    expect(componente.y).toBe(2.25);
    expect(componente.rotation).toBe(0);
    expect(componente.levelId).toBe('lv_0');
    expect(componente.typeId).toBeNull();
    expect(store.project.componentFamilies?.fam_comoda).toBeDefined();
    expect(d.selecionados).toEqual([[r.id]]);
  });

  it('ponto perto de parede encaixa pela face simulada nas dependências', () => {
    const store = new ProjectStore(createEmptyProject());
    const faces: FaceDeParede[] = [{ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }];
    const vistas: EntradaArrasto[] = [];
    const d = deps({
      facesDasParedes: () => faces,
      posarArrastado: (entrada, opcoes) => {
        vistas.push(entrada);
        return posarArrastadoReal(entrada, opcoes);
      },
    });
    const r = soltarFamilia({ store, familiaId: 'fam_gaveta', levelId: 'lv_0', ponto: { x: 1, y: 0.4 }, deps: d.deps });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parede).toBe(0);
    expect(vistas[0]?.faces).toEqual(faces);
    const componente = store.project.elements[r.id];
    if (componente?.kind !== 'component') throw new Error('componente não criado');
    expect(componente.y).toBeCloseTo(0.6, 6);
    expect(Math.abs(componente.rotation)).toBeCloseTo(Math.PI, 6);
  });

  it('família da biblioteca com dependência carrega também a fam_gaveta', () => {
    const store = new ProjectStore(createEmptyProject());
    const d = deps();
    const r = soltarFamilia({ store, familiaId: 'fam_comoda', levelId: 'lv_0', ponto: { x: 0, y: 0 }, deps: d.deps });

    expect(r.ok).toBe(true);
    expect(store.project.componentFamilies?.fam_comoda).toBeDefined();
    expect(store.project.componentFamilies?.fam_gaveta).toBeDefined();
  });

  it('desfazer remove o componente e as famílias carregadas num único passo', () => {
    const store = new ProjectStore(createEmptyProject());
    const d = deps();
    const r = soltarFamilia({ store, familiaId: 'fam_comoda', levelId: 'lv_0', ponto: { x: 0, y: 0 }, deps: d.deps });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(store.project.elements[r.id]).toBeDefined();
    store.undo();
    expect(store.project.elements[r.id]).toBeUndefined();
    expect(store.project.componentFamilies?.fam_comoda).toBeUndefined();
    expect(store.project.componentFamilies?.fam_gaveta).toBeUndefined();
  });

  it('nível inexistente avisa e não cria nada', () => {
    const store = new ProjectStore(createEmptyProject());
    const d = deps();
    const r = soltarFamilia({ store, familiaId: 'fam_comoda', levelId: 'lv_inexistente', ponto: { x: 0, y: 0 }, deps: d.deps });

    expect(r.ok).toBe(false);
    expect(Object.values(store.project.elements).some((e) => e.kind === 'component')).toBe(false);
    expect(store.project.componentFamilies?.fam_comoda).toBeUndefined();
    expect(d.avisos[0]).toMatch(/Nível/);
  });
});
