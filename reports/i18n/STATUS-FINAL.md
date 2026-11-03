# Status final — i18n PT/EN

- Branch: `feat/i18n-completo`
- Worktree: `C:\Users\Dennylson\Desktop\programas\Hestia\wt\i18n-completo`
- Commit final: `fe6dd89f` — `feat(i18n): interface 100% bilingue PT/EN (4457 chaves, 0 strings PT hardcoded)`

## Resultado

| Métrica | Valor |
|---|---:|
| Ocorrências mapeadas (brutas) | 4.082 |
| Ocorrências únicas | 3.949 |
| Chaves no dicionário final | **4.457** (PT = EN) |
| Shards de dicionário | 39 |
| Placeholders divergentes | **0** |
| Chaves usadas e ausentes | **0** |
| Strings PT hardcoded (`check-i18n --strict`) | **0** em 429 arquivos |
| Arquivos alterados | ~520 |

## Verificação

| Item | Resultado |
|---|---|
| `npm run typecheck` | **0 erros** |
| `npx eslint apps packages` | **0 erros** (1 warning pré-existente em `OpeningFlipGrips`) |
| `npm run test:rapido` | **9.053 passando** / 1 falha por timeout (`openingCatalogo`, passa 12/12 isolado — flake de carga) |
| `node scripts/check-i18n.mjs --strict` | **exit 0**, 0 ocorrências |
| e2e EN (app buildado, DOM) | File menu, Níveis, Tabela de paredes, Visibility/Graphics, DXF, projeto novo — **0 PT** |
| Nomes padrão em projeto novo EN | `Untitled Project`, `Ground Floor`, `Level 2`, `Masonry 14 + Plaster` |
| Exportações EN | DXF `WALL_OUTLINE`/`ROOF_RIDGE`/`ROOMS`/`STAIR`/`RAMP`; CSV `Area`/`Total`; carimbo `Project:`/`Scale:`; modelo `Ground Floor`/`3D View` |
| `<html lang>` e `<title>` | sincronizados com o idioma (`html lang="en"` verificado) |

## O que mudou estruturalmente

1. Dicionário tipado por área: `const EN: Dict` → paridade vira erro de compilação.
2. `t(lang, key, args)` e `useT()` com fallback EN→PT e interpolação `{nome}`.
3. `status` e `undoLabel` guardam chave/Msg e traduzem no render (não congelam no idioma antigo).
4. `fmtNum`, `fmtDate`, `cmpTexto` centralizados; separador decimal e collation seguem o idioma.
5. `lang` propagado por `tools` (`env.lang`), `model`, `render`, `io` e `engine` (parâmetro opcional, default `pt`).
6. Nomes padrão de documento nascem no idioma ativo.
7. Guarda de regressão: `scripts/check-i18n.mjs` + allowlist.

## Limitações conhecidas (por design)

- **Dados do usuário não traduzem**: nomes de ambiente, tipo, material e vistas de documentos existentes permanecem como foram criados.
- Projetos antigos com níveis/tipos em PT continuam PT (correto); projetos novos em EN nascem EN.
- Tokens de nome de arquivo do DXF (`{projeto}`, `{tipo}`…) são sintaxe literal e foram mantidos.
- Comentários de código continuam em PT.
- `openingCatalogo.test.ts` tem timeout de 5 s e falha apenas sob carga paralela (pré-existente).

## Como usar

```powershell
cd C:\Users\Dennylson\Desktop\programas\Hestia\wt\i18n-completo
npm run dev
```

Trocar idioma: barra de título → menu Arquivo (H) → English / Português.

Para integrar na branch principal:

```powershell
cd C:\Users\Dennylson\Desktop\programas\Hestia\Hestia
git merge feat/i18n-completo
```
