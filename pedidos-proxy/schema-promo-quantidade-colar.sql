CREATE TABLE IF NOT EXISTS promocao_quantidade (
    codigo      TEXT PRIMARY KEY,
    tipo        TEXT NOT NULL,
    leve        INTEGER NOT NULL DEFAULT 0,
    pague       INTEGER NOT NULL DEFAULT 0,
    quantidade  INTEGER NOT NULL DEFAULT 0,
    preco       REAL    NOT NULL DEFAULT 0,
    inicio      TEXT,
    fim         TEXT,
    ativo       INTEGER NOT NULL DEFAULT 1,
    lote        TEXT,
    criado_em   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_promo_qtd_ativo ON promocao_quantidade (ativo);
CREATE INDEX IF NOT EXISTS idx_promo_qtd_lote  ON promocao_quantidade (lote);
