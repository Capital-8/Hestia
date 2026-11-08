# Proposta: pareamento por token (protocolo 1.1)

**Estado:** PROPOSTA. Nada disto está implementado e o contrato 1.0 não mudou. **Antes de qualquer uso real do
renderizador, o pareamento por token deve estar implementado e exigido.**

## Por que o `Origin` não basta
O renderizador valida `Host` e `Origin` (06). Isso barra páginas web arbitrárias e DNS rebinding, mas **não** barra:
- outro programa no mesmo computador (não envia `Origin`, ou envia um forjado);
- o modo `--allow-no-origin`, hoje necessário para clientes que não são navegador.
Qualquer processo local poderia ler a cena do projeto e gravar substituições. Só um segredo compartilhado resolve.

## Proposta
- **Token:** 128 bits ou mais, aleatório, gerado pelo renderizador na primeira execução, guardado em arquivo legível só
  pelo usuário e mostrado uma vez. O usuário o cola em *Ferramentas externas*; o Hestia o guarda por plugin (no Tauri, no
  cofre do sistema; no navegador, aviso explícito de que `localStorage` é menos seguro).
- **Troca (desafio e resposta mútuos; o token nunca trafega):**
  1. `hello` ganha `auth: { nonce: <16 bytes b64> }` (nonce do plugin).
  2. O host responde a mensagem nova `auth { proof: HMAC-SHA256(token, "hestia-host" | nonceP), nonce: <nonce do host> }`.
  3. O plugin confere a prova e responde `auth.ok { proof: HMAC-SHA256(token, "hestia-plugin" | nonceH) }`.
  4. O host confere. Só então `welcome`. Falha ⇒ `error auth_failed` fatal e estado "incompatível" com a causa.
  Antes da autenticação, nenhuma mensagem de cena, câmera ou substituição é processada.
- Comparação em tempo constante; três falhas seguidas bloqueiam novas tentativas por alguns segundos.

## Compatibilidade
- É **acréscimo**: protocolo `1.1` (mudança de `minor`), dois tipos novos (`auth`, `auth.ok`) e um código de erro novo.
- `negotiateProtocol` já escolhe a maior versão comum: host 1.1 com plugin 1.0 negocia 1.0.
- Política do host: **token obrigatório** (padrão para uso real) recusa plugin 1.0 como incompatível; **opcional** só em
  desenvolvimento, com aviso na tela.
- Host 1.0 (o atual) com plugin 1.1: negocia 1.0, e o plugin 1.1 em modo "exigir token" fecha a conexão.
- Os campos do manifesto e da cena não mudam. `docs/plugins/02-protocolo.md` só é alterado quando a 1.1 for implementada.

## Tarefas (em PR separado)
1. `plugin-api`: `auth`/`auth.ok`, política de token, erro `auth_failed`, testes de mensagens malformadas.
2. Tela: campo de token, estado e mensagem de falha.
3. Renderizador: geração e armazenamento do token, verificação, `--require-token` como padrão.
4. Teste de integração entre processos: token certo, errado, ausente, plugin 1.0.
5. Retirar `--allow-no-origin` do caminho de uso real.
