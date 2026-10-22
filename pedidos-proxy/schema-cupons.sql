-- ===================================================================
-- Cupons de desconto
-- ===================================================================
--
-- O SITE NÃO COBRA NADA. O pedido vira mensagem de WhatsApp e cópia
-- aqui; o dinheiro troca de mão no balcão ou na entrega. Então um cupom
-- não é pagamento, é uma INSTRUÇÃO para a farmácia cobrar menos — e o
-- que ele precisa garantir é que o desconto que aparece na tela da
-- atendente foi mesmo criado pela loja.
--
-- É por isso que a validação é aqui no servidor e não no navegador.
-- Validado no site, qualquer pessoa abriria o console e inventaria
-- "DESCONTO90"; a atendente veria o cupom no pedido, sem motivo para
-- desconfiar, e daria o desconto.
--
-- O QUE CADA COLUNA RESOLVE
--
-- Nenhuma delas é enfeite: cada uma existe para um jeito de perder
-- dinheiro que já é conhecido no varejo.

CREATE TABLE IF NOT EXISTS cupons (

    -- Sempre em MAIÚSCULA, sem espaço. Quem digita no celular digita
    -- "bemvindo10", "BemVindo10" e " BEMVINDO10 " — e os três têm de
    -- ser o mesmo cupom, senão o cliente acha que o código não presta.
    codigo        TEXT PRIMARY KEY,

    -- 'percentual'  desconto de N% sobre os produtos
    -- 'valor'       desconto de R$ N sobre os produtos
    -- 'frete'       a taxa de entrega sai; o valor é ignorado
    tipo          TEXT NOT NULL,
    valor         REAL NOT NULL DEFAULT 0,

    -- Pedido mínimo PARA ESTE CUPOM, medido sobre os produtos, sem o
    -- frete. Um "R$ 10 de desconto" sem mínimo transforma um pedido de
    -- R$ 12 em R$ 2 — e a loja paga para entregar.
    minimo        REAL NOT NULL DEFAULT 0,

    -- Teto do desconto, para o percentual. 20% num pedido de R$ 800 é
    -- R$ 160, que não era o que a promoção queria dizer. Zero = sem teto.
    teto          REAL NOT NULL DEFAULT 0,

    -- Validade. Nulo dos dois lados = vale sempre. O fim é o fim do DIA
    -- escolhido: quem põe 31/10 espera que valha até o fim do dia 31.
    inicio        INTEGER,
    fim           INTEGER,

    -- Quantas vezes o cupom pode ser usado no total, e quantas vezes
    -- pela MESMA pessoa. Zero no total = ilimitado.
    --
    -- O limite por cliente é o que impede o uso mais óbvio: um cupom de
    -- boas-vindas rodando toda semana para o mesmo telefone. O padrão é
    -- 1 porque é o que quase toda promoção quer dizer.
    limite_total  INTEGER NOT NULL DEFAULT 0,
    limite_pessoa INTEGER NOT NULL DEFAULT 1,

    -- Contador, mantido junto com o pedido na mesma transação.
    usos          INTEGER NOT NULL DEFAULT 0,

    -- Desligar sem apagar: um cupom apagado perde o histórico de uso, e
    -- o histórico é o que responde "a promoção valeu a pena?".
    ativo         INTEGER NOT NULL DEFAULT 1,

    descricao     TEXT,
    criado_em     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cupons_ativo ON cupons (ativo);

-- Uma linha por uso. Serve a duas coisas:
--   1. contar quantas vezes ESTE telefone já usou ESTE cupom;
--   2. responder, depois, quanto a promoção custou e quanto trouxe.
--
-- O ref é o do pedido, então dá para cruzar com o faturamento: cupom
-- que deu desconto e não trouxe pedido novo é cupom que custou dinheiro
-- de quem já ia comprar.
CREATE TABLE IF NOT EXISTS cupom_usos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo    TEXT NOT NULL,
    telefone  TEXT NOT NULL,
    ref       TEXT NOT NULL,
    desconto  REAL NOT NULL DEFAULT 0,
    quando    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cupom_usos_codigo ON cupom_usos (codigo);
CREATE INDEX IF NOT EXISTS idx_cupom_usos_telefone ON cupom_usos (codigo, telefone);

-- O mesmo pedido não pode contar duas vezes. O site reenvia quando a
-- rede oscila, e sem isto o reenvio gastaria um uso do cupom e somaria
-- um desconto que não existiu.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cupom_usos_ref ON cupom_usos (ref);

-- POR QUE O DESCONTO NÃO VIRA COLUNA EM `pedidos`
--
-- Seria mais direto, e foi a primeira ideia. O problema é que acrescentar
-- coluna a uma tabela que já existe pede ALTER TABLE, e ALTER TABLE não
-- é repetível: rodado duas vezes, ele falha com "duplicate column". Este
-- arquivo vai ser colado no console de cada farmácia, às vezes duas
-- vezes, às vezes por quem não sabe se já rodou — e um schema que
-- quebra na segunda colagem é um schema que alguém vai abandonar no
-- meio, com metade das tabelas criadas.
--
-- Então o uso do cupom mora aqui, ligado pelo `ref` do pedido, e a fila
-- e o relatório fazem um LEFT JOIN. É uma linha a mais na consulta e um
-- arquivo que se pode colar quantas vezes quiser.
