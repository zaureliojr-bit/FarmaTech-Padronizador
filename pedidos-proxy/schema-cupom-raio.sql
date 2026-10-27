-- ===================================================================
-- Raio de entrega do cupom
-- ===================================================================
--
-- "Entrega grátis até 3 km."
--
-- É a promoção que a farmácia de bairro realmente quer fazer, e que o
-- cupom de frete grátis sozinho não sabia fazer. Sem o raio, "FRETEZERO"
-- vale igual para quem mora na esquina e para quem mora a 7 km — e os
-- dois custam coisas muito diferentes para quem entrega de moto.
--
-- Com o raio, a loja anuncia o que pode cumprir: perto sai de graça,
-- longe paga a taxa. O cliente de longe não fica sem comprar; fica sem
-- o cupom, e vê o porquê escrito na tela.
--
-- POR QUE UMA TABELA EM VEZ DE UMA COLUNA EM `cupons`
--
-- Pela mesma razão que o `cupom_usos` existe, e está escrita lá: colocar
-- coluna em tabela que já existe pede ALTER TABLE, e ALTER TABLE não é
-- repetível. Rodado duas vezes, falha com "duplicate column".
--
-- Estes arquivos são colados no console do D1 de cada farmácia, às vezes
-- duas vezes, às vezes por quem não sabe se já rodou. Um schema que
-- quebra na segunda colagem é um schema que alguém abandona no meio,
-- com metade das tabelas criadas. Então: tabela nova, LEFT JOIN na
-- consulta, e este arquivo pode ser colado quantas vezes quiser.
--
-- E tem um ganho de borda: cupom sem linha aqui é cupom sem limite de
-- distância. O comportamento de antes continua sendo o padrão, sem
-- nenhuma linha de migração.

CREATE TABLE IF NOT EXISTS cupom_raio (

    -- O mesmo código da tabela `cupons`, já em maiúscula. Chave
    -- primária, então um cupom tem no máximo um raio.
    codigo   TEXT PRIMARY KEY,

    -- Em quilômetros, com casa decimal: 1.5 é um raio legítimo numa
    -- cidade onde 3 km já é o bairro inteiro.
    --
    -- Maior que zero, sempre. Zero aqui seria ambíguo — "nenhuma
    -- distância" ou "sem limite"? —, e a ambiguidade acabaria decidida
    -- por um `if` distraído em alguma versão futura. Quem não quer
    -- limite não tem linha nesta tabela.
    raio_km  REAL NOT NULL CHECK (raio_km > 0),

    criado_em INTEGER NOT NULL
);

-- COMO O RAIO É CONFERIDO, E O QUE ELE NÃO É
--
-- Quem mede a distância é o site, no navegador do cliente: ele já
-- geocodifica o endereço para calcular a taxa de entrega, e manda o km
-- junto na validação do cupom. O worker compara e responde.
--
-- Ou seja: isto NÃO é uma trava de segurança. Quem abrir o console do
-- navegador manda o km que quiser. E está certo que seja assim — o site
-- não cobra nada, o pedido vira mensagem de WhatsApp, e quem confirma a
-- taxa de entrega é a pessoa do balcão, olhando o endereço. O raio aqui
-- serve para a promoção se explicar sozinha ao cliente honesto, que é
-- quem ela quer atender.
--
-- Sem endereço calculado, o cupom é recusado em vez de liberado. É a
-- escolha conservadora e também a mais útil: ela empurra o cliente a
-- preencher o CEP, que é o dado de que a farmácia precisa de qualquer
-- jeito para entregar.
