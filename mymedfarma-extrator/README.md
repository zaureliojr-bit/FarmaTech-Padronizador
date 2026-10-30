# Extrator MyMedFarma → Grupos Farmacológicos

Baixa a árvore de classificação farmacológica do MyMedFarma e monta
uma planilha **Substância → Grupo / Subgrupo / Classe** - referência
pra classificar medicamento por substância ativa (o padronizador já
extrai a substância de cada medicamento a partir da CMED).

## Diferente dos outros extratores deste repositório

Este não é um catálogo de produtos - não tem EAN, código de barras nem
preço. É uma árvore de classificação (parecida com a ATC
internacional), com ~4 níveis: Grupo (ex.: "Aparelho Cardiovascular")
→ Subgrupo (ex.: "Cardiotónicos") → Classe (ex.: "Digitálicos") →
Substância (ex.: "Digoxina"). Não serve pra subir na caixa "Lista da
distribuidora" do padronizador (que espera EAN) - é uma referência à
parte, pensada pra cruzar pela substância ativa.

## Importante: isso não é uma API oficial

Página pública do site, não documentada nem garantida - pode mudar de
formato a qualquer momento, sem aviso. Se parar de funcionar, não
assuma que quebrou algo do seu lado.

Uma página só, buscada uma vez por execução - a classificação
farmacológica não muda todo dia, não precisa rodar com frequência nem
agendar.

## Uso

```
npm install
npm run extrair
```

Gera `grupos_farmacologicos.xlsx` (ou o nome em `SAIDA_ARQUIVO`, se
definir essa variável de ambiente) com as colunas `Substância`,
`Grupo`, `Subgrupo`, `Classe`.

## Como funciona

A árvore inteira (todos os níveis, mesmo os que aparecem fechados na
tela) já vem pronta no HTML da página
`https://www.mymedfarma.com/pt/grupos-farmacologicos` - confirmado via
Ctrl+U no navegador. Cada nó carrega o caminho numérico completo no
próprio texto (ex.: `<p>3.1.1. Digitálicos</p>`, depois
`<a href="pt/principios-ativos/559-digoxina" title="DIGOXINA">
3.1.1.1. DIGOXINA</a>`), então o script:

1. Lê todos os cabeçalhos de grupo/subgrupo/classe (`<p>CAMINHO. Nome</p>`)
   e guarda `caminho -> nome` (ex.: `"3.1.1" -> "Digitálicos"`).
2. Lê todas as substâncias (links pra `principios-ativos/`), pegando o
   nome do atributo `title` (mais confiável que separar do texto do
   link) e o caminho numérico próprio.
3. Pra cada substância, sobe os 3 primeiros níveis do caminho
   (`3`, `3.1`, `3.1.1`) e busca o nome de cada um no mapa do passo 1 -
   isso dá Grupo/Subgrupo/Classe sem precisar entender a estrutura de
   `<ul>`/`<li>` aninhada da página.

## Se parar de funcionar

1. Abre `https://www.mymedfarma.com/pt/grupos-farmacologicos` no
   navegador, Ctrl+U (ver código-fonte), Ctrl+F por uma substância
   qualquer (ex.: "DIGOXINA").
2. Confere se ainda está num formato parecido com
   `<p>3.1.1. Digitálicos</p>` pros grupos, e
   `<a href="pt/principios-ativos/559-digoxina" title="DIGOXINA">3.1.1.1. DIGOXINA</a>`
   pras substâncias (repara no espaço antes do `>` de fechamento, que
   o regex já leva em conta).

Qualquer coisa diferente disso, ajusta `extrair.js` de acordo (ou pede
ajuda de novo com os prints atualizados).

## Ainda não ligado ao padronizador

Esta é só a parte de buscar o dado. Usar essa planilha pra
automaticamente ajudar a classificar os medicamentos no padronizador
(tipo a CMED/distribuidora já fazem) é um passo seguinte, ainda não
implementado.
