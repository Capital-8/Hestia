import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLevel, makeMass, makeWall, type Project } from '@hestia/model';
import { assinaturasDoProjeto } from './assinaturasNivel.ts';
import { niveisAfetados } from './resolveLevels.ts';

/** Dois pavimentos, uma parede no térreo e uma massa (no térreo ou no superior). */
function projeto(levelIdMassa: 'lv_0' | 'lv_1', raio = 2): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Superior', elevation: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addMass', mass: makeMass({ id: 'ms', levelId: levelIdMassa, name: 'Coluna', origem: { x: 10, y: 10 }, secoes: [{ z: 0, perfil: { forma: 'circulo', raio }, rotacao: 0, escala: 1, dx: 0, dy: 0 }, { z: 6, perfil: { forma: 'circulo', raio }, rotacao: 0, escala: 1, dx: 0, dy: 0 }] }) });
  return s.project;
}

describe('massa nas assinaturas de conteúdo do nível', () => {
  it('editar uma massa muda a assinatura de massa de TODOS os níveis, inclusive o que ela atravessa', () => {
    const a = assinaturasDoProjeto(projeto('lv_1'));
    const b = assinaturasDoProjeto(projeto('lv_1', 3));
    expect(b.massa.get('lv_0')).not.toBe(a.massa.get('lv_0'));
    expect(b.massa.get('lv_1')).not.toBe(a.massa.get('lv_1'));
  });

  it('editar uma parede não muda a assinatura de massa', () => {
    const p = projeto('lv_0');
    const q = { ...p, elements: { ...p.elements, w0: { ...p.elements.w0!, b: { x: 5, y: 0 } } } } as Project;
    expect(assinaturasDoProjeto(q).massa.get('lv_0')).toBe(assinaturasDoProjeto(p).massa.get('lv_0'));
  });

  it('a resolução dos níveis não é refeita quando só uma massa muda (o projeto novo compartilha o resto)', () => {
    const a = projeto('lv_0');
    const m = a.elements.ms;
    if (!m || m.kind !== 'mass') throw new Error('massa de teste não encontrada');
    const b: Project = { ...a, elements: { ...a.elements, ms: { ...m, secoes: m.secoes.map((s) => ({ ...s, perfil: { forma: 'circulo', raio: 3 } })) } } };
    expect(niveisAfetados(a, b)).toEqual(new Set());
  });
});
