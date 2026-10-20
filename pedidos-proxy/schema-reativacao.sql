-- ===================================================================
-- Reativação de clientes — a fila que o agente consome
-- ===================================================================
--
-- Roda no banco DE OPERAÇÃO de cada farmácia (o mesmo do schema.sql).
-- Lista de cliente é dado da loja, e o isolamento por banco é o que
-- impede uma consulta esquecida de entregar a carteira de uma farmácia
-- para a concorrente.
--
-- POR QUE ISTO SAIU DO NAVEGADOR
--
-- Enquanto a campanha era um clique por vez, a lista podia viver no
-- localStorage do painel. Com um agente enviando, não pode: o agente é
-- outro programa, em outra máquina, e precisa saber o que já foi
-- enviado para não mandar duas vezes. Duas mensagens iguais, do mesmo
-- número, com o nome trocado, é o que faz alguém bloquear a farmácia.
--
-- O BLOQUEIO É SEPARADO DA FILA, E NÃO SE APAGA
--
-- A fila é de UMA campanha e some na próxima. O "não perturbe" vale
-- para sempre: quem respondeu "não quero mais receber" não pode voltar
-- quando alguém reimportar a mesma planilha no mês seguinte. Juntos na
-- mesma tabela, um DELETE de campanha levaria os dois.
--
-- O "dias sem comprar" de uma farmácia diz mais do que parece: quem
-- comprava o mesmo remédio todo mês e parou é informação sobre a saúde
-- daquela pessoa. É por isso que o bloqueio tem tabela própria, entra
-- antes da fila e nunca é apagado por rotina de limpeza.

CREATE TABLE IF NOT EXISTS reativacao_bloqueio (
    -- o telefone em formato internacional, só dígitos: 5519975172840.
    -- É a identidade da pessoa aqui, e não o nome: nome repete e muda
    -- de grafia entre dois cadastros do mesmo cliente.
    telefone    TEXT PRIMARY KEY,
    -- "pediu", "respondeu-stop", "manual": serve para a loja saber se
    -- foi o cliente que pediu ou se alguém bloqueou por engano.
    motivo      TEXT,
    criado_em   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reativacao_fila (
    telefone    TEXT PRIMARY KEY,
    nome        TEXT,
    dias        INTEGER NOT NULL DEFAULT 0,
    mensagem    TEXT NOT NULL,

    -- 'espera'   ainda não foi entregue ao agente
    -- 'enviando' o agente pegou e ainda não deu notícia
    -- 'enviado'  confirmado pelo agente
    -- 'falhou'   o agente tentou e não conseguiu
    situacao    TEXT NOT NULL DEFAULT 'espera',

    -- quantas vezes o agente já pegou esta linha. Existe para o lote
    -- não ficar preso: uma linha que foi pega três vezes e nunca
    -- voltou tem algo de errado, e o /proximos para de oferecê-la em
    -- vez de girar para sempre no mesmo item.
    tentativas  INTEGER NOT NULL DEFAULT 0,

    -- quando o agente pegou pela última vez. É o que permite devolver
    -- para a fila o que ficou preso em 'enviando' (agente caiu no meio).
    pego_em     INTEGER,

    erro        TEXT,
    criado_em   INTEGER NOT NULL,
    enviado_em  INTEGER
);

-- A varredura do /proximos é "quem está esperando, mais antigo
-- primeiro". Sem isto ela lê a fila inteira a cada chamada do agente.
CREATE INDEX IF NOT EXISTS idx_fila_situacao ON reativacao_fila (situacao, criado_em);
