# Cosmos Proxy

Worker do Cloudflare que resolve o bloqueio de CORS da Cosmos API
(a Cosmos não libera chamadas diretas do navegador). Sem servidor pra
manter, roda no free tier do Cloudflare (sem cartão de crédito).

> **Endpoint correto:** `https://cosmos.bluesoft.com.br/api/gtins/{ean}.json`.
> O domínio antigo `api.cosmos.bluesoft.io`, usado em várias
> integrações de terceiros documentadas por aí, estava retornando
> conteúdo de spam/aposta (provavelmente expirado e comprado por
> golpistas) - confirme sempre a URL atual no painel de vocês em
> https://cosmos.bluesoft.com.br/ antes de confiar em exemplos externos.

## Deploy (painel do Cloudflare, sem linha de comando)

1. Acesse https://dash.cloudflare.com/ → **Workers e Pages** → **Criar**.
2. Escolha **Criar Worker**, dê um nome (ex: `farmatech-cosmos-proxy`) → **Implantar**.
3. Depois de criado, clique em **Editar código**.
4. Apague o conteúdo padrão e cole o conteúdo de `worker.js` deste diretório.
5. Clique em **Implantar**.
6. Vá em **Configurações** → **Variáveis e Secrets** → **Adicionar** →
   nome `COSMOS_TOKEN`, valor = o token da Cosmos, tipo **Secret**
   (criptografado) → **Implantar**.
7. Copie a URL do worker (algo como
   `https://farmatech-cosmos-proxy.<seu-usuario>.workers.dev`) e
   configure em `frontend/.env` como `VITE_COSMOS_PROXY_URL`.

## Teste manual

```
https://farmatech-cosmos-proxy.<seu-usuario>.workers.dev/?ean=7891234567895
```

Deve retornar o JSON da Cosmos (ou erro 404/403 da própria Cosmos se o
EAN não existir ou o token for inválido - mas sem erro de CORS).
