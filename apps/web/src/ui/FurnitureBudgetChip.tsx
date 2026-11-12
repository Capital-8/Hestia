import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { furnitureViewBudget } from '@hestia/render';
import { useProject } from '../editor/controller.ts';
import { fmtNum, useT } from '../editor/i18n.ts';
import { aoMudarOrcamentoMoveis, ultimoOrcamentoMoveis } from '../plugins/furnitureScene.ts';

/**
 * Aviso discreto na barra de status quando os móveis passam de ~2 milhões de triângulos. Usa o orçamento oficial da vista
 * 3D (`furnitureViewBudget`) e o da exportação para o plugin (`ultimoOrcamentoMoveis`); some quando não há excesso.
 */
export function FurnitureBudgetChip(): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const view = useMemo(() => furnitureViewBudget(p), [p]);
  const [, bump] = useState(0);
  useEffect(() => aoMudarOrcamentoMoveis(() => bump((n) => n + 1)), []);
  const out = ultimoOrcamentoMoveis();
  const over = view.excede || out.level !== 'ok';
  if (!over) return null;
  const tri = Math.max(view.triangulos, out.triangles);
  const mi = fmtNum(tri / 1_000_000, 1, lang);
  const text = t('fur_budget_warn', { tri: mi });
  return <span className="badge" role="status" data-testid="furniture-budget" title={text} style={{ cursor: 'help' }}>⚠ {mi} M △</span>;
}
