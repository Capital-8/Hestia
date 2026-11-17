import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeMass, type SecaoMassa } from '@hestia/model';
import { cotaDaBase, cotaDoTopo, definirCotas, definirNiveis, escalarAltura } from './massCotas.ts';

const quad = (z: number, rotacao = 0): SecaoMassa => ({ z, perfil: { forma: 'poligono', lados: 4, raio: 5 }, rotacao, escala: 1, dx: 0, dy: 0 });

/** Projeto vazio (lv_0 e um segundo nível) com uma massa de 10 m: z 0, 4, 10; torção 0, 30°, 90°. */
function setup(): { store: ProjectStore; id: string } {
  const store = new ProjectStore(createEmptyProject());
  const lv1 = store.project.levels[1]!;
  store.exec({ type: 'upsertLevel', level: { ...structuredClone(lv1), id: 'lv_9', name: 'Topo', elevation: 25 } });
  store.exec({ type: 'upsertLevel', level: { ...structuredClone(lv1), id: 'lv_7', name: 'Meio', elevation: 6 } });
  store.exec({ type: 'addMass', mass: makeMass({ id: 'ms_c1', levelId: 'lv_0', baseOffset: 2, secoes: [quad(0), quad(4, Math.PI / 6), quad(10, Math.PI / 2)] }) });
  return { store, id: 'ms_c1' };
}
const massa = (s: ProjectStore, id: string) => s.project.elements[id] as ReturnType<typeof makeMass> & { secoes: SecaoMassa[]; baseOffset: number };

describe('cotas absolutas da massa', () => {
  it('cota da base = elevação do nível + baseOffset; topo = base + altura', () => {
    const { store, id } = setup();
    const m = massa(store, id) as never;
    expect(cotaDaBase(store.project, m)).toBe(2);
    expect(cotaDoTopo(store.project, m)).toBe(12);
  });

  it('escalarAltura multiplica os z por 20/10 e fixa o topo', () => {
    expect(escalarAltura([quad(0), quad(4), quad(10)], 20).map((s) => s.z)).toEqual([0, 8, 20]);
  });

  it('editar a cota do topo para 22 reescala z (0, 8, 20), mantém a base em 2 e as rotações', () => {
    const { store, id } = setup();
    const r = definirCotas(store, id, { cotaTopo: 22 }, 'x', 'pt');
    expect(r.ok).toBe(true);
    const m = massa(store, id);
    expect(m.secoes.map((s) => s.z)).toEqual([0, 8, 20]);
    expect(m.baseOffset).toBe(2);
    expect(m.secoes.map((s) => s.rotacao)).toEqual([0, Math.PI / 6, Math.PI / 2]);
  });

  it('editar a altura para 5 reescala z (0, 2, 5)', () => {
    const { store, id } = setup();
    definirCotas(store, id, { altura: 5 }, 'x', 'pt');
    expect(massa(store, id).secoes.map((s) => s.z)).toEqual([0, 2, 5]);
  });

  it('editar a cota da base para 7 move a pilha: baseOffset 7, altura 10 intacta', () => {
    const { store, id } = setup();
    definirCotas(store, id, { cotaBase: 7 }, 'x', 'pt');
    const m = massa(store, id);
    expect(m.baseOffset).toBe(7);
    expect(m.secoes.map((s) => s.z)).toEqual([0, 4, 10]);
  });

  it('base e topo juntos: base 3, topo 8 -> baseOffset 3, altura 5', () => {
    const { store, id } = setup();
    definirCotas(store, id, { cotaBase: 3, cotaTopo: 8 }, 'x', 'pt');
    const m = massa(store, id);
    expect(m.baseOffset).toBe(3);
    expect(m.secoes.map((s) => s.z)).toEqual([0, 2, 5]);
  });

  it('topo abaixo da base ou altura zero é recusado com mensagem e nada muda', () => {
    const { store, id } = setup();
    const r = definirCotas(store, id, { cotaTopo: 2 }, 'x', 'pt');
    expect(r).toEqual({ ok: false, erro: 'A altura da massa precisa ser maior que zero.' });
    expect(definirCotas(store, id, { altura: 0 }, 'x', 'en').erro).toBe('The mass height must be greater than zero.');
    expect(massa(store, id).secoes.map((s) => s.z)).toEqual([0, 4, 10]);
  });

  it('desfazer volta tudo em UM passo', () => {
    const { store, id } = setup();
    definirCotas(store, id, { cotaBase: 3, cotaTopo: 8 }, 'Cotas', 'pt');
    store.undo();
    const m = massa(store, id);
    expect(m.baseOffset).toBe(2);
    expect(m.secoes.map((s) => s.z)).toEqual([0, 4, 10]);
  });

  it('de nível a nível: lv_7 (6 m) até lv_9 (25 m) -> base 6, altura 19; invertido é recusado', () => {
    const { store, id } = setup();
    expect(definirNiveis(store, id, 'lv_7', 'lv_9', 'x', 'pt').ok).toBe(true);
    const m = massa(store, id);
    expect(m.baseOffset).toBe(6);
    expect(m.secoes.at(-1)!.z).toBe(19);
    expect(definirNiveis(store, id, 'lv_9', 'lv_7', 'x', 'pt').erro).toBe('O nível final precisa ficar acima do inicial.');
  });

  it('altura que quebra o passo mínimo de z (0,01 m) é recusada pelo modelo', () => {
    const { store, id } = setup();
    expect(definirCotas(store, id, { altura: 0.02 }, 'x', 'pt').ok).toBe(false);
    expect(massa(store, id).secoes.at(-1)!.z).toBe(10);
  });
});
