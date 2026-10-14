/* Fase 2 da plataforma multiloja: a loja vira dado.

   Hoje o endereço, o CNPJ, o CRF da farmacêutica, o telefone, as
   coordenadas e o horário estão escritos em 29 lugares, dentro de 6
   arquivos de HTML e JavaScript do site. Cadastrar a segunda farmácia,
   desse jeito, é copiar um site e trocar 29 valores na mão — e errar um
   deles significa publicar o CRF de uma farmacêutica na porta de outra
   farmácia, o que não é bug de software, é problema sanitário.

   Depois destas duas tabelas, a segunda loja é um INSERT.

   COMO RODAR

   Cole no console de SQL do D1 (banco farmatech-pedidos) e execute.

   Nenhum comentário aqui usa "--". O console do D1 achata o arquivo
   inteiro numa linha só antes de enviar; com "--", a primeira ocorrência
   comentaria todo o resto e o erro que aparece é "Requests without any
   query are not supported", que não diz nada sobre a causa. Comentário
   de bloco sobrevive ao achatamento.

   Rodar duas vezes não quebra nada: tudo é IF NOT EXISTS, e o seed usa
   INSERT OR IGNORE. */

CREATE TABLE IF NOT EXISTS lojas (
    slug            TEXT PRIMARY KEY,
    nome            TEXT NOT NULL,
    razao_social    TEXT,
    cnpj            TEXT,
    logradouro      TEXT,
    numero          TEXT,
    complemento     TEXT,
    bairro          TEXT,
    cidade          TEXT,
    uf              TEXT,
    cep             TEXT,
    latitude        REAL,
    longitude       REAL,
    whatsapp        TEXT,
    telefone        TEXT,
    email           TEXT,
    farmaceutico    TEXT,
    crf             TEXT,
    /* O rótulo vem junto com o nome, e não fixo no site, porque "Dr." ou
       "Dra." e "Farmacêutico" ou "Farmacêutica" é informação sobre uma
       pessoa de verdade. Deduzir isso do primeiro nome acerta na média e
       erra com quem está na ponta errada da média — e o erro fica
       impresso no rodapé de todas as páginas, com o CRF ao lado. Quem
       cadastra a loja escreve como a pessoa se identifica. */
    rotulo_responsavel TEXT NOT NULL DEFAULT 'Farmacêutico(a) responsável',
    autorizacao     TEXT,
    licenca_ms      TEXT,
    raio_entrega_km REAL    NOT NULL DEFAULT 8,
    frete_gratis_acima REAL NOT NULL DEFAULT 0,
    fuso            TEXT    NOT NULL DEFAULT 'America/Sao_Paulo',
    ativo           INTEGER NOT NULL DEFAULT 1,
    criado_em       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/* Horário em linhas, uma por dia da semana, e não numa coluna de texto.

   Dia 0 é domingo, como no getDay() do JavaScript — é o site que lê
   isto, e converter de um lado para o outro é onde nasce o erro de
   "fechado no domingo" aparecer no sábado.

   Em linhas porque farmácia de rede não tem o mesmo horário em todas as
   unidades: a do shopping abre às 10h e a do bairro às 7h. E porque
   uma loja pode fechar para almoço, que é o segundo registro do mesmo
   dia — por isso a chave primária inclui o horário de abertura, e não
   só o dia. */
CREATE TABLE IF NOT EXISTS lojas_horario (
    slug  TEXT NOT NULL,
    dia   INTEGER NOT NULL,
    abre  TEXT NOT NULL,
    fecha TEXT NOT NULL,
    PRIMARY KEY (slug, dia, abre)
);

/* A Drogaria Mais Barato, que é a loja que já existe.

   Todo valor aqui foi copiado do que está no ar hoje: o rodapé do site
   (endereço, CNPJ, CRF, autorização, licença), as constantes do
   script.js (WhatsApp, coordenadas, raio de 8 km, frete grátis
   desligado) e o indicador de Aberto/Fechado (os horários). Nada foi
   inventado nem arredondado — se divergir do site, é erro meu, e o
   teste-loja.mjs acusa. */
INSERT OR IGNORE INTO lojas (
    slug, nome, razao_social, cnpj,
    logradouro, numero, complemento, bairro, cidade, uf, cep,
    latitude, longitude,
    whatsapp, telefone,
    farmaceutico, crf, rotulo_responsavel, autorizacao, licenca_ms,
    raio_entrega_km, frete_gratis_acima, ativo
) VALUES (
    'mais-barato',
    'Drogaria Mais Barato',
    'Drogaria Mais Barato',
    '37.925.108/0001-03',
    'Rua Almeida Leme', '07', 'Loja 1', 'Parque São Bernardo',
    'São Bernardo do Campo', 'SP', '09761-170',
    -23.7092450, -46.5251954,
    '5511925190101', '+5511925190101',
    'Dra. Laís Carvalho da Silva', '122886', 'Farmacêutica responsável',
    'Processo 25351.507967/2022-82', 'MS 7.89888-2',
    8, 0, 1
);

INSERT OR IGNORE INTO lojas_horario (slug, dia, abre, fecha) VALUES
    ('mais-barato', 0, '08:00', '19:30'),
    ('mais-barato', 1, '07:00', '21:30'),
    ('mais-barato', 2, '07:00', '21:30'),
    ('mais-barato', 3, '07:00', '21:30'),
    ('mais-barato', 4, '07:00', '21:30'),
    ('mais-barato', 5, '07:00', '21:30'),
    ('mais-barato', 6, '07:00', '21:30');
