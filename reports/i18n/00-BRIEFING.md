# Briefing — Mapeamento i18n do Hestia (PT-BR / EN)

## Objetivo
O programa tem um seletor de idioma (PT/EN), mas ao ativar EN parte da interface continua em PT-BR.
Precisamos de um **inventário completo e acionável** de tudo que não troca de idioma, para corrigir em paralelo depois.

**Esta fase é somente mapeamento. NÃO edite nenhum arquivo de código-fonte.**
Você só pode criar/alterar **o seu próprio relatório** em `reports/i18n/`.

## Raiz do projeto
`C:\Users\Dennylson\Desktop\programas\Hestia\Hestia`
(branch atual `perf/ifc-import-rapido-main`; existem 4 arquivos modificados não commitados — não toque neles)

Mecanismo atual de i18n:
- `apps/web/src/editor/i18n.ts` -> store zustand `useI18n` com `lang: 'pt' | 'en'`, dicionário `I18N.pt` / `I18N.en`, helpers `toolLabel`, `nomeComandoLang`, `fmtNum`.
- `apps/web/src/editor/i18nTabelas.ts` -> chaves `sched_*`, `col_*`, `roof_shape_*`.
- Persistência em `localStorage['hestia.lang']`.
- Muitos componentes **não** usam o dicionário: têm texto PT fixo, ternários `lang === 'pt' ? ... : ...`, ou usam rótulos PT de `packages/tools` (`TOOL_LABEL`) em vez de `toolLabel`.

## O que conta como falha de i18n
1. Texto PT fixo em JSX (nós de texto, `.tsx`).
2. Atributos PT fixos: `title`, `aria-label`, `aria-description`, `placeholder`, `alt`, `label`, `data-*` visível.
3. Mensagens geradas em código: `toast`, `status`, `mensagem`, `aviso`, `erro`, `window.alert/confirm`, `console` visível ao usuário (só se aparecer na UI).
4. Textos desenhados em canvas/SVG/PDF/DXF/IFC: rótulos de cota, nomes de ambiente, marca de corte, carimbo de prancha, títulos de vista, nomes de camada.
5. Nomes padrão criados no documento: "Nível 1", "Parede 1", "Porta 1", tipos, materiais, famílias, vistas, pranchas.
6. Formatação dependente de idioma: números, datas, unidades, separadores, `toLocaleString` sem `lang`, `Intl.*` com locale fixo.
7. Ternários PT/EN inline (`lang === 'pt'`, `pt ? ... : ...`) — funcionam, mas são dívida: listar para padronização.
8. **Texto EN fixo** que aparece mesmo em PT (ex.: "OK", "Cancel" escrito à mão) — listar também.
9. **Stale i18n (não atualiza ao trocar de idioma)**: `useMemo`/`useCallback`/`useEffect` que dependem de texto traduzido mas não têm `lang` nas dependências; constantes de módulo calculadas uma vez com o idioma; rótulos memorizados em store.
10. Chaves usadas que não existem em EN (fallback para PT / para a chave crua).
11. `document.documentElement.lang`, `<html lang>`, `<title>` da aba, manifest/PWA.

**Não contam**: comentários de código em PT, nomes de variáveis/funções em PT, strings de teste (`*.test.ts(x)`), fixtures, logs de dev, documentação `.md`.
Mas **anote** testes que fazem `expect(...).toBe('texto PT')` e vão quebrar quando o texto virar chave traduzida.

## Método (rápido e completo)
- Use `grep`/`Select-String` dirigido, não leia arquivo por arquivo inteiro.
- Regex útil para PT: `[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]` e palavras comuns: `Nível|Parede|Porta|Janela|Piso|Laje|Telhado|Escada|Rampa|Ambiente|Cota|Vista|Projeto|Salvar|Abrir|Fechar|Cancelar|Aplicar|Excluir|Adicionar|Editar|Selecione|Clique|Nenhum|Nenhuma|Todos|Todas|Padrão|Personalizado|Altura|Largura|Espessura|Comprimento|Área|Volume|Material|Família|Tipo|Nome|Deslocamento|Inclinação`.
- Confirme no código se o texto é realmente renderizado (não é comentário, não é teste, não é nome interno).
- Para cada ocorrência, registre `arquivo:linha` **relativo à raiz do projeto**.

## Severidade
- **P0**: fluxo principal visível no primeiro uso (ribbon, abas, propriedades, barra de status, menus, opções, canvas, diálogos principais, exportação principal).
- **P1**: diálogos secundários, tabelas, configurações, tooltips, mensagens de erro/validação, acessibilidade.
- **P2**: casos raros, textos internos, aria de detalhe, formatação de número/data, dívida de padronização.

## Formato de saída (obrigatório)
Crie **dois** arquivos com o seu prefixo (ex.: `03-dialogos-a`):

### `reports/i18n/<ID>.md`
```md
# <Área>
- Escopo: <globs/dirs>
- Arquivos analisados: N
- Ocorrências: N (P0: n, P1: n, P2: n)

## Resumo executivo
<5-10 linhas: o que está quebrado nesta área e a causa provável>

## Causas-raiz
<lista com evidência `arquivo:linha`>

## Inventário
| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/X.tsx:42 | `Parede` | JSX texto | P0 | `tool_wall` (já existe) | Wall | usa TOOL_LABEL em vez de toolLabel |

## Mistura PT/EN no mesmo arquivo
<lista curta>

## Riscos / testes que quebram
<lista com arquivo:linha>

## Já correto
<lista curta de arquivos 100% traduzidos>
```

### `reports/i18n/<ID>.csv`
Cabeçalho exato:
`arquivo,linha,texto,tipo,severidade,chave,en,nota`
- Campos com vírgula/aspas entre aspas duplas; aspas internas duplicadas (`""`).
- Uma linha por ocorrência do inventário.
- `arquivo` relativo à raiz, com `/`.
- `texto` = string literal atual, sem escapes desnecessários.

## Qualidade da chave/EN
- Reaproveite chaves existentes do `I18N` quando o texto for idêntico (ex.: `btn_close`, `tool_wall`, `col_name`). Se não existir, proponha uma chave no padrão já usado (`area_*`, `dlg_*`, `sched_*`, `col_*`) e diga onde declarar.
- EN deve ser o termo usado pelo Revit em inglês quando existir equivalente (o dicionário atual segue a UI do Revit).
- Se o texto é dado do usuário (nome de ambiente/tipo/material), marque `tipo=dado` e diga que **não traduz** — mas que o nome *padrão* gerado precisa ser localizado na criação.

## Regras finais
- Não invente ocorrências: toda linha do CSV precisa de `arquivo:linha` verificável.
- Prefira subestimar a severidade a inflar.
- Se terminar cedo, faça uma segunda passada nos arquivos com mais ocorrências para não deixar buracos.
- No final da resposta ao orquestrador, informe: caminho dos 2 arquivos, contagem e os 5 achados mais críticos em uma linha cada.
