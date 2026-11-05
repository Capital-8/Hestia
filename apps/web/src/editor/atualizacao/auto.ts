import type { Lang } from '../i18n/tipos.ts';
import { adiadoNaSessao, carregarPreferencias } from './preferencias.ts';
import { deveAvisarAutomatico } from './logica.ts';
import { emTauri, verificarAtualizacao, type AtualizacaoDisponivel } from './ponte.ts';

let verificacaoIniciada = false;

/** Uma tentativa por sessão de app; falhas de rede/updater não mostram nada. */
export async function verificarAvisoAoAbrir(): Promise<AtualizacaoDisponivel | null> {
  if (verificacaoIniciada) return null;
  verificacaoIniciada = true;
  if (!emTauri()) return null;
  const info = await verificarAtualizacao();
  if (!info) return null;
  return deveAvisarAutomatico(info.versao, carregarPreferencias(), adiadoNaSessao()) ? info : null;
}

/** Notas da versão em execução. O updater só entrega notas da versão nova. */
const NOTAS_DA_VERSAO: Record<string, Partial<Record<Lang, string>>> = {
  '0.1.0': {
    pt: 'Tradução PT/EN, importação IFC rápida, cotas no padrão CAD, seleção no 3D e casca desktop Tauri com atualização pelo GitHub Releases.',
    en: 'PT/EN translation, fast IFC import, CAD-style dimensions, 3D selection and the Tauri desktop shell with updates from GitHub Releases.',
  },
  '0.2.0': {
    pt: 'Marca de corte com bolha, bandeira tangente e número da prancha; novo ícone da ferramenta.',
    en: 'Section mark with bubble, tangent flag and sheet number; new tool icon.',
  },
};

export function notasDaVersao(versao: string, lang: Lang): string {
  return NOTAS_DA_VERSAO[versao]?.[lang] ?? NOTAS_DA_VERSAO[versao]?.pt ?? '';
}
