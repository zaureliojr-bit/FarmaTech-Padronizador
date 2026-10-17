-- ===================================================================
-- Estoque e giro — a fotografia diária do estoque da farmácia
-- ===================================================================
--
-- Roda no banco DE OPERAÇÃO de cada farmácia (o mesmo do schema.sql),
-- nunca no banco principal: estoque é dado comercial da loja, e o
-- isolamento por banco é o que impede uma consulta esquecida de mostrar
-- o encalhe de uma farmácia para a concorrente.
--
-- POR QUE DUAS TABELAS, E NÃO UMA
--
-- São 6.800 produtos. Guardar a fotografia inteira todo dia dá 2,5
-- milhões de linhas por ano para responder perguntas sobre algumas
-- centenas de itens que de fato se mexem. Então:
--
--   estoque_foto  — como está HOJE. Uma linha por produto, sobrescrita.
--   estoque_mov   — o que MUDOU, um dia de cada vez. Só quem se mexeu.
--
-- Produto parado não gera linha nenhuma em estoque_mov, e é justamente
-- por estar ausente que ele aparece na lista de encalhe.
--
-- POR QUE "SAÍDA" E "ENTRADA" SEPARADAS
--
-- A diferença entre duas fotografias não distingue venda de perda, nem
-- compra de devolução. Mas distingue o SENTIDO, e isso já vale: estoque
-- que caiu é consumo (o que estima giro), estoque que subiu é
-- reposição (o que NÃO pode entrar na conta de giro, senão um
-- recebimento grande faria o produto parecer que vendeu).
--
-- Somar as duas numa coluna só de "variação" perderia exatamente isso —
-- um dia de compra de 50 anularia dez dias de venda de 5.
--
-- Quando o Farmax nos der a tabela de vendas de verdade, a saída deixa
-- de ser estimada e estas colunas passam a receber o número exato. O
-- resto do que está construído em cima continua valendo.

CREATE TABLE IF NOT EXISTS estoque_foto (
    ean         TEXT PRIMARY KEY,
    codigo      TEXT,
    descricao   TEXT,
    estoque     REAL NOT NULL DEFAULT 0,
    -- custo é o que transforma "230 unidades paradas" em "R$ 1.840
    -- parados na prateleira", que é a frase que faz o dono agir
    custo       REAL,
    preco       REAL,
    -- estoque mínimo e validade só existem se o sistema da farmácia
    -- tiver as colunas. Ficam nulos quando não tem, e quem lê trata
    -- ausência como "não sei", nunca como zero.
    minimo      REAL,
    validade    TEXT,
    visto_em    INTEGER NOT NULL        -- epoch em milissegundos, UTC
);

-- "o que está zerado" e "o que vale mais parado" são as duas varreduras
-- da tela de estoque, e as duas leem a tabela inteira sem isto.
CREATE INDEX IF NOT EXISTS idx_foto_estoque ON estoque_foto (estoque);

CREATE TABLE IF NOT EXISTS estoque_mov (
    ean             TEXT NOT NULL,
    -- data local da FARMÁCIA, não UTC: quem manda é o agente que roda no
    -- PC dela. Uma extração às 22h em Cuiabá é do dia 14 para a dona da
    -- farmácia, e seria do dia 15 em UTC — o relatório tem que bater com
    -- o calendário de quem lê.
    dia             TEXT NOT NULL,      -- 'YYYY-MM-DD'
    estoque_antes   REAL,
    estoque_depois  REAL NOT NULL,
    saida           REAL NOT NULL DEFAULT 0,
    entrada         REAL NOT NULL DEFAULT 0,
    -- Uma linha por produto por dia. Rodar a extração duas vezes no
    -- mesmo dia não pode dobrar a venda estimada: a segunda substitui a
    -- primeira, e o "antes" continua sendo o do começo do dia.
    PRIMARY KEY (ean, dia)
);

CREATE INDEX IF NOT EXISTS idx_mov_dia ON estoque_mov (dia);
