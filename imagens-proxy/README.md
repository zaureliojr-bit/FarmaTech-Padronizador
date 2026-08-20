# Imagens Proxy

Worker do Cloudflare que hospeda de verdade as imagens dos produtos -
diferente da Cosmos/Serper (que só *acham* uma imagem em outro site),
este worker baixa o arquivo uma vez e guarda no R2, indexado por EAN
no D1. A partir daí, tanto o padronizador quanto o site publicado
servem a imagem daqui, sem depender do site de origem continuar no ar.

## Deploy (painel do Cloudflare, sem linha de comando)

### 1. Criar o bucket R2

1. **Armazenamento e Bancos de Dados** → **R2** → **Criar bucket**.
2. Nome: `farmatech-imagens` (ou o que preferir, só anote pro passo 4).

### 2. Criar o banco D1

1. **Armazenamento e Bancos de Dados** → **D1 SQL Database** → **Criar**.
2. Nome: `farmatech-imagens-db`.
3. Depois de criado, abra o **Console** dele e cole o conteúdo de
   `schema.sql` deste diretório → **Executar**. Isso cria a tabela
   `imagens` (só precisa fazer uma vez).

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

## Por que ainda não migrei as imagens antigas

As imagens já escolhidas antes desta mudança ficam guardadas só no
navegador (IndexedDB) e continuam funcionando normalmente por lá até
serem reprocessadas. Não existe hoje um script de migração em lote das
imagens antigas pra cá - cada produto passa a usar o R2 automaticamente
na próxima vez que a imagem dele for buscada ou salva de novo. Se
quiser migrar tudo de uma vez em vez de esperar isso acontecer aos
poucos, me avise que eu preparo esse passo separado.
