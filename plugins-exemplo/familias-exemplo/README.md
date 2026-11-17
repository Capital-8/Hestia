# Biblioteca de portas e paredes (exemplo declarativo)

Só JSON, sem código. Contribui dois materiais (`madeira-freijo`, `pintura-grafite`), três portas e duas paredes.

- Nada entra no projeto ao instalar ou ativar. Em **Suplementos > Gerenciar suplementos > Carregar conteúdo** você vê a prévia e decide.
- Tudo entra com o prefixo do suplemento (`dev.hestia.familias-exemplo:...`); os tipos do projeto nunca são substituídos.
- Cada carga é um único passo de Desfazer. Remover o conteúdo mantém o que estiver em uso.
- Dentro do suplemento, `materialId` aceita o id curto de um material do próprio suplemento (`madeira-freijo`) ou o id de um material do projeto (`mat_reboco`).
- Tipos de uma família com mais de um tipo ganham o sufixo `key` (ou a posição) no id.
