# Extrator DCA Distribuidor → Lista da distribuidora

Varre o catálogo da DCA Distribuidor e gera uma planilha pronta pra
subir na caixa **"Lista da distribuidora"** do padronizador — sem
precisar copiar produto por produto.

## Importante: isso não é uma API oficial

É baseado na estrutura pública do site da DCA (sitemap.xml + o HTML
de cada página de produto, achados olhando o código-fonte no
navegador). Não é documentado nem garantido - a DCA pode mudar o
formato, exigir login, ou bloquear a qualquer momento, sem aviso. Se
parar de funcionar um dia, é isso que aconteceu - não precisa assumir
que quebrou algo do seu lado.

Roda num ritmo razoável de propósito (pausa entre pedidos) pra não
sobrecarregar o site deles. Não aumenta a frequência nem roda em
paralelo múltiplas vezes.

## Por que demora mais que o extrator da DPCNET

A DPCNET tinha uma chamada só que já trazia vários produtos de uma vez
(até 100 por pedido). A DCA não expõe isso: cada produto só mostra o
EAN na própria página dele, então o script primeiro lê os sitemaps
(`sitemap-produtos-N.xml`) pra montar a lista de páginas, e depois
visita **uma por uma** pra pegar EAN/descrição. Catálogo grande =
rodar demora bem mais (pode levar vários minutos) - é normal, deixa
rodando.

## Uso

```
npm install
npm run extrair
```

Gera `distribuidora_dca.xlsx` (ou o nome em `SAIDA_ARQUIVO`, se
definir essa variável de ambiente) com as colunas `Código`, `EAN`,
`Descrição`, `Imagem` - reconhecidas automaticamente pelo padronizador
(a coluna Imagem é usada como primeira fonte na busca de imagem em
lote, antes de gastar cota de Cosmos/Serper).

## O que traz (e o que não traz)

**Código, EAN, descrição e uma URL de imagem** - suficiente pro
padronizador usar como fonte extra de descrição e imagem na busca
automática. Não traz preço, laboratório nem categoria padronizada: o
catálogo público não mostra preço sem login, e os dados de
marca/departamento que aparecem na página não foram incluídos por não
baterem com as colunas que o padronizador já reconhece.

## Se parar de funcionar

1. Abre `https://www.dcadistribuidor.com.br/sitemap.xml` no navegador
   → confere se ainda lista arquivos `sitemap-produtos-N.xml`.
2. Abre um desses `sitemap-produtos-N.xml` → confere se cada `<url>`
   ainda tem um `<loc>` (página do produto) e um `<image:loc>`
   (imagem) dentro de `<image:image>`.
3. Abre uma página de produto (um dos links do passo 2), aperta
   Ctrl+U (ver código-fonte) → confere se ainda existe:
   - `<h1 class="product__name">...</h1>` (descrição)
   - `<li class="product__features--codigo">Código: ...</li>`
   - `<li class="product__features--ean">Código de Barras do Produto: ...</li>`

Qualquer coisa diferente disso, ajusta `extrair.js` de acordo (ou pede
ajuda de novo com os prints atualizados).
