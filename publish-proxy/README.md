# Publish Proxy

Worker do Cloudflare que recebe o catálogo já padronizado pelo
FarmaTech Padronizador e publica direto no repositório GitHub
`zaureliojr-bit/Produtos`, sobrescrevendo `produtos.json` (o arquivo
que o site "Drogaria Mais Barato" lê via `raw.githubusercontent.com`).

O token do GitHub (PAT) e a chave de publicação ficam guardados como
secrets no worker - nunca aparecem no navegador.

## 1. Criar o token do GitHub (PAT)

1. Acesse https://github.com/settings/tokens?type=beta (Fine-grained
   tokens) → **Generate new token**.
2. Nome: algo como `farmatech-publish-proxy`.
3. **Repository access** → **Only select repositories** → escolha
   `zaureliojr-bit/Produtos`.
4. Em **Permissions** → **Repository permissions** → **Contents** →
   **Read and write**.
5. Gere o token e copie o valor (só aparece uma vez).

## 2. Deploy do worker (painel do Cloudflare, sem linha de comando)

1. Acesse https://dash.cloudflare.com/ → **Workers e Pages** → **Criar**.
2. Escolha **Criar Worker**, dê um nome (ex: `farmatech-publish-proxy`)
   → **Implantar**.
3. Depois de criado, clique em **Editar código**.
4. Apague o conteúdo padrão e cole o conteúdo de `worker.js` deste
   diretório.
5. Clique em **Implantar**.
6. Vá em **Configurações** → **Variáveis e Secrets** → **Adicionar**,
   duas vezes:
   - nome `GITHUB_TOKEN`, valor = o token gerado no passo 1, tipo
     **Secret**.
   - nome `PUBLISH_KEY`, valor = uma senha qualquer inventada por você
     (ex: gere uma string aleatória), tipo **Secret**. É essa chave
     que autoriza o app a publicar - sem ela, qualquer pessoa que
     descobrisse a URL do worker poderia sobrescrever o catálogo do
     site.
   - **Implantar** depois de adicionar as duas.
7. Copie a URL do worker (algo como
   `https://farmatech-publish-proxy.<seu-usuario>.workers.dev`) e
   configure em `frontend/.env`:
   ```
   VITE_PUBLISH_WORKER_URL=https://farmatech-publish-proxy.<seu-usuario>.workers.dev
   VITE_PUBLISH_KEY=<a mesma senha do passo 6>
   ```
8. Rebuilde/reimplante o frontend (Cloudflare Workers Builds já faz
   isso sozinho a cada push em `main`, desde que as variáveis também
   estejam configuradas nas **Variáveis de ambiente de build** do
   projeto do frontend no painel).

## Teste manual

```
curl -X POST https://farmatech-publish-proxy.<seu-usuario>.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "X-Publish-Key: <sua chave>" \
  -d '{"produtos":[{"codigo":1,"ean":"7891234567895","descricao":"Teste","precoVenda":10}]}'
```

Deve retornar `{"ok":true,"total":1}` e o commit aparecer no histórico
do repositório `Produtos`.
