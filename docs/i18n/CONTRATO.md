# Contrato i18n — execução paralela

Vale para todos os subagentes da branch `feat/i18n-completo`.
Leia também `reports/i18n/PLANO-CORRECAO.md` e o relatório da sua área.

## 1. API

Importe **sempre** de `apps/web/src/editor/i18n.ts` (barrel estável):

```ts
import { useI18n, t, useT, toolLabel, fmtNum, fmtDate, cmpTexto } from '../editor/i18n.ts';

// React: assina o idioma e re-renderiza na troca
const { t, lang } = useT();
<span>{t('pr_wall_height')}</span>
<span>{t('pr_wall_count', { n: 3 })}</span>

// Fora do React (ações, helpers, pacotes)
const lang = useI18n.getState().lang;
useUi.setState({ status: { key: 'ed_walls_created', args: { n: 3 } } });
```

- `t` recebe chave tipada (`keyof Dict`). Chave inexistente = erro de TypeScript.
- Interpolação: `{nome}` no texto + `args`.
- Fallback: EN ausente → PT; nunca `undefined` nem id cru.
- `Msg = { key, args? }`; `TextLike = string | Msg`. `status` e `undoLabel` aceitam os dois.
- Em componentes que já têm `I18N[lang]`, pode continuar usando; o novo padrão é `useT()`.

## 2. Prefixos por arquivo de dicionário (obrigatório)

Cada área tem **um arquivo próprio**. Nunca edite o arquivo de outra área nem o `i18n.ts` central.

| Arquivo | Prefixo | Dono |
|---|---|---|
| `areas/common.ts` | `cm_` | fundação |
| `areas/shell.ts` | `sh_` | ribbon, titlebar, statusbar, menus |
| `areas/props.ts` | `pr_` | propriedades, campos, enums |
| `areas/dialogs.ts` | `dl_` | diálogos gerais e de tipo |
| `areas/stair.ts` | `st_` | escada/rampa (novas; `stt_*`/`ramp_*` existentes ficam) |
| `areas/schedules.ts` | `sc_` | tabelas/colunas (novas; `sched_*`/`col_*` ficam) |
| `areas/canvas.ts` | `cv_` | canvas, cotas, pranchas, navegador |
| `areas/exports.ts` | `ex_` | DXF/IFC/PDF/CSV/carimbo |
| `areas/tools.ts` | `tl_` | `packages/tools` |
| `areas/model.ts` | `md_` | `packages/model` |
| `areas/render.ts` | `rn_` | `packages/render` |
| `areas/io.ts` | `io_` | `packages/io` |
| `areas/engine.ts` | `eg_` | `packages/engine` |
| `areas/geom.ts` | `gm_` | `packages/geom` |

Regras:
1. **Reutilize** chave existente do `I18N` quando o texto for idêntico (ex.: `btn_close`, `tool_wall`, `col_name`, `grp_build`).
2. Chave nova **sempre** com o prefixo da sua área. Colisão entre áreas é proibida.
3. Nome descritivo: `pr_wall_base_offset`, `dl_dxf_title`, `cv_viewcube_top`. Não use número nem abreviação obscura.
4. PT e EN no mesmo arquivo, com paridade garantida por tipo:
```ts
export const PT_PROPS = {
  pr_wall_height: 'Altura',
} as const;
export const EN_PROPS: Record<keyof typeof PT_PROPS, string> = {
  pr_wall_height: 'Height',
};
```
5. Placeholders iguais nos dois idiomas: `{n}`, `{name}`.
6. Plural: crie `_one`/`_many` quando necessário (padrão já usado em `stt_sub_*`).

## 3. Conteúdo EN

- Use o termo do **Revit em inglês** quando existir (o produto segue a UI do Revit).
- Fora do Revit: inglês técnico de arquitetura/BIM (Wall, Slab, Roof, Stair, Ramp, Dimension, Sheet, View, Level).
- `packages/io`: nomes de camada DXF em MAIÚSCULAS (`WALL_OUTLINE`, `ROOF_RIDGE`), nomes IFC em Title Case.
- Mantenha siglas (IFC, DXF, PDF, NBR, IBC, GPU, CPU, WebGL).

## 4. O que NÃO traduzir

- Nomes de dados já existentes no documento (ambiente, tipo, material criados pelo usuário).
- Nomes padrão **na criação**: use `lang` (ver §5) para nascer no idioma ativo.
- Comentários de código (podem ficar em PT).
- Strings internas de protocolo, tokens IFC, extensões de arquivo.
- Textos de teste/fixtures (mas ajuste asserções que quebram).

## 5. Parâmetros de idioma em código fora do React

- `packages/tools`: use `env.lang?.() ?? 'pt'` (contrato já existe em `types.ts:102`).
- `packages/model`: adicione `lang: Lang = 'pt'` **no fim** dos parâmetros de funções que criam nomes padrão ou mensagens. Nunca quebre chamadas existentes.
- `packages/render`: propague `lang` a partir da entrada (`renderPlan`, `renderSheet`, carimbo). Sem estado global.
- `packages/io` / `engine`: `lang` nas opções de export/import e nas funções de CSV; default `'pt'`.

## 6. Formatação

- Números de UI: `fmtNum(v, dec, lang)`.
- Datas: `fmtDate(lang, date?)`.
- Ordenação: `cmpTexto(a, b, lang)`.
- Não use `.toFixed().replace('.', ',')` nem `toLocaleDateString('pt-BR')` em código novo.

## 7. Regras de trabalho

- **Ownership rígido**: só edite os arquivos listados na sua tarefa + seu arquivo de dicionário.
- Não edite `package.json`, `tsconfig`, `eslint`, `vitest` nem rode `npm install`.
- Não reformate arquivos inteiros; mudanças mínimas e focadas.
- Rode `npm run typecheck` ao final. Se falhar por causa de outro agente, registre e siga.
- Rode os testes do seu escopo (`npx vitest run <arquivos>`).
- Ao converter um texto que é comparado por prefixo (`status.startsWith('…')`), troque a comparação por código/chave **antes** de traduzir.
- Deixe `I18N.pt`/`EN` com paridade; se adicionar chave em um, adicione no outro.
