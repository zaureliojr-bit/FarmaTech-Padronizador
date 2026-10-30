# Extrator DPCNET → Lista da distribuidora

Varre o catálogo da DPCNET e gera uma planilha pronta pra subir na
caixa **"Lista da distribuidora"** do padronizador — sem precisar
copiar produto por produto.

## Importante: isso não é uma API oficial

É uma chamada interna que o próprio site da DPCNET usa pra carregar o
catálogo na tela (achada pelo DevTools do navegador, aba Network). Não
é documentada nem garantida - a DPCNET pode mudar o formato, exigir
login, ou bloquear a qualquer momento, sem aviso. Se parar de
funcionar um dia, é isso que aconteceu - não precisa assumir que
quebrou algo do seu lado.

Roda num ritmo razoável de propósito (pausa entre páginas e entre
categorias) pra não sobrecarregar o site deles. Não aumenta a
frequência nem roda em paralelo múltiplas vezes.

## Uso

```
npm install
npm run extrair
```

Pra testar rápido antes de rodar a extração inteira (demora bem mais
agora - um pedido por categoria, não só por página), limita quantas
categorias processa:

```
set LIMITE_CATEGORIAS=5
npm run extrair
```

(No PowerShell: `$env:LIMITE_CATEGORIAS=5`.) Em modo teste ele pula a
passada final sem filtro (que sozinha já baixa o catálogo inteiro).

Gera `distribuidora_dpcnet.xlsx` (ou o nome em `SAIDA_ARQUIVO`, se
definir essa variável de ambiente) com as colunas `Código`, `EAN`,
`Descrição`, `Imagem`, `Categoria`, `Subcategoria` - reconhecidas
automaticamente pelo padronizador (a coluna Imagem é usada como
primeira fonte na busca de imagem em lote, antes de gastar cota de
Cosmos/Serper).

## Como a categoria é descoberta

A API de produto (`produto/showall`) não diz a categoria de cada item
- só deixa **filtrar** por ela (`categoria_integracao_id`). Por isso
o script primeiro busca a árvore inteira de categorias
(`categoria/showall`), acha as **folhas** (categorias que não têm
subcategoria - é nelas que os produtos de verdade estão pendurados,
filtrar por uma categoria-mãe traz os filhos juntos e duplicaria
produto entre consultas) e faz uma busca de produtos por folha.

- `Categoria` = a categoria do topo da árvore (ex.: "Fralda",
  "Capilar") - bate com o nível de categoria largo que o site já usa.
- `Subcategoria` = a folha em si (ex.: "Fita", "Geriátrica") - mais
  específica, pensada pra filtro dentro de uma categoria no site.

No final roda mais uma busca sem filtro nenhum, só pra pegar algum
produto que não esteja em nenhuma folha (categoria desativada, erro de
cadastro etc.) - esses saem sem `Categoria`/`Subcategoria` preenchida,
mas não ficam de fora da planilha.

Mais pedidos que a versão anterior (um por folha de categoria, em vez
de só paginar o catálogo inteiro) - roda mais devagar, é esperado.

## O que traz (e o que não traz)

**EAN, descrição, uma URL de imagem e a categoria/subcategoria** -
suficiente pro padronizador usar como fonte extra de descrição,
imagem e categoria na busca automática. Não traz preço nem
laboratório: o catálogo público não mostra preço sem login ("Ver
Preço"), e marca não veio na resposta testada.

## Se parar de funcionar

1. Abre `https://dpcnet.com.br/catalogo` no navegador, F12 → aba
   Network → filtro Fetch/XHR → recarrega a página.
2. Procura a chamada `showall` de produto → aba Headers → confere se
   a URL ainda é `https://apiecommerce.dpcnet.com.br/api/ec/produto/showall`.
3. Aba Payload → confere se os campos `limit`/`offset`/
   `categoria_integracao_id` ainda existem com esse nome.
4. Aba Response → confere se os produtos ainda têm `ean`/`descricao`/`id`.
5. Clica numa categoria no menu (ex.: "Fralda") → procura a chamada
   `showall` de categoria → confere se a URL ainda é
   `https://apiecommerce.dpcnet.com.br/api/ec/categoria/showall` e se
   cada categoria na Response ainda tem `id`/`categoriapai_id`/
   `descricao`/`nivel`/`status`/`integracao_id`.

Qualquer coisa diferente disso, ajusta `extrair.js` de acordo (ou pede
ajuda de novo com os prints atualizados).
