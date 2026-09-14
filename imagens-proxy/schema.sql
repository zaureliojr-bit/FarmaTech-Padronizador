-- Índice das imagens hospedadas no R2, por EAN.
-- Rode isto uma vez no D1 (painel do Cloudflare -> D1 -> Console) antes
-- de usar o worker. Seguro rodar de novo depois (IF NOT EXISTS) - é
-- assim que se adiciona uma tabela nova sem mexer na que já existe.

CREATE TABLE IF NOT EXISTS imagens (
    ean TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    origem TEXT NOT NULL,
    url_original TEXT,
    salvo_em INTEGER NOT NULL
);

-- Correções manuais (descrição/classe/categoria) por cima do que a
-- planilha do PDV ou o pipeline automático geraram. Por EAN, sem nada
-- específico de loja - preço/estoque/código nunca entram aqui, ficam
-- só no catálogo de cada loja.
CREATE TABLE IF NOT EXISTS correcoes (
    ean TEXT PRIMARY KEY,
    descricao_manual TEXT,
    classe TEXT,
    categoria TEXT,
    atualizado_em INTEGER NOT NULL
);

-- A que família do site (perfumaria, higiene, etc.) cada categoria
-- bruta do PDV pertence, quando ela não bate com o dicionário fixo do
-- padronizador (familias.js) - evita ter que mexer em código toda vez
-- que aparece uma categoria nova numa planilha. Chave é a categoria já
-- normalizada (maiúscula, espaços colapsados), igual o padronizador faz.
CREATE TABLE IF NOT EXISTS familias_categoria (
    categoria TEXT PRIMARY KEY,
    familia_id TEXT NOT NULL,
    atualizado_em INTEGER NOT NULL
);
