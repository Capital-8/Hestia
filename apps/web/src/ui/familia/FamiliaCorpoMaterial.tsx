import { APELIDOS_MATERIAL_CORPO, corDoMaterialInstalacao, MAPA_ACABAMENTOS, OPCOES_MATERIAL_CORPO, resolverMaterialVisualCorpo, type Corpo } from '@hestia/model';
import type { ReactElement } from 'react';

/*
 * Seletor de material do corpo (ficha K3): lista de materiais de instalações e estrutura com amostra de cor. O campo de texto ao lado
 * continua aceitando o id de um parâmetro `material` ou de um material do projeto. Textos em português fixo, como a faixa do editor.
 */

const corDoVisual = (id: string): string => corDoMaterialInstalacao(id) ?? MAPA_ACABAMENTOS[id]?.cor ?? '#a9adb2';

export function FamiliaCorpoMaterial({ corpo, aplicar }: { corpo: Corpo; aplicar: (material: string | undefined) => void }): ReactElement {
  const atual = corpo.material ?? '';
  const ehOpcao = OPCOES_MATERIAL_CORPO.some((o) => o.apelido === atual);
  const visual = resolverMaterialVisualCorpo(atual === '' ? null : atual, {}, (id) => MAPA_ACABAMENTOS[id] !== undefined);
  return (
    <label className="fam-corpo-material">
      <span>Material do corpo</span>
      <span className="fam-corpo-amostra" aria-hidden style={{ background: corDoVisual(APELIDOS_MATERIAL_CORPO[atual] ?? visual) }} />
      <select
        id={`fcn-${corpo.id}-material-lista`}
        aria-label="Material do corpo"
        value={ehOpcao ? atual : ''}
        onChange={(e) => aplicar(e.target.value === '' ? undefined : e.target.value)}
      >
        <option value="">{atual === '' ? '(sem material: cinza neutro)' : ehOpcao ? '(sem material)' : `(personalizado: ${atual})`}</option>
        {OPCOES_MATERIAL_CORPO.map((o) => <option key={o.apelido} value={o.apelido}>{o.nome}</option>)}
      </select>
    </label>
  );
}
