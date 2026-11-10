/**
 * Regera os JSON de `tests/vistas-ouro/projetos/` a partir dos construtores (comandos e fábricas do modelo).
 *
 *   npx vite-node scripts/vistas-ouro-projetos.mts
 *
 * Só se roda de propósito: os JSON são a fonte do ouro e ficam versionados. Regerar os projetos muda as entradas do ouro.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { anotacoes, areaComAnotacoesProprias, areaQueHerda, casaDeVariosNiveis, comPranchas, faixaEGraficos, legadoV6, ocultos } from '../tests/vistas-ouro/construtores/casos.ts';

const destino = fileURLToPath(new URL('../tests/vistas-ouro/projetos/', import.meta.url));
mkdirSync(destino, { recursive: true });

const gravar = (nome: string, projeto: unknown): void => {
  writeFileSync(`${destino}${nome}.json`, `${JSON.stringify(projeto, null, 1)}\n`);
  console.log('gravado', nome);
};

gravar('01-casa-varios-niveis', casaDeVariosNiveis().project);
gravar('02-anotacoes-em-niveis', anotacoes().project);
gravar('03-area-herda-anotacoes', areaQueHerda().project);
gravar('04-area-anotacoes-proprias', areaComAnotacoesProprias().project);
gravar('05-ocultos', ocultos().project);
gravar('06-faixa-e-graficos', faixaEGraficos().project);
gravar('07-pranchas', comPranchas().project);
gravar('08-legado-v6', legadoV6());
