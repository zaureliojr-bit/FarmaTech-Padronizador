/* =====================================================================
   Descobrir o que este Firebird tem — para rodar no IBExpert
   =====================================================================

   Cole uma consulta de cada vez no SQL Editor do IBExpert (Ctrl+F12) e
   rode com F9. Copie o resultado e mande.

   TODAS SÃO SOMENTE LEITURA. Nenhuma delas cria, altera ou apaga nada:
   leem o catálogo do próprio banco, que é onde o Firebird guarda a
   lista das tabelas e das colunas. Rodar isto no banco de produção, em
   horário de movimento, não atrapalha ninguém.

   Mande de volta só os NOMES que saírem. Não precisa — e é melhor não —
   mandar o conteúdo das tabelas: nome de cliente, CPF e venda são dados
   da farmácia, e para montar a consulta eu preciso só da estrutura.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. As tabelas que parecem ser de VENDA

   É a que interessa mais. Cada sistema batiza do seu jeito — VENDAS,
   MOVIMENTO, CUPOM, SAIDAS, PEDIDOS — então a busca é por pedaço de
   nome, e não por nome exato.
   --------------------------------------------------------------------- */

SELECT TRIM(RDB$RELATION_NAME) AS TABELA
  FROM RDB$RELATIONS
 WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
   AND RDB$VIEW_BLR IS NULL
   AND (
        RDB$RELATION_NAME LIKE '%VEND%'  OR
        RDB$RELATION_NAME LIKE '%MOV%'   OR
        RDB$RELATION_NAME LIKE '%SAID%'  OR
        RDB$RELATION_NAME LIKE '%CUPOM%' OR
        RDB$RELATION_NAME LIKE '%NOTA%'  OR
        RDB$RELATION_NAME LIKE '%PEDID%' OR
        RDB$RELATION_NAME LIKE '%ITEN%'  OR
        RDB$RELATION_NAME LIKE '%ITEM%'
       )
 ORDER BY 1;


/* ---------------------------------------------------------------------
   2. TODAS as tabelas do banco

   Se a de cima vier vazia ou estranha, esta mostra o mapa inteiro.
   Costuma dar algumas centenas de linhas — pode mandar tudo, é só nome.
   --------------------------------------------------------------------- */

SELECT TRIM(RDB$RELATION_NAME) AS TABELA
  FROM RDB$RELATIONS
 WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
   AND RDB$VIEW_BLR IS NULL
 ORDER BY 1;


/* ---------------------------------------------------------------------
   3. As colunas da PRODUTOS

   É o que diz se esta instalação tem validade e estoque mínimo — as
   duas colunas que hoje ficam vazias no .env porque nem todo Farmax
   tem, e pedir uma coluna inexistente derruba a consulta inteira.
   --------------------------------------------------------------------- */

SELECT TRIM(RF.RDB$FIELD_NAME)  AS COLUNA,
       TRIM(F.RDB$FIELD_TYPE)   AS TIPO,
       F.RDB$FIELD_LENGTH       AS TAMANHO
  FROM RDB$RELATION_FIELDS RF
  JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE
 WHERE RF.RDB$RELATION_NAME = 'PRODUTOS'
 ORDER BY RF.RDB$FIELD_POSITION;


/* ---------------------------------------------------------------------
   4. Onde, em qualquer tabela, existe validade / mínimo / vencimento

   Atalho para o caso de essas informações morarem em outra tabela — em
   muitos sistemas a validade fica no LOTE, e não no produto.
   --------------------------------------------------------------------- */

SELECT TRIM(RDB$RELATION_NAME) AS TABELA,
       TRIM(RDB$FIELD_NAME)    AS COLUNA
  FROM RDB$RELATION_FIELDS
 WHERE RDB$FIELD_NAME LIKE '%VALID%'
    OR RDB$FIELD_NAME LIKE '%VENCIM%'
    OR RDB$FIELD_NAME LIKE '%MINIM%'
    OR RDB$FIELD_NAME LIKE '%LOTE%'
 ORDER BY 1, 2;


/* ---------------------------------------------------------------------
   5. As colunas da tabela de venda que você achou no passo 1

   Troque NOME_DA_TABELA pelo nome que saiu lá. Rode uma vez para a
   tabela da venda (o cabeçalho: data, total, filial) e outra para a dos
   itens dela (o detalhe: produto, quantidade, preço).

   O nome vai em MAIÚSCULAS e entre aspas simples.
   --------------------------------------------------------------------- */

SELECT TRIM(RF.RDB$FIELD_NAME) AS COLUNA,
       F.RDB$FIELD_LENGTH      AS TAMANHO
  FROM RDB$RELATION_FIELDS RF
  JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE
 WHERE RF.RDB$RELATION_NAME = 'NOME_DA_TABELA'
 ORDER BY RF.RDB$FIELD_POSITION;
