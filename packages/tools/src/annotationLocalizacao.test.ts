import { describe, expect, it } from 'vitest';
import { createEmptyProject, ProjectStore } from '@hestia/model';
import { SpotCoordinateTool, SpotElevationTool } from './annotationExtraTools.ts';
import { makeEnv } from './testEnv.ts';

function ptr(x: number, y: number) {
  return { raw: { x, y }, shift: false, ctrl: false, alt: false };
}

/** Texto do primeiro rótulo da prévia da ferramenta. */
function textoDaPrevia(tool: { preview(): unknown[] }): string {
  const label = tool.preview().find((i) => (i as { kind: string }).kind === 'label') as { text: string } | undefined;
  return label!.text;
}

describe('prévia das cotas com a localização do projeto', () => {
  it('sem localização, a prévia da coordenada de ponto é a de sempre (N e E do projeto)', () => {
    const { env } = makeEnv(new ProjectStore(createEmptyProject()));
    const coord = new SpotCoordinateTool(env);
    coord.move(ptr(10, 20));
    expect(textoDaPrevia(coord)).toBe('N +20,00 m / E +10,00 m');
  });

  it('com localização, a prévia mostra E e N reais (origem 500000 / 7000000, norte 0)', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'setLocalizacao', localizacao: { origemE: 500000, origemN: 7000000, cotaZero: 760, norteVerdadeiro: 0 } });
    const { env } = makeEnv(store);
    const coord = new SpotCoordinateTool(env);
    coord.move(ptr(10, 20));
    expect(textoDaPrevia(coord)).toBe('N +7000020,00 m / E +500010,00 m');
  });

  it('com localização e norte π/2, a prévia gira: E 499980 / N 7000010', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'setLocalizacao', localizacao: { origemE: 500000, origemN: 7000000, cotaZero: 760, norteVerdadeiro: Math.PI / 2 } });
    const { env } = makeEnv(store);
    const coord = new SpotCoordinateTool(env);
    coord.move(ptr(10, 20));
    expect(textoDaPrevia(coord)).toBe('N +7000010,00 m / E +499980,00 m');
  });

  it('com localização, a prévia da cota de elevação mostra a cota exibida (cota zero 760, z 0 → EL +760 m)', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'setLocalizacao', localizacao: { origemE: 0, origemN: 0, cotaZero: 760, norteVerdadeiro: 0 } });
    const { env } = makeEnv(store);
    const elev = new SpotElevationTool(env);
    elev.move(ptr(50, 50));
    expect(textoDaPrevia(elev)).toBe('EL +760,00 m');
  });
});
