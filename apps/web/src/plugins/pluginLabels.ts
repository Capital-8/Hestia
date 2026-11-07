import { CAPABILITIES, type Capability, type PluginState } from '@hestia/plugin-api';

type Lang = string;
const en = (lang: Lang): boolean => lang !== 'pt';

/** Rótulo do estado do plugin, no idioma da interface. */
export function stateLabel(s: PluginState, lang: Lang): string {
  const pt: Record<PluginState, string> = { absent: 'Ausente', disconnected: 'Desconectado', connecting: 'Conectando…', connected: 'Conectado', reconnecting: 'Reconectando…', incompatible: 'Incompatível' };
  const e: Record<PluginState, string> = { absent: 'Not found', disconnected: 'Disconnected', connecting: 'Connecting…', connected: 'Connected', reconnecting: 'Reconnecting…', incompatible: 'Incompatible' };
  return en(lang) ? e[s] : pt[s];
}

const CAP_EN: Record<Capability, string> = {
  'scene.read': 'Read the model scene',
  'camera.read': 'Read the 3D camera',
  'events.subscribe': 'Receive change events',
  'camera.write': 'Sync the camera (control the 3D view)',
  'overrides.write': 'Save view-only material overrides',
};

export const capabilityLabel = (c: Capability, lang: Lang): string => (en(lang) ? CAP_EN[c] : CAPABILITIES[c]);

/** Frase que explica o estado ao usuário (o que fazer a seguir). */
export function stateHelp(s: PluginState, lang: Lang, hasError: boolean): string {
  const pt: Record<PluginState, string> = {
    absent: 'Nenhum programa responde neste endereço local. Abra o programa externo e use Conectar.',
    disconnected: 'O plugin já foi visto, mas não está conectado agora.',
    connecting: 'Procurando o programa externo neste computador…',
    connected: 'Sincronizando a cena com o programa externo.',
    reconnecting: 'A conexão caiu; tentando de novo automaticamente.',
    incompatible: 'O programa externo respondeu, mas a versão ou o manifesto não servem para este Hestia.',
  };
  const e: Record<PluginState, string> = {
    absent: 'No program answers at this local address. Start the external program, then press Connect.',
    disconnected: 'The plugin was seen before but is not connected now.',
    connecting: 'Looking for the external program on this computer…',
    connected: 'The scene is syncing with the external program.',
    reconnecting: 'The connection dropped; retrying automatically.',
    incompatible: 'The external program answered, but its version or manifest does not fit this Hestia.',
  };
  void hasError;
  return en(lang) ? e[s] : pt[s];
}
