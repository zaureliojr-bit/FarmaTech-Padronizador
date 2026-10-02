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

Roda num ritmo razoável de propósito (pausa entre páginas) pra não
sobrecarregar o site deles. Não aumenta a frequência nem roda em
paralelo múltiplas vezes.

## Uso

```
npm install
npm run extrair
```

Gera `distribuidora_dpcnet.xlsx` (ou o nome em `SAIDA_ARQUIVO`, se
definir essa variável de ambiente) com as colunas `Código`, `EAN`,
`Descrição` - reconhecidas automaticamente pelo padronizador.

## O que traz (e o que não traz)

Só **EAN e descrição** - é o suficiente pro padronizador usar como
fonte extra de descrição na busca automática. Não traz preço,
laboratório nem categoria: o catálogo público não mostra preço sem
login ("Ver Preço"), e o formato de marca/categoria não veio junto na
resposta testada.

## Se parar de funcionar

1. Abre `https://dpcnet.com.br/catalogo` no navegador, F12 → aba
   Network → filtro Fetch/XHR → recarrega a página.
2. Procura a chamada `showall` (ou parecida) → aba Headers → confere
   se a URL (`Request URL`) ainda é
   `https://apiecommerce.dpcnet.com.br/api/ec/produto/showall`.
3. Aba Payload → confere se os campos `limit`/`offset` ainda existem
   com esse nome.
4. Aba Response → confere se os produtos ainda têm `ean`/`descricao`/`id`.

Qualquer coisa diferente disso, ajusta `extrair.js` de acordo (ou pede
ajuda de novo com os prints atualizados).
