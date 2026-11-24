import type { Familia } from '../tipos.ts';
import { corpoCaixa, familiaCaixa, ligacoesLaterais, paredeRetangular, parametroNumero, parametrosCaixa, simboloPlanta, TABELAS_CAIXA, tiposCaixa, verificacoesCaixa } from './caixasHidroApoio.ts';
import { derivado } from './novosApoio.ts';

/*
 * Caixas de gordura (ficha F3): simples (uma câmara), dupla (septo que divide as câmaras) e sifonada (lâmina de fecho hídrico
 * pendurada na tampa, perto da saída). Volume útil derivado em litros: câmara interna abaixo da tampa, menos o septo.
 * CONFERIR: volumes mínimos e alturas de lâmina; a passagem baixa do septo não é modelada nesta versão.
 */

/** Volume útil da câmara simples (litros): interior (L − 2e) × (P − 2e) × (A − ef − et), em milímetros cúbicos / 10^6. */
const VOLUME_SIMPLES = '(L - 2 * e) * (P - 2 * e) * (A - ef - et) / 1000000';
/** Volume útil da caixa dupla (litros): o mesmo interior, menos a espessura do septo `es` na largura. */
const VOLUME_DUPLA = '(L - 2 * e - es) * (P - 2 * e) * (A - ef - et) / 1000000';

export const FAMILIA_CAIXA_GORDURA_SIMPLES: Familia = familiaCaixa({
  id: 'fam_caixa_gordura_simples',
  nome: 'Caixa de gordura simples',
  descricao: 'Caixa de gordura de uma câmara: parede, fundo e tampa; entrada e saída laterais. Volume útil em litros (CONFERIR).',
  parametros: [...parametrosCaixa(), derivado('volumeUtil', 'Volume útil (litros)', VOLUME_SIMPLES)],
  tipos: tiposCaixa(),
  tipoPadrao: 'dn100',
  corpos: paredeRetangular(),
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('quadrado')],
  verificacoes: verificacoesCaixa([
    { id: 'volumeBaixo', severidade: 'aviso', condicao: 'volumeUtil < 120', mensagem: 'Volume útil de {volumeUtil} L abaixo de 120 L (CONFERIR)' },
    { id: 'saidaAcimaDaEntrada', severidade: 'aviso', condicao: 'cotaSaida > cotaEntrada', mensagem: 'Saída com cota de {cotaSaida} mm acima da entrada ({cotaEntrada} mm)' },
  ]),
  tabelas: TABELAS_CAIXA,
});

export const FAMILIA_CAIXA_GORDURA_DUPLA: Familia = familiaCaixa({
  id: 'fam_caixa_gordura_dupla',
  nome: 'Caixa de gordura dupla',
  descricao: 'Caixa de gordura de duas câmaras separadas por septo no meio da largura. Volume útil em litros (CONFERIR).',
  parametros: [...parametrosCaixa(), parametroNumero('es', 'Espessura do septo', 50, 20, 200, 'tipo'), derivado('volumeUtil', 'Volume útil (litros)', VOLUME_DUPLA)],
  tipos: tiposCaixa(),
  tipoPadrao: 'dn100',
  corpos: [
    ...paredeRetangular(),
    corpoCaixa('septo', 'Septo divisor', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'es', altura: 'P - 2 * e' }, comprimento: 'A - ef - et' }, { origem: ['0', '0', 'ef'] }),
  ],
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('quadrado')],
  verificacoes: verificacoesCaixa([{ id: 'volumeBaixo', severidade: 'aviso', condicao: 'volumeUtil < 200', mensagem: 'Volume útil de {volumeUtil} L abaixo de 200 L (CONFERIR)' }]),
  tabelas: TABELAS_CAIXA,
});

export const FAMILIA_CAIXA_SIFONADA: Familia = familiaCaixa({
  id: 'fam_caixa_sifonada',
  nome: 'Caixa sifonada',
  descricao: 'Caixa com lâmina de fecho hídrico pendurada na tampa, junto à saída. Entrada e saída laterais. CONFERIR dimensões.',
  parametros: [...parametrosCaixa(), parametroNumero('es', 'Espessura da lâmina', 50, 20, 200, 'tipo'), parametroNumero('hl', 'Altura da lâmina', 150, 50, 1000, 'tipo')],
  tipos: tiposCaixa(),
  tipoPadrao: 'dn100',
  corpos: [
    ...paredeRetangular(),
    corpoCaixa(
      'lamina',
      'Lâmina de fecho hídrico',
      'corpo',
      { tipo: 'extrusao', perfil: { tipo: 'retangulo', largura: 'es', altura: 'P - 2 * e' }, comprimento: 'hl' },
      { origem: ['faceEntrada == "direita" ? 0 - L / 2 + e + es / 2 : L / 2 - e - es / 2', '0', 'A - et - hl'] },
    ),
  ],
  ligacoes: ligacoesLaterais(),
  simbolos: [simboloPlanta('quadrado')],
  verificacoes: verificacoesCaixa([
    { id: 'laminaAlta', severidade: 'erro', condicao: 'hl > A - ef - et', mensagem: 'Lâmina de {hl} mm mais alta que a câmara' },
    { id: 'saidaAbaixoDaLamina', severidade: 'aviso', condicao: 'cotaSaida > A - et - hl', mensagem: 'Saída com cota de {cotaSaida} mm acima da base da lâmina: sem fecho hídrico' },
  ]),
  tabelas: TABELAS_CAIXA,
});
