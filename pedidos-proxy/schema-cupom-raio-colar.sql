CREATE TABLE IF NOT EXISTS cupom_raio (
    codigo   TEXT PRIMARY KEY,
    raio_km  REAL NOT NULL CHECK (raio_km > 0),
    criado_em INTEGER NOT NULL
);
