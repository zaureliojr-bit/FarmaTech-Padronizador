CREATE TABLE IF NOT EXISTS vendas_diarias (
 filial INTEGER NOT NULL CHECK(filial IN (1,2,3)),
 dia TEXT NOT NULL,
 classe_id TEXT NOT NULL,
 classe TEXT NOT NULL,
 tipo_venda TEXT NOT NULL,
 troca TEXT NOT NULL,
 registros INTEGER NOT NULL,
 registros_com_valor INTEGER NOT NULL,
 vendas_10000 INTEGER NOT NULL,
 atualizado_em TEXT NOT NULL,
 PRIMARY KEY(filial,dia,classe_id,tipo_venda,troca)
);
CREATE INDEX IF NOT EXISTS idx_vendas_dia ON vendas_diarias(dia,filial);
CREATE INDEX IF NOT EXISTS idx_vendas_classe ON vendas_diarias(filial,classe_id,dia);
CREATE TABLE IF NOT EXISTS vendas_sincronizacoes (
 lote TEXT PRIMARY KEY,inicio TEXT NOT NULL,fim TEXT NOT NULL,extraido_em TEXT NOT NULL,recebido_em TEXT NOT NULL,grupos INTEGER NOT NULL,registros INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vendas_metas (
 filial INTEGER NOT NULL CHECK(filial IN (1,2,3)),ano INTEGER NOT NULL,mes INTEGER NOT NULL CHECK(mes BETWEEN 1 AND 12),percentual_compras REAL NOT NULL DEFAULT 60 CHECK(percentual_compras BETWEEN 0 AND 100),atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(filial,ano,mes)
);
