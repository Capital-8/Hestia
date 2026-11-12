import { useMemo, type ReactElement } from 'react';
import { useProject } from '../editor/controller.ts';
import { furnitureBudget } from '../editor/furniture/budget.ts';
import { fmtNum, useT } from '../editor/i18n.ts';

/** Aviso discreto na barra de status quando os móveis passam de ~2 milhões de triângulos; some quando não há excesso. */
export function FurnitureBudgetChip(): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const b = useMemo(() => furnitureBudget(p), [p]);
  if (!b.over) return null;
  const text = t('fur_budget_warn', { tri: fmtNum(b.triangles / 1_000_000, 1, lang) });
  return <span className="badge" role="status" data-testid="furniture-budget" title={text} style={{ cursor: 'help' }}>⚠ {fmtNum(b.triangles / 1_000_000, 1, lang)} M △</span>;
}
