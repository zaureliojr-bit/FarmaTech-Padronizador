# Estoque e giro — ruptura e encalhe

A aba **Estoque** do painel responde três perguntas que valem dinheiro:

| Pergunta | O que a tela mostra |
|---|---|
| O que rompeu | zerado **em produto que vinha vendendo** |
| O que vai romper | acaba em menos de 7 dias no ritmo atual |
| O que está parado | tem estoque e não sai há 60 dias, **em reais** |

As três saem da mesma conta — *dias de cobertura* = estoque ÷ saída média
por dia — e são ordenadas por dinheiro, nunca por quantidade: 200
unidades de algo de R$ 2 importa menos que 8 de algo de R$ 190.

## De onde vem o dado

Do mesmo programa que já extrai o catálogo no PC da farmácia. Uma vez
por dia ele manda **quanto tem de cada produto**, e o worker compara com
a fotografia do dia anterior.

A diferença para a extração do catálogo é uma linha de SQL, e é a linha
inteira do problema: a consulta do catálogo termina com `ESTOQUE > 0`,
porque não se mostra no site o que não dá para vender. Só que **ruptura
é o produto com estoque zero** — a consulta que alimenta o site
descarta, por definição, tudo que esta tela precisa ver. Por isso são
duas consultas.

## O que esta conta NÃO sabe

A saída é **estimada** pela diferença entre duas fotografias. Estoque
que caiu é consumo, estoque que subiu é reposição — mas compra, perda e
devolução entram na mesma conta, e um recebimento no mesmo dia mascara a
venda daquele dia.

Sobre 30 dias a média é boa o bastante para decidir compra. Não é boa
para fechar inventário, e a tela diz isso para quem está lendo.

Vira exata quando o Farmax abrir a tabela de vendas — e aí só muda a
origem do número: `saida` passa a receber a venda real, e tudo que está
construído em cima continua valendo.

## Instalar numa farmácia

No `.env` do extrator, três linhas:

```
ESTOQUE_URL=https://farmatech-pedidos-proxy.zaureliojr.workers.dev
ESTOQUE_KEY=<a senha do painel DESTA farmácia>
ESTOQUE_LOJA=<o apelido dela; vazio para a farmácia original>
```

E, no banco de operação dela, o `pedidos-proxy/schema-estoque-colar.sql`.

Deixar as três em branco desliga o envio — o catálogo não depende disso.

### As duas colunas opcionais

```
FB_COLUNA_MINIMO=
FB_COLUNA_VALIDADE=
```

Nem toda instalação do Farmax tem essas colunas, e **pedir uma coluna
que não existe derruba a consulta de estoque inteira**, levando junto o
que importa. Por isso o padrão é vazio.

Confira os nomes no DBeaver (tabela `PRODUTOS`) antes de preencher. Com
elas, vêm de brinde o ponto de reposição que a própria farmácia
cadastrou e o encalhe perto do vencimento, que é o caro.

## O primeiro dia é vazio, e está certo

A primeira fotografia não gera movimento: não existe "ontem" para
comparar. Tratá-la como entrada inventaria uma compra de 6.800 itens no
dia da instalação e estragaria a média do primeiro mês inteiro.

O giro começa a aparecer na segunda extração. Até lá o painel diz isso,
em vez de mostrar três tabelas zeradas — "0 rompidos" se lê como "está
tudo bem".
