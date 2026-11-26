CREATE TABLE IF NOT EXISTS cmv_dias (
 filial INTEGER NOT NULL CHECK(filial IN (1,2,3)),
 dia TEXT NOT NULL,
 dados TEXT NOT NULL CHECK(json_valid(dados)),
 atualizado_em TEXT NOT NULL,
 PRIMARY KEY(filial,dia)
);
CREATE TABLE IF NOT EXISTS cmv_lotes (
 lote TEXT PRIMARY KEY,
 inicio TEXT NOT NULL,
 fim TEXT NOT NULL,
 extraido_em TEXT NOT NULL,
 recebido_em TEXT NOT NULL
);
