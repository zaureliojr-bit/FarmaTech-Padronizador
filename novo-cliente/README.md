# Configurar um cliente novo

Script que troca a marca, endereço e URLs do `drogaria-site` (clone
pra um cliente novo) pelos dados reais dele, de uma vez só — sem
precisar caçar cada ocorrência de "Drogaria Mais Barato" e das URLs
antigas manualmente (hoje isso aparece em ~16 arquivos).

## Antes de rodar

1. Clona (ou copia) o repositório `drogaria-site` numa pasta nova,
   com o nome que preferir pro cliente.
2. Implanta os workers desse cliente no Cloudflare primeiro
   (`pedidos-proxy` e o padronizador, no mínimo) — o script só troca
   texto nos arquivos, não cria nada no Cloudflare.
3. Já tenha em mãos: nome da loja, CNPJ, endereço completo, cidade, a
   URL do worker de pedidos, a URL do padronizador desse cliente, e o
   dono/nome do repositório GitHub onde o catálogo (`produtos.json`)
   desse cliente vai ficar.

## Rodar

```
cd novo-cliente
node configurar-cliente.js
```

Responde as perguntas (sempre digitando no terminal — não dá pra
automatizar via arquivo/pipe, o `readline` do Node só funciona
pergunta por pergunta com alguém digitando de verdade).

## O que o script faz

- Troca, em todos os arquivos de `public/` do `drogaria-site`
  apontado: nome da loja, CNPJ, endereço, cidade, e as 3 URLs fixas
  (pedidos, catálogo no GitHub, padronizador).
- Gera uma cópia de `publish-proxy/worker.js` já com o repositório do
  catálogo certo, em `novo-cliente/saida/publish-proxy-<cliente>.worker.js`
  — não mexe no arquivo original (ele é compartilhado entre clientes).

## O que continua manual

- Trocar `logo.png` e os ícones (`icone-180.png`, `icone-192.png`,
  `icone-512.png`) — são imagens, o script não mexe nelas.
- Implantar os workers desse cliente no Cloudflare (cada um com seu
  próprio D1/R2) e colar o `publish-proxy` gerado.
- Implantar o padronizador (`frontend/`) com um `.env` apontando pros
  workers desse cliente.
- Criar o repositório GitHub do catálogo, se ainda não existir.
