-- Migração aditiva. Não apagar as tabelas do piloto.
CREATE TABLE IF NOT EXISTS compras_inc_conteudo (
 loja TEXT NOT NULL,
 compra INTEGER NOT NULL,
 hash TEXT NOT NULL,
 nota TEXT NOT NULL CHECK(json_valid(nota)),
 itens TEXT NOT NULL CHECK(json_valid(itens)),
 PRIMARY KEY(loja,compra,hash)
);
CREATE TABLE IF NOT EXISTS compras_inc_lotes (
 loja TEXT NOT NULL,
 lote TEXT NOT NULL,
 extraido_em TEXT NOT NULL,
 inicio TEXT NOT NULL,
 fim TEXT NOT NULL,
 quantidade INTEGER NOT NULL CHECK(quantidade>=0),
 PRIMARY KEY(loja,lote)
);
CREATE TABLE IF NOT EXISTS compras_inc_manifesto (
 loja TEXT NOT NULL,
 lote TEXT NOT NULL,
 compra INTEGER NOT NULL,
 hash TEXT NOT NULL,
 PRIMARY KEY(loja,lote,compra)
);
CREATE TABLE IF NOT EXISTS compras_inc_publicados (
 loja TEXT NOT NULL,
 lote TEXT NOT NULL,
 extraido_em TEXT NOT NULL,
 PRIMARY KEY(loja,lote)
);
CREATE INDEX IF NOT EXISTS compras_inc_publicados_data ON compras_inc_publicados(loja,extraido_em,lote);
CREATE INDEX IF NOT EXISTS compras_inc_manifesto_compra ON compras_inc_manifesto(loja,compra,lote);
-- Manifestos representam a janela consultada, não toda a vida da filial.
-- Ausência fora da janela nunca significa exclusão.
