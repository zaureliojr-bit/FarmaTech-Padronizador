# Serper Proxy

Worker do Cloudflare que consulta a [Serper](https://serper.dev) (API de
resultado de busca do Google, incluindo imagens) por texto, escondendo a
chave da API e liberando CORS pro navegador. Mesmo padrão do
`cosmos-proxy/` - roda no free tier do Cloudflare, sem cartão de crédito.

Diferença pra Cosmos: a Serper busca por **texto** (marca + descrição +
apresentação, já montados pelo padronizador), não por EAN - serve como
segunda tentativa quando o produto não está cadastrado na Cosmos ou a
cota diária dela já acabou.

## Deploy (painel do Cloudflare, sem linha de comando)

1. Acesse https://dash.cloudflare.com/ → **Workers e Pages** → **Criar**.
2. Escolha **Criar Worker**, dê um nome (ex: `farmatech-serper-proxy`) → **Implantar**.
3. Depois de criado, clique em **Editar código**.
4. Apague o conteúdo padrão e cole o conteúdo de `worker.js` deste diretório.
5. Clique em **Implantar**.
6. Vá em **Configurações** → **Variáveis e Secrets** → **Adicionar** →
   nome `SERPER_KEY`, valor = a chave copiada em serper.dev → **API keys**,
   tipo **Secret** (criptografado) → **Implantar**.
7. Copie a URL do worker (algo como
   `https://farmatech-serper-proxy.<seu-usuario>.workers.dev`) e
   configure em `frontend/.env` como `VITE_SERPER_PROXY_URL`.

## Teste manual

```
https://farmatech-serper-proxy.<seu-usuario>.workers.dev/?q=paracetamol+750mg+comprimidos
```

Deve retornar `{"imagens": ["https://...", ...]}` (ou erro 4xx/5xx da
própria Serper se a chave for inválida ou os créditos acabarem - mas
sem erro de CORS).

## Cota

O plano grátis da Serper dá créditos únicos ao cadastrar (não é por
dia, como a Cosmos) - confira o saldo em serper.dev → **Dashboard**.
Quando acabar, essa etapa passa a falhar em silêncio e o padronizador
cai pra busca manual, sem quebrar nada.
