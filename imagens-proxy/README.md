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

Guarda ainda a **extração do PDV**: a planilha que sai do Firebird do
balcão fica aqui até o painel buscá-la e padronizar. Uma pendente por
vez — ver "Extração do PDV", mais abaixo.

## ⚠️ A chave vai para o navegador, e isso é um problema

O passo 6 deste README manda pôr a chave em `VITE_IMAGENS_KEY`. No
Vite, **toda variável com prefixo `VITE_` é embutida no bundle em tempo
de build** — ela não fica no servidor, vai para dentro do JavaScript que
qualquer pessoa baixa. Hoje a chave do `imagens-proxy` está legível em
texto no `importador-automatico.js` servido publicamente.

Quem lê aquele arquivo pode, com a chave: trocar a imagem de qualquer
produto, trocar descrição e classe, enviar uma extração falsa e apagar a
que está pendente.

**Isto não se conserta aqui dentro.** Enquanto o navegador precisar da
chave para escrever, ela é pública — trocar a chave só a torna pública
de novo no build seguinte. O conserto é de desenho: a chave fica no
servidor, e o navegador fala com uma rota autenticada pelo login do
painel, que é como o `pedidos-proxy` já funciona. Até isso existir,
trate `IMAGENS_KEY` como senha conhecida, não como segredo.

O que **já** está protegido, independente disso: a planilha do PDV só
sai com a chave (ver abaixo), e ela é apagada assim que é importada.

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

## Extração do PDV

O catálogo nasce num Firebird dentro do computador do balcão. Alguém
exporta a planilha, ela sobe para cá, e o painel busca e padroniza.

| Rota | Chave? | O que faz |
|---|---|---|
| `GET /extracao` | não | diz se há pendente: `{pendente, nomeArquivo, tamanho, enviadoEm}` |
| `GET /extracao/arquivo` | **sim** | baixa a planilha |
| `POST /extracao` | **sim** | envia (corpo cru com `?nome=`, ou multipart no campo `arquivo`) |
| `POST /extracao/importado` | **sim** | o painel avisa que importou — **apaga o arquivo** |
| `DELETE /extracao` | **sim** | descarta uma extração errada sem importar |

Três decisões que valem explicação:

**Baixar pede chave.** A planilha traz a coluna `Preço Custo` de cada
produto. O `produtos.json` publicado remove esse campo de propósito,
porque margem não é dado de vitrine — servir a planilha crua sem chave
desfaz esse cuidado e entrega a margem da loja inteira a quem souber o
endereço. O status fica aberto porque só diz que existe algo novo.

**Importada apaga, não marca.** Uma planilha "já importada" parada no
balde seria a tabela de custo da loja esperando alguém achar a URL, sem
servir mais para nada.

**Uma pendente por vez.** Enviar de novo substitui. Com fila, o painel
teria de escolher qual importar — e importar a errada republica o
catálogo com preço velho.

> **Ao atualizar o worker:** a versão publicada hoje serve
> `GET /extracao/arquivo` **sem** chave, e o
> `importador-automatico.js` publicado faz o download sem mandar
> cabeçalho nenhum. Ao implantar esta versão, o download passa a exigir
> a chave e a importação automática para de funcionar até o bundle do
> padronizador ser republicado mandando `X-Imagens-Key`. Vale fechar o
> vazamento mesmo assim: até o bundle sair, a importação pode ser feita
> pelo padronizador à mão.

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
