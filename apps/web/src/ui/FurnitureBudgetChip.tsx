import { useMemo, type ReactElement } from 'react';
import { furnitureViewBudget } from '@hestia/render';
import { useProject } from '../editor/controller.ts';
import { fmtNum, useT } from '../editor/i18n.ts';

/**
 * Aviso discreto na barra de status quando os móveis passam de ~2 milhões de triângulos. Usa o orçamento oficial da vista
 * 3D (`furnitureViewBudget`); some quando não há excesso.
 */
export function FurnitureBudgetChip(): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const view = useMemo(() => furnitureViewBudget(p), [p]);
  if (!view.excede) return null;
  const tri = view.triangulos;
  const mi = fmtNum(tri / 1_000_000, 1, lang);
  const text = t('fur_budget_warn', { tri: mi });
  return <span className="badge" role="status" data-testid="furniture-budget" title={text} style={{ cursor: 'help' }}>⚠ {mi} M △</span>;
}
