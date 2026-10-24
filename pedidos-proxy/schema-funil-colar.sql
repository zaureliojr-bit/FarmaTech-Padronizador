CREATE TABLE IF NOT EXISTS funil (
    dia    TEXT NOT NULL,
    etapa  TEXT NOT NULL,
    total  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, etapa)
);
CREATE INDEX IF NOT EXISTS idx_funil_dia ON funil (dia);
