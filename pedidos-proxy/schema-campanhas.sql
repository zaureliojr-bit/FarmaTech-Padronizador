-- ===================================================================
-- Campanhas: ligar o dinheiro do anúncio à venda que aconteceu
-- ===================================================================
--
-- O Meta diz "47 cliques". O Google diz "R$ 80 gastos". Nenhum dos dois
-- sabe que saíram três pedidos de R$ 280 desta farmácia — eles não
-- enxergam o carrinho daqui, e o dono fica decidindo onde pôr o
-- dinheiro do mês por quantidade de clique, que não paga conta.
--
-- Estas tabelas respondem a única pergunta que importa: gastei X,
-- vendi Y.
--
-- COMO A VISITA SABE DE ONDE VEIO
--
-- O painel monta o link do anúncio com um carimbo no fim
-- (?c=instagram-outubro). Quem clica chega com o carimbo, o site o
-- guarda no próprio navegador e o devolve quando o pedido é enviado.
-- O endereço é limpo logo depois de lido, para o link que a pessoa
-- compartilhar com a tia não entrar na conta da campanha.
--
-- Continua sem identificar ninguém: o que o servidor recebe é "mais
-- uma visita da campanha instagram-outubro hoje", igual ao funil. Não
-- há como perguntar a esta tabela quem clicou.
--
-- A JANELA, E O QUE ELA NÃO ALCANÇA
--
-- Vale a ÚLTIMA campanha clicada nos últimos 7 dias. Quem vê o anúncio
-- e aparece na loja a pé não entra aqui — e nenhuma ferramenta do
-- mundo conta isso. O número desta tabela é piso, não total: a
-- campanha vendeu pelo menos isto.

-- -------------------------------------------------------------------
-- A campanha, como a loja a chama
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campanhas (

    -- o carimbo que vai no link: só minúsculas, número e hífen, porque
    -- ele aparece na barra de endereço do cliente
    id          TEXT PRIMARY KEY,

    -- "Instagram outubro — fraldas", como o dono fala dela
    nome        TEXT NOT NULL,

    -- instagram | facebook | google | whatsapp | panfleto | outro
    -- Panfleto está aqui de propósito: QR code impresso também pode
    -- carregar carimbo, e aí o papel passa a ter número como o resto.
    canal       TEXT NOT NULL DEFAULT 'outro',

    -- quanto a loja pôs nela até agora. Digitado à mão: ler isto das
    -- APIs do Google e do Meta é outra obra, e sem o valor não há
    -- custo por pedido nenhum para mostrar.
    gasto       REAL NOT NULL DEFAULT 0,

    ativa       INTEGER NOT NULL DEFAULT 1,
    criado_em   INTEGER NOT NULL DEFAULT 0
);

-- -------------------------------------------------------------------
-- As visitas, somadas por dia
-- -------------------------------------------------------------------
-- Mesma forma do funil, pelo mesmo motivo: uma linha por dia e
-- campanha, e não uma por pessoa. Loja movimentada não pode ganhar uma
-- linha de banco por visitante, e contagem não precisa de quem.
CREATE TABLE IF NOT EXISTS campanha_dia (
    dia         TEXT NOT NULL,
    campanha    TEXT NOT NULL,
    visitas     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, campanha)
);

CREATE INDEX IF NOT EXISTS idx_campanha_dia ON campanha_dia (dia);

-- -------------------------------------------------------------------
-- O pedido que veio de uma campanha
-- -------------------------------------------------------------------
-- Tabela à parte em vez de uma coluna em `pedidos`, pelo mesmo motivo
-- do cupom: ALTER TABLE ADD COLUMN não é idempotente, e este arquivo
-- vai ser colado de novo em toda loja nova e em qualquer re-execução
-- por engano. Assim, colar duas vezes não dá erro.
--
-- Guarda o VALOR do pedido junto, e não só a referência? Não: o valor
-- muda quando o pedido é cancelado, e dois lugares com o mesmo número
-- é como um deles fica errado. A receita sai de `pedidos`, onde o
-- status mora.
CREATE TABLE IF NOT EXISTS pedido_campanha (
    ref         TEXT PRIMARY KEY,
    campanha    TEXT NOT NULL,
    quando      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pedido_campanha ON pedido_campanha (campanha);
