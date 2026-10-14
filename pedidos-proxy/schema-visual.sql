/* A cara de cada farmácia: logotipo e cor.

   POR QUE UMA TABELA SEPARADA, E NÃO COLUNAS EM `lojas`

   A tabela `lojas` já existe em produção. Acrescentar coluna nela exige
   ALTER TABLE, que não é idempotente no SQLite — rodar duas vezes dá
   "duplicate column name", e no console do D1 um erro no meio do arquivo
   pode abortar o resto. Tabela nova com IF NOT EXISTS pode ser colada de
   novo sem medo, que é a propriedade que mais importa num passo de
   instalação feito à mão.

   É também o mesmo padrão de `lojas_acesso`: `lojas` é o registro de
   quem existe; as laterais guardam como cada uma entra e como cada uma
   se apresenta.

   O QUE É IGUAL PARA TODAS, E POR QUÊ

   O LAYOUT. Ele é o produto: é o que está testado, é o que se mantém uma
   vez só e é o que faz a décima farmácia custar o mesmo que a segunda.
   Um sistema de templates por loja seria outro produto, com outro preço
   de manutenção.

   O que muda por farmácia é a marca — logotipo e cor —, que é o que o
   cliente dela reconhece na porta.

   UMA COR, E AS OUTRAS DERIVADAS

   Só a cor principal é cadastrada. As variações (escura para texto sobre
   claro, clara para fundo de realce) saem dela por color-mix no
   navegador, com proporção fixa.

   Deixar a loja escolher as quatro pareceria mais flexível e seria pior:
   é assim que se publica texto azul-escuro sobre fundo azul-escuro. Com
   a derivação, a clara é sempre quase branca e a escura é sempre mais
   escura que a principal — o contraste é garantido por construção, não
   por bom senso de quem preenche o formulário.

   COMO RODAR

   Cole o schema-visual-colar.sql no console do D1. */

CREATE TABLE IF NOT EXISTS lojas_visual (
    slug       TEXT PRIMARY KEY,
    logo       TEXT,
    cor        TEXT,
    trocado_em TEXT
);
