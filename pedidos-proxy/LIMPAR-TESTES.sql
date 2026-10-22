-- ===================================================================
-- Apagar os pedidos de teste, antes do primeiro pedido de verdade
-- ===================================================================
--
-- Toda loja nasce com lixo dentro: os pedidos que a gente mesmo fez
-- para conferir o carrinho, o frete e o WhatsApp. No dia em que cai o
-- primeiro pedido de cliente, esse lixo deixa de ser inofensivo — ele
-- entra no faturamento, no ticket médio, no "produtos mais vendidos"
-- e na lista de clientes. A farmácia passa a tomar decisão em cima de
-- compras que ninguém fez.
--
-- COMO USAR, E A ORDEM IMPORTA
--
-- Rode um bloco por vez no console do D1 (Cloudflare → D1 → o banco da
-- loja → Console). Não cole o arquivo inteiro de uma vez: o passo 1 é
-- para OLHAR, e o que ele mostrar é o que decide o resto.
--
-- Este arquivo tem comentários, e o console do D1 não aceita nenhum.
-- Use o LIMPAR-TESTES-colar.sql, que é este mesmo sem comentário.
--
-- A REGRA QUE EVITA O ESTRAGO
--
-- Nunca apague por data ("tudo antes de hoje") nem por tabela inteira
-- sem olhar. Apague pelos CÓDIGOS que você leu na tela, um por um. É
-- mais trabalhoso e é o que impede o pedido do cliente de ir junto —
-- e esse não tem como voltar: a farmácia não saberia que existiu.


-- -------------------------------------------------------------------
-- 1. OLHAR  (não apaga nada)
-- -------------------------------------------------------------------
-- A data sai no horário de São Paulo, igual ao painel, para você
-- reconhecer o pedido que acabou de chegar.

SELECT ref,
       datetime((criado_em - 10800000) / 1000, 'unixepoch') AS quando,
       cliente, telefone, entrega, total, status
  FROM pedidos
 ORDER BY criado_em DESC;


-- -------------------------------------------------------------------
-- 2. CONFERIR O QUE VAI SAIR  (ainda não apaga)
-- -------------------------------------------------------------------
-- Troque os códigos pelos que VOCÊ leu no passo 1. Se esta consulta
-- devolver o pedido do cliente, pare: a lista está errada.

SELECT ref, cliente, telefone, total
  FROM pedidos
 WHERE ref IN ('TROQUE-AQUI-1', 'TROQUE-AQUI-2');


-- -------------------------------------------------------------------
-- 3. APAGAR  (com a MESMA lista do passo 2)
-- -------------------------------------------------------------------
-- Os itens primeiro. A tabela tem ON DELETE CASCADE, mas o SQLite só
-- cumpre isso com as chaves estrangeiras ligadas na conexão — e não
-- vale apostar o banco numa configuração que não dá para ver daqui.
-- Apagando na mão, funciona dos dois jeitos.

DELETE FROM pedido_itens WHERE ref IN ('TROQUE-AQUI-1', 'TROQUE-AQUI-2');
DELETE FROM pedidos      WHERE ref IN ('TROQUE-AQUI-1', 'TROQUE-AQUI-2');


-- -------------------------------------------------------------------
-- 4. REFAZER A LISTA DE CLIENTES
-- -------------------------------------------------------------------
-- A tabela `clientes` não é cadastro: é um resumo do que os pedidos
-- dizem (quantos pedidos, quanto gastou, quando foi a primeira vez).
-- Apagar os pedidos não desfaz o resumo — seu telefone ficaria lá como
-- "3 pedidos, R$ 280 gastos" para sempre, e apareceria na Reativação
-- como cliente sumido.
--
-- Em vez de caçar linha por linha, ela é reconstruída a partir dos
-- pedidos que sobraram. Fica certa por definição, e corrige de quebra
-- qualquer desencontro antigo.

DELETE FROM clientes;

INSERT INTO clientes (telefone, nome, ultimo_endereco,
                      primeiro_pedido, ultimo_pedido, pedidos, total_gasto)
SELECT p.telefone,
       (SELECT x.cliente  FROM pedidos x WHERE x.telefone = p.telefone
         ORDER BY x.criado_em DESC LIMIT 1),
       (SELECT x.endereco FROM pedidos x WHERE x.telefone = p.telefone
         ORDER BY x.criado_em DESC LIMIT 1),
       MIN(p.criado_em),
       MAX(p.criado_em),
       COUNT(*),
       COALESCE(SUM(p.total), 0)
  FROM pedidos p
 GROUP BY p.telefone;


-- -------------------------------------------------------------------
-- 4.5. O CUPOM QUE VOCÊ USOU NO TESTE
-- -------------------------------------------------------------------
-- Apagar o pedido NÃO devolve o uso do cupom. O uso é uma linha à
-- parte, ligada ao pedido pelo código dele — e ela sobrevive.
--
-- Duas consequências, as duas chatas no dia seguinte:
--
--   - o cupom "uma vez por cliente" fica QUEIMADO para o seu telefone.
--     Você testa, apaga o pedido, tenta de novo e ouve "você já usou
--     este cupom" sem entender por quê;
--   - o painel mostra "3 de 50 usos" e R$ 30 descontados de promoção
--     que não aconteceu.
--
-- Isto tira os usos cujo pedido não existe mais e refaz o contador a
-- partir do que sobrou. Se a loja ainda não rodou o schema-cupons.sql,
-- estas duas linhas dão erro de "no such table" e podem ser puladas.

DELETE FROM cupom_usos
 WHERE NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.ref = cupom_usos.ref);

UPDATE cupons SET usos = (
    SELECT COUNT(*) FROM cupom_usos u WHERE u.codigo = cupons.codigo
);


-- -------------------------------------------------------------------
-- 5. AS BUSCAS DE TESTE  (opcional, e pense antes)
-- -------------------------------------------------------------------
-- A tabela `buscas` alimenta "o que mais procuram" e "procuraram e não
-- acharam" — que é o relatório que mais vale, porque cada linha é uma
-- venda que não aconteceu.
--
-- O lixo aqui são as suas buscas de teste ("teste", "aaa", o nome do
-- produto que você digitou dez vezes). Mas as buscas de clientes de
-- verdade já podem estar misturadas, e essas valem ouro.
--
-- Por isso o corte é por TERMO, e não por tudo:

DELETE FROM buscas WHERE termo IN ('teste', 'aaa', 'asd');

-- Se preferir zerar o período em que ninguém de fora usou o site,
-- troque a data e rode. Tudo ANTES dela sai.

-- DELETE FROM buscas
--  WHERE criado_em < strftime('%s', '2026-10-21') * 1000;


-- -------------------------------------------------------------------
-- 6. CONFERIR  (não apaga nada)
-- -------------------------------------------------------------------
-- Os três números têm de bater com o que o painel mostra em "Relatórios"
-- depois de atualizar a página.

SELECT (SELECT COUNT(*) FROM pedidos)       AS pedidos,
       (SELECT COUNT(*) FROM pedido_itens)  AS itens,
       (SELECT COUNT(*) FROM clientes)      AS clientes,
       (SELECT COUNT(*) FROM cupom_usos)    AS usos_de_cupom,
       (SELECT COALESCE(SUM(total), 0) FROM pedidos) AS faturamento;


-- -------------------------------------------------------------------
-- O QUE ESTE ARQUIVO NÃO TOCA, DE PROPÓSITO
-- -------------------------------------------------------------------
--   estoque_foto / estoque_mov   vêm do extrator no PC da farmácia e
--                                são medição, não teste. Apagar aqui
--                                faz a aba Estoque perder o histórico
--                                de giro, que leva dias para refazer.
--
--   reativacao_fila              se você testou o envio em massa com o
--                                seu número, limpe com:
--                                DELETE FROM reativacao_fila;
--
--   banners / promocoes /        são conteúdo, não teste. Saem pelo
--   encartes                     painel, que é onde entraram.
