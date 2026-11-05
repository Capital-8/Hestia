import type { ReactElement } from 'react';
import type { ArrayAnchor, ArrayKind } from '@hestia/tools';
import { useUi } from '../editor/state.ts';
import { dictOf, useI18n } from '../editor/i18n.ts';
import { NumField } from './fields.tsx';

/** Opções da ferramenta Matriz: tipo (linear ou radial), número de itens, "Mover para" e ângulo total (radial). */
export function ArrayOptionsBar(): ReactElement {
  const o = useUi((s) => s.options);
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const set = (patch: Partial<typeof o>): void => useUi.setState({ options: { ...useUi.getState().options, ...patch } });
  /** Trocar o tipo ou "Mover para" reinicia o passo em andamento (a ferramenta descarta base/centro); a barra de status volta à dica do primeiro passo. */
  const setPasso = (patch: Partial<typeof o>): void => {
    set(patch);
    // O passo recomeça, então o rótulo de entrada (prompt) some até o próximo clique.
    useUi.setState({ status: useUi.getState().options.arrayKind === 'radial' ? t.arr_hint_radial : t.arr_hint_linear, prompt: null });
  };
  const radial = o.arrayKind === 'radial';
  return (
    <>
      <label>
        {t.arr_kind}
        <select
          id="opt-arraykind"
          className="select"
          value={o.arrayKind ?? 'linear'}
          // Radial começa com "Último": 360° divide-se entre os itens (com "Segundo", 360° empilharia todos no mesmo lugar).
          onChange={(e) => setPasso({ arrayKind: e.target.value as ArrayKind, ...(e.target.value === 'radial' ? { arrayAnchor: 'last' as ArrayAnchor } : {}) })}
        >
          <option value="linear">{t.arr_kind_linear}</option>
          <option value="radial">{t.arr_kind_radial}</option>
        </select>
      </label>
      <label>
        {t.arr_anchor}
        <select id="opt-arrayanchor" className="select" value={o.arrayAnchor ?? 'second'} onChange={(e) => setPasso({ arrayAnchor: e.target.value as ArrayAnchor })}>
          <option value="second">{t.arr_anchor_second}</option>
          <option value="last">{t.arr_anchor_last}</option>
        </select>
      </label>
      <label>
        {t.arr_count}
        <NumField
          id="opt-count"
          value={o.arrayCount}
          decimals={0}
          onCommit={(v) => {
            // Menos de 2 itens não é matriz: usa 2 e avisa na barra de status (D5).
            if (Math.round(v) < 2) {
              useUi.setState({ status: t.arr_count_min });
              set({ arrayCount: 2 });
            } else set({ arrayCount: Math.round(v) });
          }}
        />
      </label>
      {radial && (
        <label>
          {t.arr_angle}
          <NumField
            id="opt-arrayangle"
            value={((o.arrayAngle ?? 360) * Math.PI) / 180}
            quantity="angle"
            onCommit={(v) => {
              // Ângulo 0 não gira nada: rejeita e mantém o último valor válido (D4).
              if (Math.abs(v) < 1e-6) useUi.setState({ status: t.arr_angle_zero });
              else set({ arrayAngle: (v * 180) / Math.PI });
            }}
          />
        </label>
      )}
    </>
  );
}
