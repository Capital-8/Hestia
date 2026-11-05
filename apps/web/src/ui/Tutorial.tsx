import { useEffect, type ReactElement } from 'react';
import { isWall, type Wall } from '@hestia/model';
import { editor, useProject, useProjectVersion } from '../editor/controller.ts';
import { markTutorialSeen, tutorialSeen } from '../editor/storage.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { sufixoAtalho } from '../editor/shortcutConfig.ts';

/** Há um circuito fechado: alguma ligação de paredes fecha um ciclo (pontas com tolerância de 1 mm). */
export function temCircuito(paredes: Wall[]): boolean {
  if (paredes.length < 4) return false;
  const pai = new Map<string, string>();
  const raiz = (k: string): string => {
    const p = pai.get(k) ?? k;
    if (p === k) return k;
    const r = raiz(p);
    pai.set(k, r);
    return r;
  };
  const ponto = (q: { x: number; y: number }): string => {
    const k = `${Math.round(q.x * 1000)},${Math.round(q.y * 1000)}`;
    if (!pai.has(k)) pai.set(k, k);
    return k;
  };
  for (const w of paredes) {
    const a = raiz(ponto(w.a));
    const b = raiz(ponto(w.b));
    if (a === b) return true;
    pai.set(a, b);
  }
  return false;
}

export function Tutorial(): ReactElement | null {
  const { t } = useT();
  // Fechado uma vez (Dispensar ou Concluir, ou quando os 5 passos se cumprem), não volta nos próximos projetos em branco (localStorage, ver markTutorialSeen).
  const on = useUi((s) => s.tutorial) && !tutorialSeen();
  const seen3d = useUi((s) => s.seen3d);
  const view = useUi((s) => s.view);
  const p = useProject();
  useProjectVersion();
  // Os passos seguem o estado REAL do projeto: o primeiro passo ainda não cumprido é o atual.
  const els = Object.values(p.elements);
  const walls = els.filter(isWall);
  const steps: Array<[string, boolean]> = [
    [t('shc_tut_step_walls', { w: sufixoAtalho('wall') }), temCircuito(walls)],
    [t('shc_tut_step_openings', { d: sufixoAtalho('door'), n: sufixoAtalho('window') }), els.some((e) => e.kind === 'door') && els.some((e) => e.kind === 'window')],
    [t('shc_tut_step_type'), walls.some((w) => w.typeId !== p.defaults.wallTypeId)],
    [t('shc_tut_step_3d'), seen3d || view === '3d'],
    [t('shc_tut_step_save'), !editor.store.dirty && els.length > 0],
  ];
  const now = steps.findIndex(([, d]) => !d);
  const feito = now === -1;
  // Cumpridos os 5 passos, a faixa some e fica marcada como vista (igual a Concluir).
  useEffect(() => {
    if (!on || !feito) return;
    markTutorialSeen();
    useUi.setState({ tutorial: false });
  }, [on, feito]);
  if (!on || feito) return null;
  const close = (): void => {
    markTutorialSeen();
    useUi.setState({ tutorial: false });
  };
  return (
    <div className="tutorial" role="region" aria-label={t('shc_tut_title')}>
      <span className="step-count">{t('shc_tut_progress', { n: now + 1, total: steps.length })}</span>
      <span className="step-text">{steps[now]![0]}</span>
      <span className="dots" aria-hidden="true">
        {steps.map(([, d], i) => (
          <span key={i} className={`pip${d ? ' done' : i === now ? ' now' : ''}`} />
        ))}
      </span>
      <button className="btn small" onClick={close}>{t('shc_tut_dismiss')}</button>
    </div>
  );
}
