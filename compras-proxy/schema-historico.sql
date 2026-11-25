CREATE TABLE IF NOT EXISTS compras_historico (
 loja TEXT NOT NULL,
 lote TEXT NOT NULL,
 extraido_em TEXT NOT NULL,
 PRIMARY KEY (loja,lote)
);
CREATE INDEX IF NOT EXISTS compras_historico_data ON compras_historico(loja,extraido_em);
INSERT OR IGNORE INTO compras_historico(loja,lote,extraido_em)
 SELECT loja,lote,extraido_em FROM compras_ativos;
