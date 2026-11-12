import type { ReactElement } from 'react';
import { isRamp, isStair, type Id } from '@hestia/model';
import { criarGuardaCorpoDeEscada, criarGuardaCorpoDeRampa, mensagensDeGuardaCorpo, removerGuardaCorpoDeHospedeiro, temGuardaCorpoDeHospedeiro } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useT, type Lang } from '../editor/i18n.ts';
import { pedirAlerta } from '../editor/alertaPrompt.ts';
import { Check, Row } from './fields.tsx';

/**
 * Liga/desliga o guarda-corpo de uma escada ou rampa (decisão 0055): ligar cria o guarda-corpo hospedado nos dois lados (aparece na hora,
 * o Rust o desenha); desligar remove os hospedados. Editar a escada refaz o guarda-corpo, pois o caminho vem do hospedeiro a cada consulta.
 * Cada gesto é um único passo de desfazer.
 */
export function ligarGuardaCorpoDoHospedeiro(hostId: Id, ligar: boolean, lang: Lang, rotulo: string): void {
  const env = {
    project: () => editor.project,
    exec: (cmd: Parameters<typeof editor.store.exec>[0]) => editor.store.exec(cmd, rotulo),
    setSelection: () => {},
  };
  if (!ligar) {
    editor.store.transaction(rotulo, () => void removerGuardaCorpoDeHospedeiro(env, hostId));
    return;
  }
  const host = editor.project.elements[hostId];
  const msgs = mensagensDeGuardaCorpo(lang);
  const r = isStair(host) ? criarGuardaCorpoDeEscada(env, hostId, msgs) : isRamp(host) ? criarGuardaCorpoDeRampa(env, hostId, msgs) : { error: msgs.noHost };
  if ('error' in r) pedirAlerta(r.error);
}

export function GuardaCorpoDoHospedeiro({ hostId, htmlFor }: { hostId: Id; htmlFor: string }): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const ligado = temGuardaCorpoDeHospedeiro(p, hostId);
  return (
    <Row label={t('gc_host_toggle')} htmlFor={htmlFor}>
      <Check id={htmlFor} checked={ligado} onChange={(v) => ligarGuardaCorpoDoHospedeiro(hostId, v, lang, t(v ? 'gc6a_undo_create' : 'gc_host_toggle_off'))} />
    </Row>
  );
}
