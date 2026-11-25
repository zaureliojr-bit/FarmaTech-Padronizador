CREATE TABLE IF NOT EXISTS compras_lotes (
 loja TEXT NOT NULL, lote TEXT NOT NULL, extraido_em TEXT NOT NULL,
 notas INTEGER NOT NULL, itens INTEGER NOT NULL,
 PRIMARY KEY(loja,lote)
);
CREATE TABLE IF NOT EXISTS compras_partes (
 loja TEXT NOT NULL, lote TEXT NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('notas','itens')),
 pos INTEGER NOT NULL, dados TEXT NOT NULL, quantidade INTEGER NOT NULL,
 PRIMARY KEY(loja,lote,tipo,pos)
);
CREATE TABLE IF NOT EXISTS compras_ativos (
 loja TEXT PRIMARY KEY, lote TEXT NOT NULL, extraido_em TEXT NOT NULL
);
