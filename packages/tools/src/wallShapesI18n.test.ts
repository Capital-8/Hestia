import { describe, expect, it } from 'vitest';
import { P, clickAt, makeEnv, tool } from './testEnv.ts';
import type { Lang } from './i18n.ts';
import type { ToolOptions } from './types.ts';

/** Mensagens de status das formas da Parede no idioma do ambiente (padrão pt). */
const mensagens = (shape: ToolOptions['wallShape'], lang?: Lang) => {
  const ctx = makeEnv();
  Object.assign(ctx.options, { wallShape: shape });
  const said: string[] = [];
  const env = { ...ctx.env, say: (m: string) => { said.push(m); }, lang: lang ? () => lang : undefined };
  const t = tool('wall', env);
  clickAt(t, 0, 0);
  t.move(P(3, 0));
  return said.at(-1);
};

describe('wallTool: mensagens das formas no idioma do ambiente', () => {
  it('padrão é português', () => {
    expect(mensagens('polygon')).toBe('Clique para definir o raio.');
    expect(mensagens('spline')).toBe('Clique para os próximos pontos; Enter termina aberta, clique no primeiro ponto fecha.');
    expect(mensagens('ellipse')).toBe('Clique na ponta do primeiro semieixo.');
  });

  it('inglês e alemão usam o dicionário da ferramenta', () => {
    expect(mensagens('circle', 'en')).toBe('Click to set the radius.');
    expect(mensagens('ellipse', 'en')).toBe('Click the tip of the first semi-axis.');
    expect(mensagens('spline', 'de')).toBe('Klicken Sie die nächsten Punkte; Enter beendet sie offen, Klick auf den ersten Punkt schließt sie.');
  });
});
