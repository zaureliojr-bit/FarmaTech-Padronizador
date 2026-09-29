# Extrator Firebird → FarmaTech Padronizador

Script que conecta direto no banco Firebird do Farmax, roda a consulta
já validada (`PRODUTOS` cruzada com `LABORATORIOS`/`GRUPOS`/`CLASSES`)
e gera uma planilha `.xlsx` pronta pra subir no padronizador — sem
precisar abrir o Farmax e exportar o relatório manualmente.

Roda **local, no seu PC** (o mesmo onde o DBeaver conectou) - o
Firebird não é acessível pela internet, então isso nunca vira um
Worker do Cloudflare, é só um script que você roda quando quiser
atualizar a planilha.

## 1. Instalar o Node.js

Se ainda não tiver: baixa em [nodejs.org](https://nodejs.org) (versão
LTS) e instala normal.

## 2. Instalar as dependências

Num terminal, dentro desta pasta (`firebird-extrator/`):

```
npm install
```

## 3. Configurar a conexão

Copia `.env.example` pra um arquivo novo chamado `.env` (mesma pasta) e
preenche:

- `FB_DATABASE` - caminho completo do arquivo `.FDB` no seu PC (o
  mesmo que você usou no DBeaver).
- `FB_HOST` / `FB_PORT` - `localhost` / `3050`, a não ser que tenha
  mudado algo na instalação do Firebird.
- `FB_USER` / `FB_PASSWORD` - as mesmas credenciais que usou no
  DBeaver pra conectar.
- `FB_FILIAL` - número da sua filial na tabela `FILIAIS` (pra Drogaria
  Rápida de Oliveira é `3`).
- `SAIDA_ARQUIVO` - nome do arquivo que vai ser gerado (padrão:
  `produtos_extraidos.xlsx`).

O `.env` nunca vai pro Git (já está no `.gitignore` desta pasta) -
fica só no seu PC.

## 4. Rodar

```
npm run extrair
```

Se der tudo certo, aparece quantos produtos foram exportados e o nome
do arquivo gerado. Esse arquivo já pode ser importado direto no
padronizador - ele reconhece as colunas sozinho (Código, EAN,
Descrição, Laboratório, Categoria, Classe, Preço Venda, Promoção,
Preço Custo, Estoque).

## O que a consulta traz

Só produtos com `STATUS = 'A'` (ativo) **e com estoque acima de zero**
na sua filial - se isso não for o filtro certo no seu Farmax, ajusta a
cláusula `WHERE` em `extrair.js`.

Estoque e preço vêm das colunas por filial (`ESTOQUE_<n>`,
`PRECO_VENDA_<n>`, `CUSTO_UNITARIO_<n>`) - `FB_FILIAL` no `.env`
decide qual número usar.

## Próximos passos possíveis

- Adicionar mais campos (substância, registro ANVISA, NCM, flag de
  controlado - a tabela `PRODUTOS` já tem tudo isso, só falta decidir
  se/como o padronizador vai usar).
- Automatizar pra rodar sozinho (agendador de tarefas do Windows) e já
  subir o arquivo no padronizador sem toque manual - isso é o próximo
  passo grande, ainda não construído.
