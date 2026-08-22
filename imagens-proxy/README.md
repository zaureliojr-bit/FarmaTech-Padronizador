# Imagens Proxy

Worker do Cloudflare que hospeda de verdade as imagens dos produtos -
diferente da Cosmos/Serper (que só *acham* uma imagem em outro site),
este worker baixa o arquivo uma vez e guarda no R2, indexado por EAN
no D1. A partir daí, tanto o padronizador quanto o site publicado
servem a imagem daqui, sem depender do site de origem continuar no ar.

Também guarda **correções** - descrição/classe/categoria ajustadas à
mão na tabela do padronizador, por EAN, sem nada específico de loja.
Preço, estoque e código do PDV nunca entram aqui - são dados que têm
que ficar por loja. A ideia é: se um dia existir mais de uma loja
usando o padronizador, correção feita numa já nasce pronta pras outras
herdarem ao importar (mesma lógica da imagem).

## Deploy (painel do Cloudflare, sem linha de comando)

### 1. Criar o bucket R2

1. **Armazenamento e Bancos de Dados** → **R2** → **Criar bucket**.
2. Nome: `farmatech-imagens` (ou o que preferir, só anote pro passo 4).

### 2. Criar o banco D1

1. **Armazenamento e Bancos de Dados** → **D1 SQL Database** → **Criar**.
2. Nome: `farmatech-imagens-db`.
3. Depois de criado, abra o **Console** dele e cole o conteúdo de
   `schema.sql` deste diretório → **Executar**. Isso cria as tabelas
   `imagens` e `correcoes` (só precisa fazer uma vez).

> **Já tem o banco criado de antes (só com a tabela `imagens`)?** Não
> precisa recriar nada - abra o Console dele e rode só a parte nova:
> ```sql
> CREATE TABLE IF NOT EXISTS correcoes (
>     ean TEXT PRIMARY KEY,
>     descricao_manual TEXT,
>     classe TEXT,
>     categoria TEXT,
>     atualizado_em INTEGER NOT NULL
> );
> ```

### 3. Criar o worker

1. **Workers e Páginas** → **Criar** → **Criar Worker**, nome
   `farmatech-imagens-proxy` → **Implantar**.
2. **Editar código** → apaga o conteúdo padrão, cola o `worker.js`
   deste diretório → **Implantar**.

### 4. Ligar o worker ao R2 e ao D1

Na página do worker → **Configurações** → **Bindings** (Encadernações)
→ **Adicionar**:

- Tipo **R2 Bucket** → nome da variável `IMAGENS_BUCKET` → bucket
  `farmatech-imagens` (o do passo 1).
- Tipo **D1 Database** → nome da variável `DB` → banco
  `farmatech-imagens-db` (o do passo 2).

### 5. Criar a senha de autorização

Ainda em Configurações → **Variáveis e Secrets** → **Adicionar** →
nome `IMAGENS_KEY`, valor = uma senha qualquer que você inventar, tipo
**Secret** → **Implantar**.

### 6. Configurar o frontend

Copie a URL do worker (algo como
`https://farmatech-imagens-proxy.<seu-usuario>.workers.dev`) e
configure em `frontend/.env`:

```
VITE_IMAGENS_PROXY_URL=https://farmatech-imagens-proxy.<seu-usuario>.workers.dev
VITE_IMAGENS_KEY=<a mesma senha do IMAGENS_KEY>
```

## Teste manual

Buscar uma imagem já salva (deve dar 404 antes de salvar a primeira vez):

```
https://farmatech-imagens-proxy.<seu-usuario>.workers.dev/7891234567895
```

## Migração das imagens antigas

Imagens escolhidas antes deste worker existir ficam só no `produtos.json`
já publicado (links externos, não hospedados aqui ainda). O botão
"Migrar imagens antigas" no padronizador lê esse catálogo publicado e
hospeda no R2 quem ainda não tiver sido migrado - ver
`frontend/src/services/migracaoImagensService.js`. Idempotente: rodar
de novo só processa quem faltar.
