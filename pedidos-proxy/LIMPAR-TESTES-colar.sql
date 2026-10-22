SELECT ref,
       datetime((criado_em - 10800000) / 1000, 'unixepoch') AS quando,
       cliente, telefone, entrega, total, status
  FROM pedidos
 ORDER BY criado_em DESC;
SELECT ref, cliente, telefone, total
  FROM pedidos
 WHERE ref IN ('TROQUE-AQUI-1', 'TROQUE-AQUI-2');
DELETE FROM pedido_itens WHERE ref IN ('TROQUE-AQUI-1', 'TROQUE-AQUI-2');
DELETE FROM pedidos      WHERE ref IN ('TROQUE-AQUI-1', 'TROQUE-AQUI-2');
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
       SUM(CASE WHEN p.status <> 'cancelado' THEN 1 ELSE 0 END),
       COALESCE(SUM(CASE WHEN p.status <> 'cancelado' THEN p.total ELSE 0 END), 0)
  FROM pedidos p
 GROUP BY p.telefone;
DELETE FROM cupom_usos
 WHERE NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.ref = cupom_usos.ref);
UPDATE cupons SET usos = (
    SELECT COUNT(*) FROM cupom_usos u WHERE u.codigo = cupons.codigo
);
DELETE FROM buscas WHERE termo IN ('teste', 'aaa', 'asd');
SELECT (SELECT COUNT(*) FROM pedidos)       AS pedidos,
       (SELECT COUNT(*) FROM pedido_itens)  AS itens,
       (SELECT COUNT(*) FROM clientes)      AS clientes,
       (SELECT COUNT(*) FROM cupom_usos)    AS usos_de_cupom,
       (SELECT COALESCE(SUM(total), 0) FROM pedidos) AS faturamento;
