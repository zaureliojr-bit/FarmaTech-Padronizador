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

CREATE TABLE IF NOT EXISTS cmv_revisoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filial INTEGER NOT NULL CHECK (filial IN (1,2,3)),
  produto TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDENTE','EM_ANALISE','CORRIGIDO')),
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cmv_revisoes_produto ON cmv_revisoes(filial,produto,id);
