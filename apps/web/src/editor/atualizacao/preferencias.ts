import { safeGet, safeSet } from '../storage.ts';
import { PREFERENCIAS_PADRAO, type PreferenciasAtualizacao } from './logica.ts';

const AVISAR_KEY = 'hestia.atualizacao.avisar';
const RECUSADA_KEY = 'hestia.atualizacao.versaoRecusada';

/** "Agora não" vale só para esta sessão; recarregar o app volta a poder avisar. */
let adiado = false;

export function carregarPreferencias(): PreferenciasAtualizacao {
  const avisar = safeGet(AVISAR_KEY);
  const recusada = safeGet(RECUSADA_KEY);
  return {
    avisarAoAbrir: avisar === null ? PREFERENCIAS_PADRAO.avisarAoAbrir : avisar !== '0',
    versaoRecusada: recusada && recusada.trim() !== '' ? recusada : null,
  };
}

/** Liga/desliga o aviso automático; ao religar, uma versão recusada antiga deixa de bloquear. */
export function salvarAvisarAoAbrir(avisar: boolean): void {
  safeSet(AVISAR_KEY, avisar ? '1' : '0');
  if (avisar) safeSet(RECUSADA_KEY, '');
}

export function salvarVersaoRecusada(versao: string): void {
  safeSet(RECUSADA_KEY, versao);
}

export function adiadoNaSessao(): boolean {
  return adiado;
}

export function marcarAdiadoNaSessao(): void {
  adiado = true;
}
