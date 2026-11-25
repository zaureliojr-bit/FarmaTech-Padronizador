-- Aditivo: executar na ordem. Nenhuma tabela existente é removida.
CREATE TABLE IF NOT EXISTS compras_inc_atuais (
 loja TEXT NOT NULL, compra INTEGER NOT NULL, hash TEXT NOT NULL,
 extraido_em TEXT NOT NULL, lote TEXT NOT NULL,
 qtd_itens INTEGER NOT NULL,
 PRIMARY KEY(loja,compra)
);
CREATE TRIGGER IF NOT EXISTS compras_inc_atualizar_atuais
AFTER INSERT ON compras_inc_publicados
BEGIN
 INSERT INTO compras_inc_atuais(loja,compra,hash,extraido_em,lote,qtd_itens)
 SELECT m.loja,m.compra,m.hash,NEW.extraido_em,NEW.lote,json_array_length(c.itens)
 FROM compras_inc_manifesto m JOIN compras_inc_conteudo c
 ON c.loja=m.loja AND c.compra=m.compra AND c.hash=m.hash
 WHERE m.loja=NEW.loja AND m.lote=NEW.lote
 ON CONFLICT(loja,compra) DO UPDATE SET hash=excluded.hash,
 extraido_em=excluded.extraido_em,lote=excluded.lote,qtd_itens=excluded.qtd_itens
 WHERE excluded.extraido_em>compras_inc_atuais.extraido_em OR
 (excluded.extraido_em=compras_inc_atuais.extraido_em AND excluded.lote>compras_inc_atuais.lote);
END;
INSERT INTO compras_inc_atuais(loja,compra,hash,extraido_em,lote,qtd_itens)
SELECT loja,compra,hash,extraido_em,lote,qtd_itens FROM (
 SELECT m.loja,m.compra,m.hash,p.extraido_em,p.lote,json_array_length(c.itens) AS qtd_itens,
 ROW_NUMBER() OVER(PARTITION BY m.loja,m.compra ORDER BY p.extraido_em DESC,p.lote DESC) AS rn
 FROM compras_inc_manifesto m JOIN compras_inc_publicados p ON p.loja=m.loja AND p.lote=m.lote
 JOIN compras_inc_conteudo c ON c.loja=m.loja AND c.compra=m.compra AND c.hash=m.hash
) WHERE rn=1
ON CONFLICT(loja,compra) DO UPDATE SET hash=excluded.hash,extraido_em=excluded.extraido_em,lote=excluded.lote,qtd_itens=excluded.qtd_itens
WHERE excluded.extraido_em>compras_inc_atuais.extraido_em OR
(excluded.extraido_em=compras_inc_atuais.extraido_em AND excluded.lote>compras_inc_atuais.lote);
