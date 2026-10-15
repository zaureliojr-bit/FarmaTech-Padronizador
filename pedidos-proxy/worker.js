// Histórico de pedidos (Cloudflare Worker + D1)
//
// O pedido do site ia só para uma planilha, com todos os itens numa
// célula de texto. Servia para ler um pedido, não para somar: nenhum
// relatório de "produtos mais vendidos" sai de uma string.
//
// Aqui cada item vira uma linha, e o painel da loja lê disto.
//
// Bindings necessários (Configurações -> Bindings, no painel):
//   D1 database -> nome da variável: DB (rode schema.sql nela antes)
// Secret necessário (Configurações -> Variáveis e Secrets):
//   PAINEL_KEY  -> senha inventada; só quem tem ela lê os relatórios
//
// Sobre gravar pedido: NÃO tem chave, e é de propósito. Quem grava é o
// site, que é público — qualquer chave colocada ali estaria visível no
// código-fonte da página, protegendo nada. No lugar disso o worker
// valida o formato com rigor e limita tamanho. É a mesma exposição que
// a planilha já tinha; a diferença é que aqui o dado chega limpo.

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    /* TODO cabeçalho que o worker LÊ precisa estar aqui. O navegador
       manda um OPTIONS antes da requisição de verdade, e um cabeçalho
       fora desta lista faz o preflight falhar — a chamada nem sai, e o
       erro que aparece é "Failed to fetch", que não diz uma palavra
       sobre CORS.

       Foi o que aconteceu com o X-Painel-Loja: o painel passou a mandar
       a filial em toda chamada, e tudo depois do login parou. Os testes
       não pegaram porque o de navegador intercepta as requisições (e
       interceptação não faz preflight) e o de worker chama o handler
       direto. O teste-duas-lojas.mjs agora confere esta lista contra os
       cabeçalhos que o worker lê, lendo o próprio arquivo. */
    "Access-Control-Allow-Headers": "Content-Type, X-Painel-Key, X-Painel-Loja",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Max-Age": "86400"
};

const MAX_ITENS = 100;          // carrinho de farmácia não passa disso
const MAX_TEXTO = 200;          // nome, endereço, descrição de item
const MAX_DIAS_RELATORIO = 366;
const MAX_TERMO = 60;           // ninguém busca remédio com mais que isso

function json(dados, status = 200, extras = {}) {

    return new Response(JSON.stringify(dados), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extras }
    });

}

function texto(valor, limite = MAX_TEXTO) {

    return String(valor ?? "").trim().slice(0, limite);

}

function numero(valor) {

    const n = Number(valor);

    return Number.isFinite(n) && n >= 0 ? n : 0;

}

/* Só dígitos, para o telefone virar identidade estável do cliente:
   quem digita "(11) 98765-4321" hoje e "11987654321" amanhã é a mesma
   pessoa, e sem isto viraria dois cadastros. */
function soDigitos(valor) {

    return String(valor ?? "").replace(/\D/g, "").slice(0, 15);

}

function senhaConfere(request, env) {

    return !!env.PAINEL_KEY && request.headers.get("X-Painel-Key") === env.PAINEL_KEY;

}

/* ===================== ISOLAMENTO POR LOJA =====================

   Fase 3. Três perguntas, nesta ordem, e nenhuma delas aceita resposta
   vinda de parâmetro depois de autenticar:

     quem está entrando?   o slug, junto com a senha, no login
     a senha é dela?       hash com sal próprio, na tabela lojas_acesso
     onde ficam os dados?  o binding de D1 que a linha dela indica

   A terceira é a que resolve o problema que não dá erro. Uma consulta
   que esquece o WHERE devolve o dado de todas as lojas e parece certa —
   nunca falha, nunca aparece em teste com uma loja só, e o estrago é
   mostrar a fila de pedidos de uma farmácia para a concorrente. Com um
   banco por loja, o dado da farmácia A não está ao alcance do código que
   atende a B: não por disciplina de quem escreve a consulta, mas porque
   a conexão é outra.
*/

/* O banco daquela farmácia.

   `banco` vazio quer dizer "o banco que o worker já usa". Isso é certo
   para UMA farmácia só: a que existia antes da plataforma, e que por
   isso tem os dados dela ali. É o que permitiu esta fase subir sem mover
   um byte.

   Para qualquer outra, banco vazio é o vazamento inteiro de volta: a
   loja nova gravaria pedido dentro do banco da primeira, e o painel dela
   mostraria a fila da primeira — com 200 em tudo, sem erro nenhum. E é o
   erro mais fácil de cometer cadastrando filial na mão: basta esquecer
   uma coluna do INSERT.

   Então só a farmácia original tem direito ao banco vazio. Quem decide
   qual é ela não é uma constante escrita aqui: é a consulta que
   identifica a loja, que traz junto o slug da mais antiga ativa.

   Com `banco` preenchido, o binding TEM de existir. Cair no env.DB
   quando o binding falta seria o mesmo estrago por outro caminho. */
function bancoDaLoja(env, loja) {

    const nome = (loja && loja.banco) || "";

    if (!nome) {
        /* `primeira` vem da consulta de identificação. Quando ela não
           vem — instalação sem cadastro de lojas, com a loja anônima —,
           não há segunda farmácia para vazar, e o banco de sempre é a
           resposta certa. */
        const primeira = loja && loja.primeira;
        const souEu = !loja || !loja.slug || !primeira || loja.slug === primeira;

        if (!souEu) {
            const erro = new Error(
                `a loja "${loja.slug}" não tem banco de dados próprio cadastrado. ` +
                `Crie um banco D1 para ela, ligue o binding no worker e grave o nome ` +
                `dele na coluna "banco" da tabela lojas_acesso.`
            );
            erro.configuracao = true;
            throw erro;
        }

        return env.DB;
    }

    const db = env[nome];

    if (!db) {
        const erro = new Error(`a loja "${loja.slug}" aponta para o banco ${nome}, que não está ligado a este worker`);
        erro.configuracao = true;
        throw erro;
    }

    return db;

}

/* O prefixo dos arquivos daquela farmácia no R2.

   O balde é um só e a chave é texto plano — R2 não tem pasta. Sem
   prefixo, os arquivos de todas as lojas ficam no mesmo monte, e
   "exportar os arquivos desta farmácia" ou "apagar tudo da que saiu da
   plataforma" vira varredura do banco em vez de um comando.

   Vazio para a loja que já existia: os arquivos dela estão em
   banner/... e encarte/... e endereço publicado não se quebra. */
function prefixoDaLoja(loja) {

    const bruto = String((loja && loja.prefixo_r2) || "")
        .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);

    return bruto ? bruto + "/" : "";

}

/* A chave pertence ao espaço desta farmácia?

   Segunda parede na hora de apagar. A primeira — e a que realmente
   isola — é o banco separado: a chave que o handler vai apagar foi lida
   da tabela `banners` ou `encarte_paginas` DA PRÓPRIA loja, então não há
   como chegar nela a chave de outra. Esta confere mesmo assim, porque o
   estrago de um apagar errado é permanente e a conferência custa uma
   comparação de texto.

   Não vale para LEITURA, e isso é de propósito: banner e encarte são
   imagens da vitrine, públicas por definição — qualquer um as vê abrindo
   a loja. Exigir prova de dono para servi-las quebraria todo endereço já
   publicado sem proteger nada. */
function chaveEhDaLoja(loja, chave) {

    const texto = String(chave || "");
    const prefixo = prefixoDaLoja(loja);

    if (prefixo) return texto.startsWith(prefixo);

    /* Sem prefixo é a loja de sempre: a chave tem de ser uma das pastas
       conhecidas, direto na raiz do balde. Com isso ela não alcança o
       que está debaixo do prefixo de ninguém. */
    return PASTAS.some((pasta) => texto.startsWith(pasta + "/"));

}

/* SHA-256 de (sal + senha), em hexa.

   O Workers tem Web Crypto nativo, então não entra dependência. Não é
   bcrypt: o que protege aqui é o limite de cinco tentativas por IP, já
   no ar. Hash lento serviria contra quem baixasse o banco — e quem baixa
   o banco já tem acesso ao D1, onde a senha é o menor problema. */
async function hashDeSenha(senha, sal) {

    const bytes = new TextEncoder().encode(String(sal) + String(senha));
    const digerido = await crypto.subtle.digest("SHA-256", bytes);

    return [...new Uint8Array(digerido)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

}

/* Comparação em tempo constante.

   Com "===", o tempo da comparação conta quantos caracteres do hash
   bateram antes de parar. É pouco, e por cima de uma rede é quase
   impossível de medir — mas custa quatro linhas, e o limite de
   tentativas por IP justamente permite ao atacante repetir a medição
   devagar e com paciência, que é o cenário em que isso deixa de ser
   teórico. */
function mesmoTexto(a, b) {

    const x = String(a || "");
    const y = String(b || "");

    if (x.length !== y.length) return false;

    let diferenca = 0;
    for (let i = 0; i < x.length; i++) diferenca |= x.charCodeAt(i) ^ y.charCodeAt(i);

    return diferenca === 0;

}

function salNovo() {

    return [...crypto.getRandomValues(new Uint8Array(16))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

}

/* Qual loja está pedindo.

   Vem do cabeçalho X-Painel-Loja, posto pelo painel a partir do próprio
   endereço (/painel/<slug>). Sem cabeçalho, é a loja mais antiga ativa —
   o que mantém o painel de hoje funcionando sem nenhuma mudança.

   Vir de cabeçalho não é o mesmo que "a loja vem de parâmetro", que é o
   que o desenho proíbe. O slug aqui é PARTE da autenticação: o hash
   conferido é o daquele slug. Quem mandar o slug da farmácia B com a
   senha da A não passa, porque a senha da A não bate com o hash da B. O
   que o desenho proíbe é outra coisa — um handler JÁ autenticado aceitar
   "?loja=" e ler o dado de outra. Esses não aceitam: recebem a loja como
   argumento obrigatório, vinda daqui. */
async function lojaDeQuemPede(request, env) {

    const pedido = String(request.headers.get("X-Painel-Loja") || "")
        .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);

    /* `primeira` é o slug da farmácia mais antiga ativa — a que existia
       antes da plataforma. É ela, e só ela, que pode usar o banco
       principal sem ter um próprio cadastrado. Vem na mesma consulta
       para não custar uma segunda ida ao D1 em cada requisição. */
    const colunas = `l.slug, l.nome, a.hash, a.sal, a.banco, a.prefixo_r2,
                     (SELECT slug FROM lojas WHERE ativo = 1 ORDER BY criado_em LIMIT 1) AS primeira`;

    const sql = pedido
        ? `SELECT ${colunas}
             FROM lojas l LEFT JOIN lojas_acesso a ON a.slug = l.slug
            WHERE l.slug = ?1 AND l.ativo = 1`
        : `SELECT ${colunas}
             FROM lojas l LEFT JOIN lojas_acesso a ON a.slug = l.slug
            WHERE l.ativo = 1 ORDER BY l.criado_em LIMIT 1`;

    let loja = null;

    try {
        const consulta = env.DB.prepare(sql);
        loja = await (pedido ? consulta.bind(pedido) : consulta).first();
    } catch (erro) {
        /* Cadastro de lojas fora do ar, ou tabela ainda não criada. */
        console.error("lojaDeQuemPede:", erro);
    }

    if (loja) return loja;

    /* Ninguém pediu loja e não há cadastro: é a instalação de uma loja
       só, como era antes da Fase 2. Devolve a loja anônima, que usa o
       banco de sempre e a PAINEL_KEY de sempre.

       Isto é tolerância na IDENTIFICAÇÃO, não na autenticação: a senha
       continua sendo conferida logo abaixo, e sem ela não passa. E não
       vaza dado entre lojas porque, nesse estado, não existe segunda
       loja para vazar.

       Existe porque o portão passou a depender do cadastro. Sem esta
       saída, um problema na tabela `lojas` — ou publicar o worker antes
       de rodar o schema — tranca a farmácia fora do próprio painel no
       meio do expediente, que é um estrago maior do que o que a Fase 3
       veio evitar.

       Com slug pedido, nada disso vale: quem nomeia uma loja que não
       existe leva 401. */
    if (pedido) return null;

    return { slug: "", nome: "", hash: null, sal: null, banco: null, prefixo_r2: null, primeira: "" };

}

/* A loja de uma rota PÚBLICA.

   Aqui a loja vem mesmo de parâmetro — e pode. Rota pública não lê dado
   de ninguém: grava um pedido naquela farmácia, ou mostra o que aquela
   farmácia já publicou na vitrine (banner, promoção, encarte). Escolher
   a loja errada mostra a oferta da outra, o que é um erro de endereço,
   não um vazamento.

   O que NÃO pode é rota de painel aceitar loja por parâmetro. Essas
   recebem a loja de quem provou a senha, e é a diferença entre as duas
   famílias de rota neste arquivo.

   Sem ?loja=, a mais antiga ativa — que é o que mantém o site de hoje
   funcionando sem mudar uma linha. */
async function lojaPublicaDaURL(request, env) {

    const pedido = String(new URL(request.url).searchParams.get("loja") || "")
        .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);

    const colunas = `l.slug, l.nome, a.banco,
                     (SELECT slug FROM lojas WHERE ativo = 1 ORDER BY criado_em LIMIT 1) AS primeira`;

    const sql = pedido
        ? `SELECT ${colunas}
             FROM lojas l LEFT JOIN lojas_acesso a ON a.slug = l.slug
            WHERE l.slug = ?1 AND l.ativo = 1`
        : `SELECT ${colunas}
             FROM lojas l LEFT JOIN lojas_acesso a ON a.slug = l.slug
            WHERE l.ativo = 1 ORDER BY l.criado_em LIMIT 1`;

    let loja = null;

    try {
        const consulta = env.DB.prepare(sql);
        loja = await (pedido ? consulta.bind(pedido) : consulta).first();
    } catch (erro) {
        console.error("lojaPublicaDaURL:", erro);
    }

    /* Mesma tolerância do portão, e pelo mesmo motivo: sem ?loja= e sem
       cadastro, é a instalação de uma loja só, e a vitrine tem de
       continuar mostrando banner e promoção. Um 404 aqui apagaria as
       ofertas da home por causa de um problema de cadastro.

       Com ?loja= nomeando loja que não existe, 404 — aí é endereço
       errado, e fingir que é outra loja seria pior. */
    if (!loja) {
        if (pedido) return { recusa: json({ erro: "Loja não encontrada." }, 404) };
        return { loja: { slug: "", nome: "", banco: null, primeira: "" }, db: env.DB };
    }

    try {
        return { loja, db: bancoDaLoja(env, loja) };
    } catch (erro) {
        console.error("bancoDaLoja:", erro);
        return { recusa: json({ erro: erro.message }, 503) };
    }

}

/* A chave do DONO DA PLATAFORMA.

   Quem administra a plataforma precisa entrar em qualquer farmácia:
   para cadastrar a senha da loja nova, para dar suporte quando a dona
   liga dizendo que o encarte sumiu, para conferir se a importação do
   catálogo rodou. Sem isso, cada atendimento viraria "me passa sua
   senha", que é a pior coisa que se pode ensinar um cliente a fazer.

   É uma chave separada da PAINEL_KEY de propósito. A PAINEL_KEY é a
   senha de uma LOJA — hoje a da Drogaria Mais Barato. Se ela também
   abrisse as outras, a dona da primeira farmácia entraria no painel das
   concorrentes da rede, e ninguém teria decidido isso.

   Enquanto DONO_KEY não estiver configurada, nada muda: ninguém é dono,
   e cada senha abre só a sua loja.

   O que ela NÃO faz: aparecer em resposta, em log ou na tela. Ela é um
   secret do worker, como as chaves do catálogo. */
function ehDono(request, env) {

    const digitada = request.headers.get("X-Painel-Key") || "";

    return !!env.DONO_KEY && mesmoTexto(digitada, env.DONO_KEY);

}

/* A senha confere para ESTA loja?

   Três formas, e a ordem importa:

     1. é a chave do dono        -> abre qualquer farmácia
     2. a loja tem hash próprio  -> compara com o hash dela, e só com ele
     3. a loja não tem hash      -> vale a PAINEL_KEY do worker

   A terceira é a ponte: a farmácia que já existe continua entrando com a
   senha de sempre enquanto ninguém cadastrar a dela. Assim que cadastrar,
   a PAINEL_KEY deixa de valer PARA ELA — e é isso que impede que a chave
   de uma loja vire chave-mestra da rede inteira. Quem tem esse poder é a
   DONO_KEY, que é explícita e de quem administra a plataforma. */
async function senhaDaLojaConfere(request, env, loja) {

    if (ehDono(request, env)) return true;

    const digitada = request.headers.get("X-Painel-Key") || "";

    if (loja && loja.hash && loja.sal) {
        return mesmoTexto(await hashDeSenha(digitada, loja.sal), loja.hash);
    }

    return senhaConfere(request, env);

}

/* ===================== LIMITE DE TENTATIVAS =====================

   A PAINEL_KEY é uma senha curta digitada por gente, e gente escolhe
   senha curta. Oito dígitos são cem milhões de combinações: sem limite,
   uma máquina varre isso em algumas dezenas de horas — e quem entra
   muda preço, publica banner e importa catálogo.

   Com o limite, deixa de ser questão de tempo. Cinco erros e o IP para;
   cada rodada seguinte de erros dobra a espera. Vale para qualquer
   senha, inclusive as próximas.

   O bloqueio é verificado ANTES de comparar a senha, de propósito. Se
   fosse depois, o atacante bloqueado continuaria tendo suas tentativas
   avaliadas e um acerto no meio do bloqueio entraria.
*/

const ERROS_ATE_BLOQUEAR = 5;
const BLOQUEIO_BASE_MS = 60 * 1000;         // 1 minuto no primeiro bloqueio
const BLOQUEIO_MAXIMO_MS = 60 * 60 * 1000;  // e nunca mais que uma hora
const ESQUECER_ERROS_MS = 30 * 60 * 1000;   // meia hora sem errar zera a conta
const LINHA_VELHA_MS = 24 * 60 * 60 * 1000; // linha sem uso há um dia é lixo

function ipDeQuemChama(request) {

    // Na Cloudflare o CF-Connecting-IP é posto pela borda e não pode ser
    // forjado pelo cliente. Os outros são para quando este worker rodar
    // atrás de outra coisa em teste.
    return request.headers.get("CF-Connecting-IP")
        || request.headers.get("X-Forwarded-For")?.split(",")[0].trim()
        || "";

}

async function lerTentativas(env, ip) {

    if (!ip) return null;

    return await env.DB.prepare(
        `SELECT erros, ultimo, bloqueado_ate FROM tentativas_painel WHERE ip = ?1`
    ).bind(ip).first().catch(() => null);

}

/* Quanto falta do bloqueio, em ms. Zero quer dizer "pode tentar". */
function quantoFaltaDoBloqueio(linha) {

    if (!linha) return 0;

    const agora = Date.now();

    return linha.bloqueado_ate > agora ? linha.bloqueado_ate - agora : 0;

}

async function registrarErro(env, ip, linha) {

    if (!ip) return;

    const agora = Date.now();

    /* Meia hora sem errar e a conta zera. Sem isso, quem usa o painel
       todo dia acumularia um erro de digitação por semana e um dia seria
       bloqueado por nada. */
    const recentes = linha && (agora - linha.ultimo) < ESQUECER_ERROS_MS ? linha.erros : 0;
    const erros = recentes + 1;

    let bloqueadoAte = 0;

    if (erros >= ERROS_ATE_BLOQUEAR) {
        const rodada = erros - ERROS_ATE_BLOQUEAR;
        bloqueadoAte = agora + Math.min(BLOQUEIO_BASE_MS * Math.pow(2, rodada), BLOQUEIO_MAXIMO_MS);
    }

    await env.DB.prepare(
        `INSERT INTO tentativas_painel (ip, erros, ultimo, bloqueado_ate)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(ip) DO UPDATE SET
            erros = excluded.erros, ultimo = excluded.ultimo,
            bloqueado_ate = excluded.bloqueado_ate`
    ).bind(ip, erros, agora, bloqueadoAte).run().catch(() => {});

}

/* Varre as linhas velhas de vez em quando.
   Uma linha só se apaga quando alguém DAQUELE ip acerta a senha, e quem
   ataca nunca acerta — então sem isto a tabela só cresce.

   Chamada nas recusas, e não no acerto, por dois motivos: o painel bate
   em rota protegida a cada 30 segundos e não precisa pagar por isso; e
   durante um ataque as recusas é que são muitas, que é exatamente
   quando há o que varrer. */
async function varrerDeVezEmQuando(env) {

    if (Math.random() >= 0.05) return;   // uma em vinte recusas

    await env.DB.prepare(`DELETE FROM tentativas_painel WHERE ultimo < ?1`)
        .bind(Date.now() - LINHA_VELHA_MS).run().catch(() => {});

}

async function limparTentativas(env, ip) {

    if (!ip) return;

    await env.DB.prepare(`DELETE FROM tentativas_painel WHERE ip = ?1`)
        .bind(ip).run().catch(() => {});

}

/* ================= LIMITE DAS ROTAS PÚBLICAS =================

   /pedidos e /busca são abertas de propósito: quem chama é o site, sem
   senha nenhuma. Só que "aberta" sem limite quer dizer que qualquer um
   enfia mil pedidos falsos na fila da loja — o alarme do painel toca a
   noite toda, o relatório vira lixo e o balcão não sabe mais o que é
   venda de verdade.

   O limite aqui é FOLGADO, e tem que ser. No Brasil muita gente navega
   atrás do mesmo IP de operadora, então um teto apertado barraria
   cliente de verdade. Vinte pedidos por hora do mesmo IP é muito acima
   do normal para uma farmácia de bairro, e ainda assim corta o abuso.

   Recusar um pedido NÃO perde a venda: o site manda o pedido para cá
   com "dispara e esquece" e abre o WhatsApp de qualquer jeito, que é o
   canal que fecha a compra. O que se perde é a linha no painel — ruim,
   mas não é a venda.

   Janela fixa de uma hora, e não janela deslizante: é uma leitura e uma
   escrita por chamada, contra as várias que uma deslizante exigiria. E
   quem estourou não gera escrita nenhuma, então um ataque custa menos
   banco que custa hoje, não mais.
*/

const JANELA_PUBLICA_MS = 60 * 60 * 1000;
const LIMITE_PEDIDOS_HORA = 20;    // cliente de verdade faz 1 ou 2
const LIMITE_BUSCAS_HORA = 120;    // a busca é deduplicada por visita no site

/* Devolve 0 quando pode passar, ou os segundos que faltam da janela. */
async function faltaParaLiberar(env, request, rotulo, teto) {

    const ip = ipDeQuemChama(request);

    // sem IP não há como contar, e barrar todo mundo seria pior
    if (!ip) return 0;

    const chave = ip + "|" + rotulo;
    const agora = Date.now();

    const linha = await env.DB.prepare(
        `SELECT contagem, janela FROM limite_publico WHERE chave = ?1`
    ).bind(chave).first().catch(() => null);

    const naJanela = linha && (agora - linha.janela) < JANELA_PUBLICA_MS;
    const contagem = naJanela ? linha.contagem : 0;
    const inicio = naJanela ? linha.janela : agora;

    if (contagem >= teto) {
        /* Estourou: devolve sem gravar. A janela não se estende, então a
           liberação acontece uma hora depois do PRIMEIRO acesso, e não
           uma hora depois da última tentativa — insistir não castiga. */
        return Math.max(1, Math.ceil((inicio + JANELA_PUBLICA_MS - agora) / 1000));
    }

    await env.DB.prepare(
        `INSERT INTO limite_publico (chave, contagem, janela) VALUES (?1, ?2, ?3)
         ON CONFLICT(chave) DO UPDATE SET
            contagem = excluded.contagem, janela = excluded.janela`
    ).bind(chave, contagem + 1, inicio).run().catch(() => {});

    return 0;

}

/* Mesma ideia da varredura das tentativas: janela vencida é linha morta,
   e sem limpeza a tabela guardaria um IP de visitante para sempre. */
async function varrerLimitePublico(env) {

    if (Math.random() >= 0.02) return;

    await env.DB.prepare(`DELETE FROM limite_publico WHERE janela < ?1`)
        .bind(Date.now() - 2 * JANELA_PUBLICA_MS).run().catch(() => {});

}

/* Devolve null quando pode passar, ou a resposta de recusa. */
async function barrarRotaPublica(env, request, rotulo, teto, recado) {

    await varrerLimitePublico(env);

    const faltam = await faltaParaLiberar(env, request, rotulo, teto);

    if (!faltam) return null;

    return json({ erro: recado }, 429, { "Retry-After": String(faltam) });

}

/* O portão.

   Devolve { loja, db } quando pode passar, ou { recusa } com a resposta.

   Antes devolvia null para "pode passar", e cada handler ia buscar o
   env.DB por conta própria. Agora quem passa recebe QUAL loja provou a
   senha e QUAL banco é o dela — e os handlers de painel passam a receber
   isso como argumento obrigatório.

   Argumento obrigatório é de propósito: um handler novo que esqueça de
   usar a loja fica visível na assinatura, e não escondido dentro de uma
   consulta que ninguém relê. */
async function barrarSeNaoPuder(request, env) {

    const ip = ipDeQuemChama(request);

    const linha = await lerTentativas(env, ip);

    const faltam = quantoFaltaDoBloqueio(linha);

    if (faltam > 0) {
        await varrerDeVezEmQuando(env);
        const segundos = Math.ceil(faltam / 1000);
        return { recusa: json({
            erro: `Tentativas demais. Tente de novo em ${Math.ceil(segundos / 60)} minuto(s).`
        }, 429, { "Retry-After": String(segundos) }) };
    }

    /* O limite de tentativas continua por IP, e só por IP. Se fosse por
       (IP, loja), quem ataca ganharia cinco tentativas novas a cada loja
       que escolhesse: com 30 farmácias, 150 tentativas em vez de 5. */
    const loja = await lojaDeQuemPede(request, env);

    if (!loja || !(await senhaDaLojaConfere(request, env, loja))) {
        await registrarErro(env, ip, linha);
        await varrerDeVezEmQuando(env);
        /* Mesma resposta para senha errada e para loja que não existe:
           respostas diferentes contariam a quem tenta quais farmácias
           estão cadastradas na plataforma. */
        return { recusa: json({ erro: "Não autorizado." }, 401) };
    }

    /* Acertou: a conta daquele IP zera. Quem erra duas vezes e acerta na
       terceira não fica com dois erros guardados para somar na próxima
       vez que se atrapalhar.

       Só apaga se houver linha: o painel bate em rota protegida a cada 30
       segundos e, sem esta guarda, seria um DELETE por chamada — escrita
       no D1 à toa, o dia inteiro, para apagar nada. */
    if (linha) await limparTentativas(env, ip);

    let db;
    try {
        db = bancoDaLoja(env, loja);
    } catch (erro) {
        /* Binding faltando é erro de instalação, não de quem está
           entrando: a loja foi cadastrada apontando para um banco que
           ninguém ligou ao worker. Diz isso, em vez de um 500 mudo. */
        console.error("bancoDaLoja:", erro);
        return { recusa: json({ erro: erro.message }, 503) };
    }

    return { loja, db, dono: ehDono(request, env) };

}

/* ============ PORTEIRO DO CATÁLOGO (imagens e publicação) ============

   O padronizador precisa escrever em dois outros workers: o
   imagens-proxy (salvar imagem e correção) e o publish-proxy
   (sobrescrever o produtos.json do site). Cada um tem a sua chave.

   Até aqui essas duas chaves iam para o navegador, porque o frontend as
   recebia em VITE_IMAGENS_KEY e VITE_PUBLISH_KEY — e o Vite embute toda
   variável VITE_ no pacote em tempo de build. Resultado: as duas
   ficavam legíveis em texto no JavaScript que qualquer um baixa. Quem
   lesse podia trocar a imagem de qualquer produto e, com a de
   publicação, reescrever o catálogo inteiro do site, preço por preço.

   Trocar as chaves não resolvia: no build seguinte elas voltavam para o
   pacote. O que resolve é o navegador nunca mais vê-las.

   Então as chaves passam a morar AQUI, como secret deste worker, e o
   navegador fala com estas rotas usando a senha do painel — a mesma que
   ele já usa para ver a fila de pedidos, já com limite de tentativas.
   Este worker é que carimba a chave de verdade e repassa.

   Só a ESCRITA passa por aqui. Ler imagem continua indo direto ao
   imagens-proxy: imagem é pública por natureza, são milhares por visita
   e fazer cada uma dar a volta por este worker seria lento e caro sem
   proteger nada.
*/

// publicar o catálogo inteiro são uns 3 MB de JSON; 25 cobre com folga
const MAX_ENCAMINHAR_BYTES = 25 * 1024 * 1024;

/* Repassa a chamada ao worker de destino, trocando a senha do painel
   (que o navegador tem) pela chave daquele worker (que ele não tem). */
async function encaminhar(request, env, { servico, destino, caminho, cabecalho, chave, metodo }) {

    if (!destino || !chave) {
        /* 501 e não 500: não é defeito, é configuração que falta. A
           mensagem diz qual, senão vira caça ao tesouro no painel. */
        return json({
            erro: "Este worker ainda não foi configurado para falar com o " +
                  "catálogo. Faltam as variáveis no painel do Cloudflare."
        }, 501);
    }

    const url = destino.replace(/\/+$/, "") + caminho;

    const opcoes = {
        method: metodo || request.method,
        headers: { [cabecalho]: chave }
    };

    if (opcoes.method !== "GET" && opcoes.method !== "HEAD") {
        const corpo = await request.arrayBuffer();

        if (corpo.byteLength > MAX_ENCAMINHAR_BYTES) {
            return json({ erro: "Conteúdo grande demais." }, 413);
        }

        opcoes.body = corpo;
        opcoes.headers["Content-Type"] =
            request.headers.get("content-type") || "application/json";
    }

    let resposta;

    try {
        /* Pelo SERVICE BINDING, e não por fetch() no endereço do outro
           worker. A Cloudflare recusa um Worker chamar outro Worker da
           mesma zona por HTTP: devolve 404 com "error code: 1042", que
           é indistinguível de rota inexistente e manda a gente procurar
           defeito no lugar errado — foi o que aconteceu aqui.

           O binding é o caminho suportado: a chamada vai direto, sem
           sair para a internet, e ainda é mais rápida. O endereço acima
           continua servindo para montar o caminho; o host é ignorado.

           O fetch() comum fica como reserva, para destino que NÃO é
           worker da mesma conta e para os testes. */
        resposta = servico
            ? await servico.fetch(new Request(url, opcoes))
            : await fetch(url, opcoes);
    } catch (erro) {
        console.error("encaminhar:", erro);
        return json({ erro: "Não consegui falar com o serviço de catálogo." }, 502);
    }

    /* Devolve o corpo em fluxo, sem ler na memória: a extração do PDV
       passa dos 2 MB e lê-la inteira aqui só para repassar seria
       desperdício. O status vem do destino, para o padronizador
       continuar vendo o erro real em vez de um 500 genérico. */
    return new Response(resposta.body, {
        status: resposta.status,
        headers: {
            "Content-Type": resposta.headers.get("content-type") || "application/json",
            "Cache-Control": "no-store",
            ...CORS_HEADERS
        }
    });

}

/* O "servico" é o binding de serviço, configurado no painel do
   Cloudflare (Bindings -> Service). Sem ele a chamada sai por HTTP e a
   Cloudflare a recusa com 1042, porque é worker chamando worker da
   mesma zona. */
const imagens = (env) => ({
    servico: env.IMAGENS_SERVICE,
    destino: env.IMAGENS_PROXY_URL,
    cabecalho: "X-Imagens-Key",
    chave: env.IMAGENS_KEY
});

const publicacao = (env) => ({
    servico: env.PUBLISH_SERVICE,
    destino: env.PUBLISH_WORKER_URL,
    cabecalho: "X-Publish-Key",
    chave: env.PUBLISH_KEY
});

/* ========================= GRAVAR ========================= */

/* Registra o que foi digitado na busca do site.

   Aberto, sem chave, pelo mesmo motivo do /pedidos: quem chama é a
   página pública, e chave no código-fonte não protege nada. A diferença
   é que aqui o estrago possível é menor — o pior caso é alguém sujar a
   estatística, não forjar um pedido.

   Guarda o termo e nada mais. Sem telefone, sem IP, sem sessão: o que
   entra aqui não volta a ser ligado a uma pessoa. */
async function tratarNovaBusca(request, env, db) {

    const corpo = await request.json().catch(() => null);

    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const termo = texto(corpo.termo, MAX_TERMO).toLowerCase();

    // 2 letras não dizem nada sobre intenção de compra e enchem a tabela
    if (termo.length < 3) return json({ erro: "Termo curto demais." }, 400);

    const resultados = Math.round(numero(corpo.resultados));

    await db.prepare(
        `INSERT INTO buscas (termo, criado_em, resultados) VALUES (?1, ?2, ?3)`
    ).bind(termo, Date.now(), resultados).run();

    return json({ ok: true });

}

async function tratarNovoPedido(request, env, db) {

    const corpo = await request.json().catch(() => null);

    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const ref = texto(corpo.ref, 40);
    const telefone = soDigitos(corpo.telefone);
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [];

    if (!ref) return json({ erro: "'ref' é obrigatório." }, 400);
    if (!telefone) return json({ erro: "'telefone' é obrigatório." }, 400);
    if (!itens.length) return json({ erro: "Pedido sem itens." }, 400);
    if (itens.length > MAX_ITENS) return json({ erro: "Itens demais." }, 400);

    const criadoEm = Date.now();
    const cliente = texto(corpo.cliente) || "(sem nome)";
    const endereco = texto(corpo.endereco, 300);
    const total = numero(corpo.total);

    // Itens normalizados aqui, e não confiando no que chegou: o total de
    // cada linha é recalculado, para o relatório não herdar conta errada.
    const linhas = itens.map((item) => {
        const qtd = Math.max(1, Math.round(numero(item.qtd) || 1));
        const preco = numero(item.preco);
        return {
            ean: texto(item.ean, 20),
            codigo: texto(item.codigo, 40),
            descricao: texto(item.descricao) || "(sem descrição)",
            qtd,
            preco,
            totalItem: Number((qtd * preco).toFixed(2))
        };
    });

    // Se este número já existe, pode ser duas coisas muito diferentes:
    // o mesmo cliente reenviando (rede oscilou, clicou duas vezes), que é
    // inofensivo, ou uma colisão de número entre pedidos de pessoas
    // diferentes. No segundo caso, seguir em frente apagaria os itens de
    // um pedido e colocaria os do outro por cima, deixando um registro
    // que não é nem um nem outro. É raro, mas silencioso — então recusa.
    const jaExiste = await db.prepare(
        `SELECT telefone FROM pedidos WHERE ref = ?1`
    ).bind(ref).first();

    if (jaExiste && jaExiste.telefone !== telefone) {
        return json({
            erro: "Já existe outro pedido com este número.",
            ref
        }, 409);
    }

    const comandos = [

        db.prepare(
            `INSERT INTO pedidos
                (ref, criado_em, cliente, telefone, entrega, endereco,
                 pagamento, subtotal, frete, total, tem_receita, status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'novo')
             ON CONFLICT(ref) DO NOTHING`
        ).bind(
            ref, criadoEm, cliente, telefone,
            texto(corpo.entrega, 20) || "Retirada",
            endereco,
            texto(corpo.pagamento, 40),
            numero(corpo.subtotal),
            numero(corpo.frete),
            total,
            corpo.temReceita ? 1 : 0
        ),

        // Se o mesmo ref chegar duas vezes (cliente clicou de novo, rede
        // instável), o INSERT do pedido não faz nada — mas os itens
        // entrariam duplicados. Limpar antes deixa a operação repetível.
        db.prepare(`DELETE FROM pedido_itens WHERE ref = ?1`).bind(ref)

    ];

    linhas.forEach((l) => {
        comandos.push(
            db.prepare(
                `INSERT INTO pedido_itens
                    (ref, ean, codigo, descricao, qtd, preco_unit, total_item)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)`
            ).bind(ref, l.ean, l.codigo, l.descricao, l.qtd, l.preco, l.totalItem)
        );
    });

    comandos.push(
        db.prepare(
            `INSERT INTO clientes
                (telefone, nome, ultimo_endereco, primeiro_pedido, ultimo_pedido, pedidos, total_gasto)
             VALUES (?1,?2,?3,?4,?4,1,?5)
             ON CONFLICT(telefone) DO UPDATE SET
                nome = excluded.nome,
                ultimo_endereco = COALESCE(NULLIF(excluded.ultimo_endereco,''), clientes.ultimo_endereco),
                ultimo_pedido = excluded.ultimo_pedido,
                pedidos = clientes.pedidos + 1,
                total_gasto = clientes.total_gasto + excluded.total_gasto`
        ).bind(telefone, cliente, endereco, criadoEm, total)
    );

    // batch roda tudo numa transação: ou o pedido inteiro entra, ou nada
    await db.batch(comandos);

    return json({ sucesso: true, ref, itens: linhas.length });

}

/* ========================= LER ========================= */

function janela(url) {

    const dias = Math.min(
        Math.max(parseInt(url.searchParams.get("dias") || "30", 10) || 30, 1),
        MAX_DIAS_RELATORIO
    );

    return { dias, desde: Date.now() - dias * 86400000 };

}

async function tratarResumo(request, env, loja, db) {

    const url = new URL(request.url);
    const { dias, desde } = janela(url);

    // "Hoje" é o dia em São Paulo, não em UTC — um pedido das 22h de SP
    // já é o dia seguinte em UTC e sairia da conta do dia.
    const agoraSP = new Date(Date.now() - 3 * 3600000);
    const inicioDoDiaSP = Date.UTC(
        agoraSP.getUTCFullYear(), agoraSP.getUTCMonth(), agoraSP.getUTCDate()
    ) + 3 * 3600000;

    const [hoje, periodo, porDia, topProdutos, recentes, aguardando,
           maisProcurados, naoEncontrados] = await db.batch([

        db.prepare(
            `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento
               FROM pedidos WHERE criado_em >= ?1`
        ).bind(inicioDoDiaSP),

        db.prepare(
            `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento,
                    COALESCE(AVG(total),0) AS ticket
               FROM pedidos WHERE criado_em >= ?1`
        ).bind(desde),

        db.prepare(
            `SELECT date((criado_em - 10800000)/1000, 'unixepoch') AS dia,
                    COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento
               FROM pedidos WHERE criado_em >= ?1
              GROUP BY dia ORDER BY dia`
        ).bind(desde),

        db.prepare(
            `SELECT i.descricao, i.ean,
                    SUM(i.qtd) AS unidades,
                    SUM(i.total_item) AS faturamento
               FROM pedido_itens i
               JOIN pedidos p ON p.ref = i.ref
              WHERE p.criado_em >= ?1
              GROUP BY COALESCE(NULLIF(i.ean,''), i.descricao)
              ORDER BY unidades DESC
              LIMIT 20`
        ).bind(desde),

        db.prepare(
            `SELECT ref, criado_em, cliente, telefone, entrega, pagamento,
                    total, tem_receita, status
               FROM pedidos ORDER BY criado_em DESC LIMIT 30`
        ),

        db.prepare(
            `SELECT COUNT(*) AS n FROM pedidos
              WHERE tem_receita = 1 AND status = 'novo'`
        ),

        // o que mais procuram, com quantas dessas vezes não acharam nada
        db.prepare(
            `SELECT termo,
                    COUNT(*) AS buscas,
                    SUM(CASE WHEN resultados = 0 THEN 1 ELSE 0 END) AS vazias
               FROM buscas WHERE criado_em >= ?1
              GROUP BY termo ORDER BY buscas DESC, termo
              LIMIT 20`
        ).bind(desde),

        // procuraram e o site não tinha: cada linha é uma venda perdida
        db.prepare(
            `SELECT termo, COUNT(*) AS buscas, MAX(criado_em) AS ultima
               FROM buscas
              WHERE criado_em >= ?1 AND resultados = 0
              GROUP BY termo ORDER BY buscas DESC, ultima DESC
              LIMIT 20`
        ).bind(desde)

    ]);

    return json({
        dias,
        hoje: hoje.results[0] || { pedidos: 0, faturamento: 0 },
        periodo: periodo.results[0] || { pedidos: 0, faturamento: 0, ticket: 0 },
        porDia: porDia.results || [],
        topProdutos: topProdutos.results || [],
        recentes: recentes.results || [],
        aguardandoReceita: (aguardando.results[0] || {}).n || 0,
        maisProcurados: maisProcurados.results || [],
        naoEncontrados: naoEncontrados.results || []
    });

}

async function tratarClientes(request, env, loja, db) {

    const url = new URL(request.url);
    const limite = Math.min(parseInt(url.searchParams.get("limite") || "100", 10) || 100, 500);

    const { results } = await db.prepare(
        `SELECT telefone, nome, ultimo_endereco, primeiro_pedido,
                ultimo_pedido, pedidos, total_gasto
           FROM clientes ORDER BY ultimo_pedido DESC LIMIT ?1`
    ).bind(limite).all();

    return json({ clientes: results || [] });

}

async function tratarPedido(request, env, loja, db, ref) {

    const [pedido, itens] = await db.batch([
        db.prepare(`SELECT * FROM pedidos WHERE ref = ?1`).bind(ref),
        db.prepare(
            `SELECT ean, codigo, descricao, qtd, preco_unit, total_item
               FROM pedido_itens WHERE ref = ?1 ORDER BY id`
        ).bind(ref)
    ]);

    if (!pedido.results.length) return json({ erro: "Pedido não encontrado." }, 404);

    return json({ pedido: pedido.results[0], itens: itens.results || [] });

}

/* A fila de trabalho do balcão: os pedidos que ainda não terminaram,
   já com os itens de cada um.

   Existe separada do /resumo porque as duas perguntas são diferentes. O
   resumo responde "como foi o mês" e é consultado quando alguém abre o
   relatório; a fila responde "o que tem para fazer agora" e é consultada
   a cada meio minuto, o dia inteiro. Misturar as duas faria o balcão
   recalcular faturamento e ranking de produtos 2.880 vezes por dia à toa.

   Os itens vêm na mesma resposta, e não um pedido por vez: separar dez
   pedidos custaria onze idas ao servidor em vez de uma. */
async function tratarFila(request, env, loja, db) {

    const ABERTOS = ["novo", "separando", "receita-ok"];

    const pedidos = await db.prepare(
        `SELECT ref, criado_em, cliente, telefone, entrega, endereco,
                pagamento, subtotal, frete, total, tem_receita, status
           FROM pedidos
          WHERE status IN ('novo','separando','receita-ok')
          ORDER BY criado_em ASC
          LIMIT 60`
    ).all();

    const lista = pedidos.results || [];

    if (!lista.length) return json({ pedidos: [], abertos: ABERTOS });

    /* Um IN com as refs desta página, em vez de um JOIN com a tabela
       inteira: são no máximo 60 pedidos, e assim o índice de pedido_itens
       faz todo o trabalho. */
    const refs = lista.map(p => p.ref);
    const marcadores = refs.map((_, i) => `?${i + 1}`).join(",");

    const itens = await db.prepare(
        `SELECT ref, ean, codigo, descricao, qtd, preco_unit, total_item
           FROM pedido_itens
          WHERE ref IN (${marcadores})
          ORDER BY id`
    ).bind(...refs).all();

    const porRef = new Map(refs.map(r => [r, []]));
    for (const item of (itens.results || [])) {
        porRef.get(item.ref)?.push(item);
    }

    return json({
        pedidos: lista.map(p => ({ ...p, itens: porRef.get(p.ref) || [] })),
        abertos: ABERTOS
    });

}

/* ========================= BANNERS =========================

   A home tinha os banners num JSON do repositório, editado à mão no
   GitHub. Funcionava, mas só para quem sabe o que é um repositório —
   e uma vírgula fora do lugar derrubava a faixa inteira sem aviso.
   Aqui a loja mexe pelo painel, com formulário e conferência.

   O arquivo da imagem, quando enviado pelo painel, vai para o R2. A
   tabela guarda só o endereço: linha de banco com imagem dentro fica
   lenta de ler e cara de servir a cada visita da home.
*/

const MAX_BANNER_BYTES = 3 * 1024 * 1024;   // 3 MB: banner é peça larga e leve
const TIPOS_DE_IMAGEM = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/* aaaa-mm-dd, e só. Data mal formada vira vazio em vez de derrubar a
   comparação lá no site — melhor um banner sem prazo do que a faixa
   inteira fora do ar. */
function dataISO(valor) {
    const t = texto(valor, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

/* Endereço de imagem: só https, e só http para 127.0.0.1 (teste local).
   Sem isto, um "javascript:" digitado no campo viraria link clicável na
   home da loja. */
function urlSegura(valor, { permitirVazio = false } = {}) {
    const t = texto(valor, 600);
    if (!t) return permitirVazio ? "" : null;
    try {
        const u = new URL(t);
        if (u.protocol === "https:") return u.href;
        if (u.protocol === "http:" && /^(127\.0\.0\.1|localhost)$/.test(u.hostname)) return u.href;
        return null;
    } catch {
        return null;
    }
}

/* O que o SITE lê. Aberto, sem chave: é conteúdo de vitrine, aparece
   para qualquer visitante de qualquer jeito. Já sai filtrado por data,
   para o site não precisar saber a regra nem conferir o relógio. */
async function tratarBannersPublicos(request, env, db) {

    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

    const { results } = await db.prepare(
        `SELECT id, imagem, alt, link
           FROM banners
          WHERE ativo = 1
            AND (inicio IS NULL OR inicio = '' OR inicio <= ?1)
            AND (fim    IS NULL OR fim    = '' OR fim    >= ?1)
          ORDER BY ordem, id`
    ).bind(hoje).all();

    return json({ banners: results || [] });

}

/* O que o PAINEL lê: tudo, inclusive desligado e fora do prazo, porque
   é justamente isso que a loja precisa ver para editar. */
async function tratarBannersDaLoja(request, env, loja, db) {

    const { results } = await db.prepare(
        `SELECT id, imagem, alt, link, inicio, fim, ativo, ordem, criado_em, r2_chave
           FROM banners ORDER BY ordem, id`
    ).all();

    return json({ banners: results || [], podeEnviarArquivo: !!env.BANNERS_BUCKET });

}

async function tratarSalvarBanner(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const imagem = urlSegura(corpo.imagem);
    if (!imagem) return json({ erro: "Informe o endereço da imagem (https://...)." }, 400);

    const alt = texto(corpo.alt, 200);
    if (!alt) return json({ erro: "Escreva o texto alternativo da imagem." }, 400);

    const link = urlSegura(corpo.link, { permitirVazio: true });
    if (link === null) return json({ erro: "O link precisa começar com https://." }, 400);

    const inicio = dataISO(corpo.inicio);
    const fim = dataISO(corpo.fim);

    if (inicio && fim && fim < inicio) {
        return json({ erro: "A data final não pode ser antes da inicial." }, 400);
    }

    const ativo = corpo.ativo ? 1 : 0;
    const ordem = Math.round(numero(corpo.ordem));
    const id = Math.round(numero(corpo.id));

    if (id > 0) {
        await db.prepare(
            `UPDATE banners
                SET imagem = ?2, alt = ?3, link = ?4, inicio = ?5, fim = ?6,
                    ativo = ?7, ordem = ?8, r2_chave = COALESCE(?9, r2_chave)
              WHERE id = ?1`
        ).bind(id, imagem, alt, link, inicio, fim, ativo, ordem,
               texto(corpo.r2Chave, 200) || null).run();

        return json({ sucesso: true, id });
    }

    const r = await db.prepare(
        `INSERT INTO banners (imagem, alt, link, inicio, fim, ativo, ordem, criado_em, r2_chave)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
    ).bind(imagem, alt, link, inicio, fim, ativo, ordem, Date.now(),
           texto(corpo.r2Chave, 200) || null).run();

    return json({ sucesso: true, id: r.meta?.last_row_id ?? null });

}

async function tratarExcluirBanner(request, env, loja, db) {

    const { id } = await request.json().catch(() => ({}));
    const alvo = Math.round(numero(id));
    if (!alvo) return json({ erro: "Informe o id do banner." }, 400);

    /* Apaga o arquivo junto. Sem isto o balde vira depósito de imagem
       de campanha de dois anos atrás, que ninguém sabe se ainda serve
       para alguma coisa e por isso ninguém apaga. */
    const linha = await db.prepare(
        `SELECT r2_chave FROM banners WHERE id = ?1`
    ).bind(alvo).first();

    if (linha?.r2_chave && env.BANNERS_BUCKET && chaveEhDaLoja(loja, linha.r2_chave)) {
        await env.BANNERS_BUCKET.delete(linha.r2_chave).catch(() => {});
    }

    const r = await db.prepare(`DELETE FROM banners WHERE id = ?1`).bind(alvo).run();

    return json({ sucesso: true, apagados: r.meta?.changes ?? 0 });

}

/* Recebe o arquivo do painel e devolve o endereço definitivo.

   Só funciona com o balde do R2 ligado nas configurações do worker. Sem
   ele a rota diz isso em português, e o painel continua aceitando
   endereço colado à mão — o recurso a mais não pode impedir o de
   sempre de funcionar. */
const PASTAS = ["banner", "encarte", "marca"];
const MAX_PDF_BYTES = 12 * 1024 * 1024;   // encarte de 8 páginas cabe nisso

/* Upload genérico para o R2.

   Nasceu só para banner. Quando o encarte chegou, a escolha era copiar a
   função ou dar-lhe uma pasta — copiar significaria manter dois lugares
   com as mesmas regras de tamanho e de tipo, e eles divergem na primeira
   vez que alguém ajusta um só.

   A pasta vem de uma lista fechada: sem isso, "../" no parâmetro
   escreveria onde não devia. */
async function tratarEnviarArquivo(request, env, loja, db, pasta) {

    if (!env.BANNERS_BUCKET) {
        return json({
            erro: "Envio de arquivo não está ligado. Cole o endereço de um arquivo já publicado, " +
                  "ou ligue um bucket R2 chamado BANNERS_BUCKET nas configurações do worker."
        }, 501);
    }

    if (!PASTAS.includes(pasta)) return json({ erro: "Pasta inválida." }, 400);

    const tipo = (request.headers.get("Content-Type") || "").split(";")[0].trim();

    const ehPdf = tipo === "application/pdf";
    // PDF só no encarte: banner em PDF não renderiza numa faixa da home
    if (ehPdf && pasta !== "encarte") return json({ erro: "PDF só é aceito no encarte." }, 415);
    if (!ehPdf && !TIPOS_DE_IMAGEM.includes(tipo)) {
        return json({ erro: "Formato não aceito. Use JPG, PNG, WebP, GIF, AVIF" +
                            (pasta === "encarte" ? " ou PDF." : ".") }, 415);
    }

    const bytes = await request.arrayBuffer();
    const limite = ehPdf ? MAX_PDF_BYTES : MAX_BANNER_BYTES;

    if (!bytes.byteLength) return json({ erro: "Arquivo vazio." }, 400);
    if (bytes.byteLength > limite) {
        return json({ erro: `Arquivo grande demais. O limite é ${Math.round(limite / 1024 / 1024)} MB.` }, 413);
    }

    const extensao = {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
        "image/gif": "gif", "image/avif": "avif", "application/pdf": "pdf"
    }[tipo];

    const chave = `${prefixoDaLoja(loja)}${pasta}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extensao}`;

    await env.BANNERS_BUCKET.put(chave, bytes, { httpMetadata: { contentType: tipo } });

    const base = new URL(request.url).origin;

    /* O endereço carrega a chave inteira, prefixo e tudo. Assim a rota
       que serve não precisa adivinhar de qual loja é o arquivo — e os
       endereços já publicados, sem prefixo, continuam valendo. */
    return json({ sucesso: true, chave, url: `${base}/arquivos/${chave}` });

}

/* Serve qualquer arquivo das pastas conhecidas. O /banners/arquivo/...
   continua atendendo os banners já cadastrados, que guardaram o endereço
   antigo — endereço publicado não se quebra. */
async function tratarServirArquivo(request, env, db, prefixo, pasta, nome) {

    if (!env.BANNERS_BUCKET || !PASTAS.includes(pasta)) return json({ erro: "Não encontrado." }, 404);

    const objeto = await env.BANNERS_BUCKET.get(`${prefixo ? prefixo + "/" : ""}${pasta}/${nome}`);
    if (!objeto) return json({ erro: "Não encontrado." }, 404);

    return new Response(objeto.body, {
        headers: {
            "Content-Type": objeto.httpMetadata?.contentType || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
            ...CORS_HEADERS
        }
    });

}

async function tratarEnviarImagemDeBanner(request, env, loja, db) {

    if (!env.BANNERS_BUCKET) {
        return json({
            erro: "Envio de arquivo não está ligado. Cole o endereço de uma imagem já publicada, " +
                  "ou ligue um bucket R2 chamado BANNERS_BUCKET nas configurações do worker."
        }, 501);
    }

    const tipo = request.headers.get("Content-Type") || "";
    if (!TIPOS_DE_IMAGEM.includes(tipo.split(";")[0].trim())) {
        return json({ erro: "Formato não aceito. Use JPG, PNG, WebP, GIF ou AVIF." }, 415);
    }

    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return json({ erro: "Arquivo vazio." }, 400);
    if (bytes.byteLength > MAX_BANNER_BYTES) {
        return json({ erro: "Arquivo grande demais. O limite é 3 MB." }, 413);
    }

    const extensao = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
                       "image/gif": "gif", "image/avif": "avif" }[tipo.split(";")[0].trim()];

    const prefixo = prefixoDaLoja(loja);
    const chave = `${prefixo}banner/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extensao}`;

    await env.BANNERS_BUCKET.put(chave, bytes, { httpMetadata: { contentType: tipo } });

    const base = new URL(request.url).origin;

    /* O endereço antigo é /banners/arquivo/<arquivo>, sem a pasta. Com
       prefixo ele passa a levar o prefixo também, e a rota aceita os
       dois formatos — o que já está publicado não pode quebrar. */
    const depoisDaPasta = chave.slice(`${prefixo}banner/`.length);

    return json({
        sucesso: true,
        chave,
        url: `${base}/banners/arquivo/${prefixo}${depoisDaPasta}`
    });

}

/* Serve o arquivo do R2. Aberto, como qualquer imagem de vitrine.

   O cache longo é seguro porque o nome do arquivo tem a hora e um
   sorteio dentro: trocar o banner gera nome novo, então nunca é preciso
   invalidar cache — o endereço antigo simplesmente deixa de ser usado. */
async function tratarArquivoDeBanner(request, env, db, prefixo, nome) {

    if (!env.BANNERS_BUCKET) return json({ erro: "Não encontrado." }, 404);

    const objeto = await env.BANNERS_BUCKET.get(`${prefixo ? prefixo + "/" : ""}banner/${nome}`);
    if (!objeto) return json({ erro: "Não encontrado." }, 404);

    return new Response(objeto.body, {
        headers: {
            "Content-Type": objeto.httpMetadata?.contentType || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
            ...CORS_HEADERS
        }
    });

}

/* ========================= PROMOÇÕES =========================

   Camada por cima do preço da planilha. O catálogo é reexportado do
   FarmaxPDV e a reexportação sobrescreve tudo; promoção que morasse lá
   sumiria na importação seguinte. Aqui ela sobrevive.

   Guarda o preço FINAL, não o percentual. Com percentual, um reajuste
   na planilha mudaria sozinho o que o cliente paga, sem ninguém
   decidir. O percentual só existe na hora de aplicar em lote, para
   calcular; depois vale o número que a loja viu na tela.
*/

const MAX_PROMOCOES_POR_LOTE = 500;

/* Onde moram os catálogos publicados. Um arquivo por farmácia, no mesmo
   repositório — ver o comentário em publish-proxy/worker.js. */
const CATALOGO_BASE =
    "https://raw.githubusercontent.com/zaureliojr-bit/Produtos/refs/heads/main/";

/* =====================================================================
   A LOJA
   =====================================================================

   Quem é a farmácia: endereço, CNPJ, CRF da farmacêutica, telefone,
   coordenadas, raio de entrega e horário. Até a Fase 2 isso estava
   escrito em 29 lugares dentro de 6 arquivos do site; agora está na
   tabela `lojas` (ver schema-lojas.sql) e o site lê daqui.

   Aberto, sem chave, e é intencional: tudo que esta rota devolve já está
   impresso no rodapé de todas as páginas do site e na placa da porta. O
   que NÃO entra aqui é a senha do painel, que mora em outro lugar e tem
   hash próprio a partir da Fase 3.

   Cache de 5 minutos na borda: endereço de farmácia muda de ano em ano,
   e sem cache cada visita ao site viraria uma consulta ao D1. */
async function tratarLojaPublica(request, env) {

    const url = new URL(request.url);
    const slug = texto(url.searchParams.get("slug"), 60);

    let loja;
    let horario;
    let visual = null;
    let primeira = "";

    try {
        /* Sem slug, a loja ativa — hoje só existe uma, e exigir o slug
           agora quebraria o site por nada. Quando houver duas, quem
           chama sem slug recebe a mais antiga, e o endereço da vitrine
           passa a carregar o slug (seção 8 do PLATAFORMA-MULTILOJA). */
        loja = slug
            ? await env.DB.prepare(
                `SELECT * FROM lojas WHERE slug = ?1 AND ativo = 1`
            ).bind(slug).first()
            : await env.DB.prepare(
                `SELECT * FROM lojas WHERE ativo = 1 ORDER BY criado_em LIMIT 1`
            ).first();

        /* Qual é a farmácia original — a única cujo catálogo continua em
           produtos.json, sem sufixo. */
        const maisAntiga = await env.DB.prepare(
            `SELECT slug FROM lojas WHERE ativo = 1 ORDER BY criado_em LIMIT 1`
        ).first();
        primeira = maisAntiga?.slug || "";

        if (!loja) return json({ erro: "Loja não encontrada." }, 404);

        const { results } = await env.DB.prepare(
            `SELECT dia, abre, fecha FROM lojas_horario
              WHERE slug = ?1 ORDER BY dia, abre`
        ).bind(loja.slug).all();

        horario = results || [];

        /* Logotipo e cor. Em try próprio: a tabela é da Fase 3 e pode
           não existir num banco antigo — e nesse caso a loja continua
           abrindo com a marca padrão, que é melhor do que não abrir. */
        try {
            visual = await env.DB.prepare(
                `SELECT logo, cor FROM lojas_visual WHERE slug = ?1`
            ).bind(loja.slug).first();
        } catch (erro) {
            console.error("lojas_visual:", erro);
        }

    } catch (erro) {
        /* Caso concreto, e o motivo deste catch existir: o worker novo
           publicado antes de alguém rodar o schema-lojas.sql no console
           do D1. Aí a consulta estoura em "no such table: lojas".

           Um 500 genérico faria o site parecer quebrado quando o que
           falta é um passo de instalação. O site trata esta rota como
           complemento — ele tem os valores de hoje embutidos no HTML e
           só sobrescreve com o que chega daqui —, então 503 com recado
           claro é o que permite diagnosticar sem abrir o log. */
        console.error("loja:", erro);
        return json({
            erro: "Cadastro de lojas ainda não foi criado neste banco. " +
                  "Rode o pedidos-proxy/schema-lojas.sql no console do D1."
        }, 503);
    }

    /* Onde fica o catálogo desta farmácia.

       Derivado do slug, e não guardado numa coluna — ao contrário do
       banco de dados, que é escrito à mão. A diferença é o que acontece
       quando dá errado: binding apontando para o banco da outra loja
       responde 200 e mostra dado alheio, em silêncio. Catálogo apontando
       para arquivo que não existe responde 404, e o site diz "não
       consegui carregar os produtos" na cara de todo mundo.

       Erro silencioso merece coluna explícita. Erro barulhento não
       merece mais um campo para alguém esquecer de preencher. */
    const daPrimeira = !loja.slug || !primeira || loja.slug === primeira;

    const catalogo = daPrimeira
        ? CATALOGO_BASE + "produtos.json"
        : `${CATALOGO_BASE}produtos-${loja.slug}.json`;

    return json({ loja, horario, visual: visual || null, catalogo }, 200, {
        "Cache-Control": "public, max-age=300"
    });

}

/* Cadastra ou troca a senha de uma farmácia.

   A senha NUNCA é escrita no console do D1, e é por isso que esta rota
   existe em vez de um INSERT na mão: senha digitada em console de banco
   fica no histórico do navegador, no log de quem administra e, não raro,
   num print mandado por WhatsApp. Aqui ela chega pelo corpo da
   requisição, sob TLS, vira hash com sal novo e some.

   Quem pode chamar: quem já passou pelo portão. Na prática,

     - enquanto a loja não tem senha própria, a PAINEL_KEY do worker —
       que é como se cadastra a primeira;
     - depois que tem, só a senha dela.

   O slug alvo vem do corpo, e é a ÚNICA rota de painel que aceita loja
   por parâmetro. Tem de aceitar: é ela que cadastra a loja nova, que por
   definição ainda não consegue autenticar. A trava é a de cima — com a
   PAINEL_KEY cadastrando a primeira senha de cada loja, e cada loja
   trocando só a própria depois. Quando a Fase 5 trouxer o painel de
   operador, isto vira "só o dono da plataforma", que é o certo. */
async function tratarSenhaDaLoja(request, env, loja, dono) {

    let corpo;
    try {
        corpo = await request.json();
    } catch (erro) {
        return json({ erro: "Corpo inválido." }, 400);
    }

    const alvo = String(corpo.slug || loja.slug || "")
        .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
    const senha = String(corpo.senha || "");

    if (!alvo) return json({ erro: "Qual loja?" }, 400);

    /* Oito caracteres não é segurança por si — o que segura é o limite de
       cinco tentativas por IP. É piso para não cadastrarem "1234". */
    if (senha.length < 8) {
        return json({ erro: "A senha precisa de pelo menos 8 caracteres." }, 400);
    }

    /* Só troca senha de loja que existe: sem isto, um erro de digitação
       no slug criaria uma linha órfã, e a loja continuaria entrando com a
       PAINEL_KEY sem ninguém entender por quê. */
    const existe = await env.DB.prepare(
        `SELECT slug FROM lojas WHERE slug = ?1`
    ).bind(alvo).first();

    if (!existe) return json({ erro: "Essa loja não está cadastrada." }, 404);

    /* O dono da plataforma cadastra e troca a senha de qualquer
       farmácia — é como a loja nova ganha a primeira senha, já que ela
       por definição ainda não consegue autenticar.

       Quem não é dono só troca a da própria loja. Sem esta linha, a
       farmácia A entraria com a própria senha e reescreveria a da B —
       que é o vazamento que esta fase inteira existe para fechar. */
    if (!dono && loja.hash && alvo !== loja.slug) {
        return json({ erro: "Você só pode trocar a senha da sua própria loja." }, 403);
    }

    const sal = salNovo();
    const hash = await hashDeSenha(senha, sal);

    await env.DB.prepare(
        `INSERT INTO lojas_acesso (slug, hash, sal, trocada_em)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(slug) DO UPDATE SET hash = ?2, sal = ?3, trocada_em = ?4`
    ).bind(alvo, hash, sal, new Date().toISOString()).run();

    return json({ ok: true, loja: alvo });

}

/* Quem sou eu e em qual farmácia estou.

   O painel chama logo depois do login para saber duas coisas: o nome da
   loja que vai aparecer no cabeçalho, e se quem entrou é o dono da
   plataforma — porque só para ele faz sentido mostrar a aba de lojas.

   Esconder a aba NÃO é a segurança: a segurança é o worker recusar
   /lojas para quem não é dono. A aba escondida só evita mostrar à dona
   de uma farmácia um botão que ela não pode usar. */
async function tratarSessao(request, env, loja, dono) {

    return json({
        dono,
        loja: {
            slug: loja.slug || "",
            nome: loja.nome || "",
            temSenhaPropria: !!loja.hash
        }
    });

}

/* A lista de farmácias da plataforma. Só para o dono.

   Devolve o que ele precisa para administrar — se a loja já tem senha
   própria, em qual banco ela está, qual o prefixo dos arquivos dela — e
   NUNCA o hash nem o sal. Guardar hash é uma coisa; passeá-lo por uma
   API é outra, e não há nenhuma tela que precise dele. */
async function tratarListarLojas(request, env, dono) {

    if (!dono) {
        /* 403 e não 401: a senha estava certa, o que falta é ser dono.
           Dizer isso ajuda quem administra a entender que entrou com a
           chave errada, e não revela nada a quem não passou do portão —
           esse já parou no 401 antes de chegar aqui. */
        return json({ erro: "Só o dono da plataforma vê a lista de lojas." }, 403);
    }

    /* A marca entra na listagem para a tela poder mostrar o logotipo de
       cada filial sem uma consulta por linha. O LEFT JOIN é tolerante:
       filial sem marca própria vem com os campos nulos, que é o caso
       certo de quem usa a identidade da casa. */
    const { results } = await env.DB.prepare(
        `SELECT l.slug, l.nome, l.cidade, l.uf, l.ativo, l.criado_em,
                CASE WHEN a.hash IS NOT NULL AND a.hash <> '' THEN 1 ELSE 0 END AS tem_senha,
                a.trocada_em, a.banco, a.prefixo_r2,
                v.logo, v.cor
           FROM lojas l
           LEFT JOIN lojas_acesso a ON a.slug = l.slug
           LEFT JOIN lojas_visual v ON v.slug = l.slug
          ORDER BY l.criado_em`
    ).all();

    return json({ lojas: results || [] });

}

/* Cadastra uma filial nova. Só o dono.

   O que esta rota faz: as três linhas de banco — a farmácia, o horário e
   o acesso. O que ela NÃO faz, e não pode fazer: criar o banco D1 dela e
   ligar o binding no worker.

   Isso exigiria um token de API da Cloudflare guardado aqui dentro. O
   token capaz de mexer em binding de worker é capaz de reescrever o
   próprio worker — ou seja, guardá-lo aqui é guardar, dentro da casa, a
   chave que abre a casa. Dois cliques manuais por cliente novo custam
   menos que isso.

   A filial nasce SEMPRE desligada. Ligar é um passo à parte, que só
   passa depois de o worker conferir que o banco dela está no ar — ver
   tratarAtivarLoja. Sem isso, o caminho mais curto entre "cadastrei" e
   "a dona entrou e viu a fila da farmácia errada" seria um esquecimento. */
async function tratarCriarLoja(request, env, dono) {

    if (!dono) return json({ erro: "Só o dono da plataforma cadastra filial." }, 403);

    const corpo = await request.json().catch(() => null);
    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const slug = String(corpo.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
    const nome = texto(corpo.nome, 120);

    if (!slug) return json({ erro: "Escolha o apelido da filial (só letra, número e hífen)." }, 400);
    if (!nome) return json({ erro: "Escreva o nome da farmácia." }, 400);

    const jaExiste = await env.DB.prepare(`SELECT slug FROM lojas WHERE slug = ?1`).bind(slug).first();
    if (jaExiste) return json({ erro: `Já existe uma filial com o apelido "${slug}".` }, 409);

    /* O nome do binding é derivado do slug AQUI, uma vez, e gravado. Nas
       consultas ele é sempre lido da coluna, nunca recalculado: derivar
       na hora de usar faria uma filial renomeada apontar silenciosamente
       para outro banco. */
    const banco = "DB_" + slug.replace(/-/g, "_").toUpperCase();

    const numeroOuNulo = (v) => (v === "" || v === null || v === undefined ? null : numero(v));

    await env.DB.prepare(
        `INSERT INTO lojas (
            slug, nome, razao_social, cnpj,
            logradouro, numero, complemento, bairro, cidade, uf, cep,
            latitude, longitude, whatsapp, telefone,
            farmaceutico, crf, rotulo_responsavel, autorizacao, licenca_ms,
            raio_entrega_km, frete_gratis_acima, fuso, ativo
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,0)`
    ).bind(
        slug, nome,
        texto(corpo.razaoSocial, 120), texto(corpo.cnpj, 20),
        texto(corpo.logradouro, 120), texto(corpo.numeroEndereco, 20),
        texto(corpo.complemento, 60), texto(corpo.bairro, 80),
        texto(corpo.cidade, 80), texto(corpo.uf, 2).toUpperCase(), texto(corpo.cep, 12),
        numeroOuNulo(corpo.latitude), numeroOuNulo(corpo.longitude),
        soDigitos(corpo.whatsapp), texto(corpo.telefone, 24),
        texto(corpo.farmaceutico, 120), texto(corpo.crf, 20),
        texto(corpo.rotuloResponsavel, 60) || "Farmacêutico(a) responsável",
        texto(corpo.autorizacao, 120), texto(corpo.licencaMs, 60),
        numero(corpo.raioEntregaKm) || 8,
        numero(corpo.freteGratisAcima) || 0,
        texto(corpo.fuso, 40) || "America/Sao_Paulo"
    ).run();

    /* Horário: o que vier, ou o da farmácia que já existe. Filial sem
       horário nenhum mostraria "Fechado" para sempre. */
    const horario = Array.isArray(corpo.horario) && corpo.horario.length
        ? corpo.horario
        : [0, 1, 2, 3, 4, 5, 6].map((dia) => ({
            dia,
            abre: dia === 0 ? "08:00" : "07:00",
            fecha: dia === 0 ? "19:30" : "21:30"
        }));

    const horas = (v) => (/^\d{2}:\d{2}$/.test(String(v || "")) ? String(v) : "");

    const comandos = [];
    for (const faixa of horario) {
        const dia = Math.round(numero(faixa?.dia));
        const abre = horas(faixa?.abre);
        const fecha = horas(faixa?.fecha);
        if (dia < 0 || dia > 6 || !abre || !fecha) continue;
        comandos.push(
            env.DB.prepare(
                `INSERT OR REPLACE INTO lojas_horario (slug, dia, abre, fecha) VALUES (?1,?2,?3,?4)`
            ).bind(slug, dia, abre, fecha)
        );
    }

    comandos.push(
        env.DB.prepare(
            `INSERT INTO lojas_acesso (slug, banco, prefixo_r2) VALUES (?1, ?2, ?3)
             ON CONFLICT(slug) DO UPDATE SET banco = ?2, prefixo_r2 = ?3`
        ).bind(slug, banco, slug)
    );

    await env.DB.batch(comandos);

    return json({
        sucesso: true,
        slug,
        banco,
        prefixo: slug,
        /* O que ainda falta, dito aqui para a tela não ter de saber a
           regra: ela só mostra. */
        faltaFazer: {
            bancoD1: `farmatech-${slug}`,
            binding: banco,
            schema: "pedidos-proxy/schema.sql"
        }
    });

}

/* O logotipo da farmácia.

   Chega como arquivo cru no corpo, vai para o R2 debaixo do prefixo dela
   e o endereço fica gravado. Rota própria, e não o /arquivos genérico,
   por um motivo concreto: o /arquivos grava no prefixo de QUEM
   AUTENTICOU, e quem cadastra filial nova é o dono — autenticado em
   outra loja. O logotipo da farmácia nova iria parar na pasta da antiga.

   Quem pode: o dono, em qualquer filial; a loja, só na dela. */
async function tratarLogoDaLoja(request, env, loja, dono, alvo) {

    if (!dono && alvo !== loja.slug) {
        return json({ erro: "Você só pode trocar o logotipo da sua própria loja." }, 403);
    }

    if (!env.BANNERS_BUCKET) {
        return json({ erro: "O balde de arquivos não está ligado neste worker." }, 501);
    }

    const tipo = (request.headers.get("Content-Type") || "").split(";")[0].trim();

    /* SVG fica de fora, e não é esquecimento: SVG é XML, aceita <script>
       dentro, e este arquivo vai ser servido do nosso domínio e posto num
       <img> em todas as páginas da loja. O ganho de nitidez não paga o
       risco. */
    if (!TIPOS_DE_IMAGEM.includes(tipo)) {
        return json({ erro: "Formato não aceito. Use PNG, JPG, WebP ou AVIF." }, 415);
    }

    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return json({ erro: "Arquivo vazio." }, 400);
    if (bytes.byteLength > MAX_BANNER_BYTES) {
        return json({ erro: "Arquivo grande demais. O limite é 3 MB." }, 413);
    }

    const alvoLoja = await env.DB.prepare(
        `SELECT l.slug, a.prefixo_r2 FROM lojas l
         LEFT JOIN lojas_acesso a ON a.slug = l.slug WHERE l.slug = ?1`
    ).bind(alvo).first();

    if (!alvoLoja) return json({ erro: "Essa filial não está cadastrada." }, 404);

    const extensao = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
                       "image/gif": "gif", "image/avif": "avif" }[tipo];

    /* O nome tem a hora E um sorteio, como as outras rotas de arquivo
       deste worker. A hora sozinha parecia bastar e não basta: dois
       envios no mesmo milissegundo gerariam o MESMO endereço, e aí o
       cache de um ano continuaria servindo a imagem velha — exatamente
       o que o nome mutável existe para evitar.

       Pessoa nenhuma clica duas vezes no mesmo milissegundo. Um script
       de migração subindo o logotipo de trinta filiais, sim — e foi um
       teste que rodou rápido demais que mostrou isso. */
    const prefixo = prefixoDaLoja(alvoLoja);
    const chave = `${prefixo}marca/logo-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extensao}`;

    await env.BANNERS_BUCKET.put(chave, bytes, { httpMetadata: { contentType: tipo } });

    const url = new URL(request.url).origin + "/arquivos/" + chave;

    /* O logotipo anterior é apagado: senão o balde acumula um arquivo por
       troca, para sempre, e ninguém sabe qual está em uso. */
    const antes = await env.DB.prepare(
        `SELECT logo FROM lojas_visual WHERE slug = ?1`
    ).bind(alvo).first().catch(() => null);

    await env.DB.prepare(
        `INSERT INTO lojas_visual (slug, logo, trocado_em) VALUES (?1, ?2, ?3)
         ON CONFLICT(slug) DO UPDATE SET logo = ?2, trocado_em = ?3`
    ).bind(alvo, url, new Date().toISOString()).run();

    if (antes?.logo && antes.logo !== url) {
        const chaveAntiga = antes.logo.split("/arquivos/")[1];
        if (chaveAntiga && chaveEhDaLoja(alvoLoja, chaveAntiga)) {
            await env.BANNERS_BUCKET.delete(chaveAntiga).catch(() => {});
        }
    }

    return json({ sucesso: true, logo: url });

}

/* Tira o logotipo da farmácia, e ela volta a usar o da casa.

   Apaga o arquivo do balde junto. Deixar o arquivo e só esquecer o
   endereço acumularia logotipo de cliente antigo no R2 para sempre — e
   logotipo de ex-cliente guardado é coisa que ninguém quer ter de
   explicar depois.

   Quem pode: o dono, em qualquer filial; a loja, só na dela. */
async function tratarApagarLogo(request, env, loja, dono, alvo) {

    if (!dono && alvo !== loja.slug) {
        return json({ erro: "Você só pode mexer no logotipo da sua própria loja." }, 403);
    }

    const alvoLoja = await env.DB.prepare(
        `SELECT l.slug, a.prefixo_r2 FROM lojas l
         LEFT JOIN lojas_acesso a ON a.slug = l.slug WHERE l.slug = ?1`
    ).bind(alvo).first();

    if (!alvoLoja) return json({ erro: "Essa filial não está cadastrada." }, 404);

    const atual = await env.DB.prepare(
        `SELECT logo FROM lojas_visual WHERE slug = ?1`
    ).bind(alvo).first().catch(() => null);

    if (atual?.logo && env.BANNERS_BUCKET) {
        const chave = atual.logo.split("/arquivos/")[1];
        /* A conferência de prefixo vale como segunda parede: o endereço
           veio do nosso banco, mas apagar é irreversível. */
        if (chave && chaveEhDaLoja(alvoLoja, chave)) {
            await env.BANNERS_BUCKET.delete(chave).catch(() => {});
        }
    }

    await env.DB.prepare(
        `UPDATE lojas_visual SET logo = NULL, trocado_em = ?2 WHERE slug = ?1`
    ).bind(alvo, new Date().toISOString()).run();

    return json({ sucesso: true, logo: null });

}

/* A cor da farmácia.

   Só a principal. As variações saem dela no navegador, por color-mix com
   proporção fixa — a clara sempre quase branca, a escura sempre mais
   escura que a principal. Deixar a loja escolher as quatro pareceria mais
   flexível e seria pior: é assim que se publica texto azul-escuro sobre
   fundo azul-escuro. */
async function tratarCorDaLoja(request, env, loja, dono, alvo) {

    if (!dono && alvo !== loja.slug) {
        return json({ erro: "Você só pode trocar a cor da sua própria loja." }, 403);
    }

    const corpo = await request.json().catch(() => ({}));
    const cor = String(corpo.cor || "").trim().toLowerCase();

    /* Só #rrggbb. O valor vai para dentro de um <style> servido no nosso
       domínio: qualquer coisa fora deste formato é texto de estranho
       entrando em folha de estilo. */
    if (cor && !/^#[0-9a-f]{6}$/.test(cor)) {
        return json({ erro: "A cor precisa estar no formato #rrggbb." }, 400);
    }

    const existe = await env.DB.prepare(
        `SELECT slug FROM lojas WHERE slug = ?1`
    ).bind(alvo).first();

    if (!existe) return json({ erro: "Essa filial não está cadastrada." }, 404);

    await env.DB.prepare(
        `INSERT INTO lojas_visual (slug, cor, trocado_em) VALUES (?1, ?2, ?3)
         ON CONFLICT(slug) DO UPDATE SET cor = ?2, trocado_em = ?3`
    ).bind(alvo, cor || null, new Date().toISOString()).run();

    return json({ sucesso: true, cor: cor || null });

}

/* A filial está pronta para ser ligada?

   Confere o que o cadastro sozinho não garante: que o banco dela existe,
   está ligado a este worker e tem as tabelas de operação. É a diferença
   entre "cadastrei" e "funciona".

   Sem esta conferência, o caminho curto entre uma e outra seria a dona
   da farmácia abrindo o painel e levando 503 — ou, pior, antes da
   correção do banco vazio, vendo a fila da farmácia errada. */
async function tratarConferirLoja(request, env, dono, slug) {

    if (!dono) return json({ erro: "Só o dono da plataforma confere filial." }, 403);

    const loja = await env.DB.prepare(
        `SELECT l.slug, l.nome, l.ativo, a.banco, a.prefixo_r2,
                CASE WHEN a.hash IS NOT NULL AND a.hash <> '' THEN 1 ELSE 0 END AS tem_senha
           FROM lojas l LEFT JOIN lojas_acesso a ON a.slug = l.slug
          WHERE l.slug = ?1`
    ).bind(slug).first();

    if (!loja) return json({ erro: "Essa filial não está cadastrada." }, 404);

    const conferencias = [];
    const anotar = (o, ok, recado) => conferencias.push({ o, ok, recado });

    anotar("cadastro", true, `${loja.nome} está na tabela de lojas.`);

    const horario = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM lojas_horario WHERE slug = ?1`
    ).bind(slug).first();

    anotar("horário", (horario?.n || 0) > 0,
        horario?.n ? `${horario.n} faixas de horário cadastradas.`
                   : "Sem horário: a loja apareceria sempre fechada.");

    anotar("banco cadastrado", !!loja.banco,
        loja.banco ? `A filial aponta para o binding ${loja.banco}.`
                   : "Falta gravar o nome do binding na coluna banco.");

    const db = loja.banco ? env[loja.banco] : null;

    anotar("binding ligado ao worker", !!db,
        db ? `O binding ${loja.banco} está ligado e respondendo.`
           : `O binding ${loja.banco || "(nenhum)"} não existe neste worker. ` +
             "Crie o banco D1, ligue o binding com esse nome e publique o worker.");

    let tabelas = false;
    if (db) {
        try {
            await db.prepare(`SELECT COUNT(*) AS n FROM pedidos`).first();
            tabelas = true;
        } catch (erro) {
            console.error("conferirLoja:", erro);
        }
    }

    anotar("tabelas de operação", tabelas,
        tabelas ? "O banco da filial tem as tabelas de pedidos."
                : "O banco está ligado, mas sem as tabelas. Rode o schema.sql no console dele.");

    /* O banco da filial NÃO pode ser o mesmo da farmácia original: seria
       o vazamento com outro nome. Como os dois são objetos de binding
       diferentes mesmo apontando para o mesmo D1, a comparação direta
       não serve — então pergunta ao banco se ele conhece a tabela de
       lojas, que só existe no principal. */
    let separado = true;
    if (db && tabelas) {
        try {
            await db.prepare(`SELECT COUNT(*) AS n FROM lojas`).first();
            separado = false;   // respondeu: é o banco principal
        } catch (erro) {
            separado = true;    // não conhece a tabela: é banco próprio
        }
    }

    anotar("banco separado do principal", separado,
        separado ? "O banco é só desta filial."
                 : "ATENÇÃO: o binding está apontando para o banco principal. " +
                   "A filial veria os pedidos da farmácia original.");

    anotar("senha", !!loja.tem_senha,
        loja.tem_senha ? "A filial já tem senha própria."
                       : "Ainda sem senha própria. Cadastre antes de entregar o painel.");

    const bloqueios = conferencias.filter((c) => !c.ok && c.o !== "senha");

    return json({
        slug,
        nome: loja.nome,
        ativo: !!loja.ativo,
        podeLigar: bloqueios.length === 0,
        conferencias
    });

}

/* Liga ou desliga a filial.

   Ligar só passa se a conferência passar: é a trava que impede uma
   filial meio cadastrada chegar ao cliente. Desligar passa sempre —
   tirar do ar nunca pode depender de nada estar certo. */
async function tratarAtivarLoja(request, env, dono, slug) {

    if (!dono) return json({ erro: "Só o dono da plataforma liga filial." }, 403);

    const corpo = await request.json().catch(() => ({}));
    const ligar = corpo.ativo !== false;

    if (ligar) {
        const conferido = await tratarConferirLoja(request, env, dono, slug);
        const resultado = await conferido.json();

        if (resultado.erro) return json(resultado, conferido.status);

        if (!resultado.podeLigar) {
            return json({
                erro: "A filial ainda não está pronta para ligar.",
                conferencias: resultado.conferencias
            }, 409);
        }
    }

    /* Pergunta se a filial existe, em vez de deduzir de meta.changes.

       Deduzir do contador do driver é frágil de dois jeitos: o valor
       depende de detalhe de implementação, e um UPDATE que não muda
       nada — ligar o que já está ligado — poderia ser lido como "essa
       filial não existe". Uma consulta a mais, numa rota que roda uma
       vez por cliente novo, não é preço nenhum. */
    const existe = await env.DB.prepare(
        `SELECT slug FROM lojas WHERE slug = ?1`
    ).bind(slug).first();

    if (!existe) return json({ erro: "Essa filial não está cadastrada." }, 404);

    await env.DB.prepare(
        `UPDATE lojas SET ativo = ?2 WHERE slug = ?1`
    ).bind(slug, ligar ? 1 : 0).run();

    return json({ sucesso: true, slug, ativo: ligar });

}

/* O que o SITE lê. Aberto, como o preço da vitrine — que é público de
   qualquer jeito. Já sai filtrado por data: o site aplica e pronto. */
async function tratarPromocoesPublicas(request, env, db) {

    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

    const { results } = await db.prepare(
        `SELECT codigo, preco
           FROM promocoes
          WHERE ativo = 1
            AND (inicio IS NULL OR inicio = '' OR inicio <= ?1)
            AND (fim    IS NULL OR fim    = '' OR fim    >= ?1)`
    ).bind(hoje).all();

    return json({ promocoes: results || [] });

}

async function tratarPromocoesDaLoja(request, env, loja, db) {

    const { results } = await db.prepare(
        `SELECT codigo, preco, inicio, fim, ativo, lote, criado_em
           FROM promocoes ORDER BY criado_em DESC`
    ).all();

    const lotes = await db.prepare(
        `SELECT lote, COUNT(*) AS itens, MIN(inicio) AS inicio, MAX(fim) AS fim
           FROM promocoes WHERE lote IS NOT NULL AND lote <> ''
          GROUP BY lote ORDER BY MAX(criado_em) DESC`
    ).all();

    return json({ promocoes: results || [], lotes: lotes.results || [] });

}

/* Grava uma ou muitas de uma vez.

   A conta do percentual é feita no PAINEL, não aqui: é lá que a loja vê
   o preço que vai valer, item por item, antes de confirmar. O worker
   recebe preços prontos justamente para não existir um segundo lugar
   onde o valor possa sair diferente do que foi mostrado. */
async function tratarSalvarPromocoes(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const itens = Array.isArray(corpo.itens) ? corpo.itens : [];
    if (!itens.length) return json({ erro: "Nenhum produto na lista." }, 400);
    if (itens.length > MAX_PROMOCOES_POR_LOTE) {
        return json({ erro: `Máximo de ${MAX_PROMOCOES_POR_LOTE} produtos por vez.` }, 400);
    }

    const inicio = dataISO(corpo.inicio);
    const fim = dataISO(corpo.fim);
    if (inicio && fim && fim < inicio) {
        return json({ erro: "A data final não pode ser antes da inicial." }, 400);
    }

    const ativo = corpo.ativo === false ? 0 : 1;
    const lote = texto(corpo.lote, 60) || null;
    const agora = Date.now();

    const comandos = [];

    for (const item of itens) {
        const codigo = texto(item?.codigo, 40);
        const preco = numero(item?.preco);

        // preço zero apagaria a promoção pela porta dos fundos, sem a
        // loja perceber que apagou. Para tirar, existe a rota de excluir.
        if (!codigo || preco <= 0) {
            return json({ erro: `Produto inválido na lista (código "${codigo}").` }, 400);
        }

        comandos.push(
            db.prepare(
                `INSERT INTO promocoes (codigo, preco, inicio, fim, ativo, lote, criado_em)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)
                 ON CONFLICT(codigo) DO UPDATE SET
                    preco = excluded.preco, inicio = excluded.inicio, fim = excluded.fim,
                    ativo = excluded.ativo, lote = excluded.lote, criado_em = excluded.criado_em`
            ).bind(codigo, Number(preco.toFixed(2)), inicio, fim, ativo, lote, agora)
        );
    }

    // uma transação só: ou o lote inteiro entra, ou nada. Meio lote de
    // promoção aplicado é pior do que nenhum — ninguém sabe onde parou.
    await db.batch(comandos);

    return json({ sucesso: true, gravados: comandos.length, lote });

}

/* Tira promoção: um código, uma lista de códigos, ou um lote inteiro.

   O lote existe para isto. Sem ele, desfazer uma promoção de 300 itens
   seria trezentos cliques, e na prática ninguém desfaz — a promoção fica
   no ar para sempre. */
async function tratarExcluirPromocoes(request, env, loja, db) {

    const corpo = await request.json().catch(() => ({}));

    const lote = texto(corpo.lote, 60);
    if (lote) {
        const r = await db.prepare(`DELETE FROM promocoes WHERE lote = ?1`).bind(lote).run();
        return json({ sucesso: true, apagados: r.meta?.changes ?? 0 });
    }

    const codigos = (Array.isArray(corpo.codigos) ? corpo.codigos : [corpo.codigo])
        .map(c => texto(c, 40)).filter(Boolean);

    if (!codigos.length) return json({ erro: "Informe 'codigo', 'codigos' ou 'lote'." }, 400);
    if (codigos.length > MAX_PROMOCOES_POR_LOTE) {
        return json({ erro: `Máximo de ${MAX_PROMOCOES_POR_LOTE} por vez.` }, 400);
    }

    const marcadores = codigos.map((_, i) => `?${i + 1}`).join(",");
    const r = await db.prepare(
        `DELETE FROM promocoes WHERE codigo IN (${marcadores})`
    ).bind(...codigos).run();

    return json({ sucesso: true, apagados: r.meta?.changes ?? 0 });

}

/* ========================= ENCARTE =========================

   O encarte é a peça que a loja já faz para o WhatsApp e para imprimir.
   Aqui ela ganha um lugar no site, com prazo — o de outubro entra e sai
   sozinho, sem ninguém lembrar de tirar o de setembro. Encarte vencido
   no ar é propaganda de preço que a loja não pratica mais, e o cliente
   chega no balcão cobrando.

   As páginas são imagens, e o PDF é opcional, para baixar ou imprimir.
   Não é o contrário porque PDF no celular abre em visualizador de
   arquivo, e metade das pessoas desiste ali.
*/

/* O que o SITE lê: o encarte que está valendo hoje, com as páginas na
   ordem. Um só — dois encartes válidos ao mesmo tempo é erro de
   cadastro, e mostrar os dois esconderia o erro. Ganha o mais recente. */
async function tratarEncartePublico(request, env, db) {

    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

    const encarte = await db.prepare(
        `SELECT id, titulo, pdf
           FROM encartes
          WHERE ativo = 1
            AND (inicio IS NULL OR inicio = '' OR inicio <= ?1)
            AND (fim    IS NULL OR fim    = '' OR fim    >= ?1)
          ORDER BY criado_em DESC
          LIMIT 1`
    ).bind(hoje).first();

    if (!encarte) return json({ encarte: null });

    const { results } = await db.prepare(
        `SELECT imagem FROM encarte_paginas WHERE encarte_id = ?1 ORDER BY ordem, id`
    ).bind(encarte.id).all();

    return json({ encarte: { ...encarte, paginas: (results || []).map(p => p.imagem) } });

}

async function tratarEncartesDaLoja(request, env, loja, db) {

    const encartes = await db.prepare(
        `SELECT id, titulo, inicio, fim, ativo, pdf, pdf_chave, criado_em
           FROM encartes ORDER BY criado_em DESC`
    ).all();

    const paginas = await db.prepare(
        `SELECT id, encarte_id, imagem, r2_chave, ordem
           FROM encarte_paginas ORDER BY encarte_id, ordem, id`
    ).all();

    const porEncarte = new Map();
    for (const pag of (paginas.results || [])) {
        if (!porEncarte.has(pag.encarte_id)) porEncarte.set(pag.encarte_id, []);
        porEncarte.get(pag.encarte_id).push(pag);
    }

    return json({
        encartes: (encartes.results || []).map(e => ({ ...e, paginas: porEncarte.get(e.id) || [] })),
        podeEnviarArquivo: !!env.BANNERS_BUCKET
    });

}

async function tratarSalvarEncarte(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const titulo = texto(corpo.titulo, 120);
    if (!titulo) return json({ erro: "Dê um nome ao encarte (ex.: Encarte de outubro)." }, 400);

    const inicio = dataISO(corpo.inicio);
    const fim = dataISO(corpo.fim);
    if (inicio && fim && fim < inicio) {
        return json({ erro: "A data final não pode ser antes da inicial." }, 400);
    }

    const paginas = Array.isArray(corpo.paginas) ? corpo.paginas : [];
    if (!paginas.length) return json({ erro: "O encarte precisa de pelo menos uma página." }, 400);
    if (paginas.length > 24) return json({ erro: "Máximo de 24 páginas." }, 400);

    const limpas = [];
    for (const pag of paginas) {
        const imagem = urlSegura(pag?.imagem);
        if (!imagem) return json({ erro: "Página com endereço inválido." }, 400);
        limpas.push({ imagem, r2_chave: texto(pag?.r2Chave || pag?.r2_chave, 200) || null });
    }

    const pdf = urlSegura(corpo.pdf, { permitirVazio: true });
    if (pdf === null) return json({ erro: "O PDF precisa ser um endereço https://." }, 400);

    const ativo = corpo.ativo === false ? 0 : 1;
    const id = Math.round(numero(corpo.id));
    const agora = Date.now();

    let encarteId = id;

    if (id > 0) {
        await db.prepare(
            `UPDATE encartes SET titulo = ?2, inicio = ?3, fim = ?4, ativo = ?5,
                                 pdf = ?6, pdf_chave = COALESCE(?7, pdf_chave)
              WHERE id = ?1`
        ).bind(id, titulo, inicio, fim, ativo, pdf, texto(corpo.pdfChave, 200) || null).run();
    } else {
        const r = await db.prepare(
            `INSERT INTO encartes (titulo, inicio, fim, ativo, pdf, pdf_chave, criado_em)
             VALUES (?1,?2,?3,?4,?5,?6,?7)`
        ).bind(titulo, inicio, fim, ativo, pdf, texto(corpo.pdfChave, 200) || null, agora).run();
        encarteId = r.meta?.last_row_id;
    }

    /* As páginas são regravadas por inteiro, e não remendadas.

       Reordenar, trocar uma página e apagar outra numa mesma edição é o
       uso normal aqui — e casar isso item a item é onde nascem os
       encartes com página repetida ou faltando. Apagar e reinserir num
       batch só deixa o resultado igual ao que a tela mostrava. */
    const comandos = [
        db.prepare(`DELETE FROM encarte_paginas WHERE encarte_id = ?1`).bind(encarteId)
    ];

    limpas.forEach((pag, i) => {
        comandos.push(
            db.prepare(
                `INSERT INTO encarte_paginas (encarte_id, imagem, r2_chave, ordem)
                 VALUES (?1,?2,?3,?4)`
            ).bind(encarteId, pag.imagem, pag.r2_chave, i)
        );
    });

    await db.batch(comandos);

    return json({ sucesso: true, id: encarteId, paginas: limpas.length });

}

async function tratarExcluirEncarte(request, env, loja, db) {

    const { id } = await request.json().catch(() => ({}));
    const alvo = Math.round(numero(id));
    if (!alvo) return json({ erro: "Informe o id do encarte." }, 400);

    /* Leva os arquivos junto — as páginas e o PDF. Encarte antigo é a
       coisa que mais ocupa espaço aqui: oito imagens grandes por mês,
       todo mês, que ninguém vai olhar de novo. */
    if (env.BANNERS_BUCKET) {
        const [pags, enc] = await Promise.all([
            db.prepare(`SELECT r2_chave FROM encarte_paginas WHERE encarte_id = ?1`).bind(alvo).all(),
            db.prepare(`SELECT pdf_chave FROM encartes WHERE id = ?1`).bind(alvo).first()
        ]);

        const chaves = [...(pags.results || []).map(p => p.r2_chave), enc?.pdf_chave]
            .filter(Boolean)
            .filter((c) => chaveEhDaLoja(loja, c));

        await Promise.all(chaves.map(c => env.BANNERS_BUCKET.delete(c).catch(() => {})));
    }

    await db.batch([
        db.prepare(`DELETE FROM encarte_paginas WHERE encarte_id = ?1`).bind(alvo),
        db.prepare(`DELETE FROM encartes WHERE id = ?1`).bind(alvo)
    ]);

    return json({ sucesso: true });

}

async function tratarStatus(request, env, loja, db) {

    const { ref, status } = await request.json().catch(() => ({}));

    const permitidos = ["novo", "separando", "receita-ok", "entregue", "cancelado"];

    if (!ref || !permitidos.includes(status)) {
        return json({ erro: "Informe 'ref' e um 'status' válido." }, 400);
    }

    const r = await db.prepare(
        `UPDATE pedidos SET status = ?2 WHERE ref = ?1`
    ).bind(texto(ref, 40), status).run();

    return json({ sucesso: true, alterados: r.meta?.changes ?? 0 });

}

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const rota = url.pathname.replace(/\/+$/, "") || "/";

        try {

            // gravar pedido: aberto, porque quem chama é o site público —
            // mas com teto por IP, senão qualquer um enche a fila da loja
            if (request.method === "POST" && rota === "/pedidos") {
                const cheio = await barrarRotaPublica(
                    env, request, "pedidos", LIMITE_PEDIDOS_HORA,
                    "Muitos pedidos deste acesso em pouco tempo. " +
                    "Se foi você mesmo, fale com a gente pelo WhatsApp."
                );
                if (cheio) return cheio;
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarNovoPedido(request, env, alvo.db);
            }

            // idem: quem grava é o site público
            if (request.method === "POST" && rota === "/busca") {
                const cheio = await barrarRotaPublica(
                    env, request, "busca", LIMITE_BUSCAS_HORA,
                    "Muitas buscas deste acesso em pouco tempo."
                );
                if (cheio) return cheio;
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarNovaBusca(request, env, alvo.db);
            }

            // Banners: a lista e os arquivos são conteúdo de vitrine, e a
            // vitrine é pública. Quem EDITA, mais abaixo, precisa da chave.
            if (request.method === "GET" && rota === "/banners") {
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarBannersPublicos(request, env, alvo.db);
            }

            /* Quem é a farmácia. Público: é o mesmo conteúdo do rodapé
               de todas as páginas e da placa na porta. */
            if (request.method === "GET" && rota === "/loja") {
                return await tratarLojaPublica(request, env);
            }

            // preço de vitrine é público de qualquer jeito
            if (request.method === "GET" && rota === "/promocoes") {
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarPromocoesPublicas(request, env, alvo.db);
            }

            if (request.method === "GET" && rota === "/encarte") {
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarEncartePublico(request, env, alvo.db);
            }

            /* Dois formatos, e os dois têm de valer:

                 /arquivos/banner/x.png                 o de sempre
                 /arquivos/<prefixo>/banner/x.png       com prefixo de loja

               O de sempre continua porque endereço de banner já está
               publicado na home e dentro de encarte — quebrar seria
               apagar a arte da loja de um dia para o outro.

               A ordem do regex resolve a ambiguidade sozinha: só há
               prefixo quando sobram três segmentos. */
            const arquivo = rota.match(/^\/arquivos\/(?:([a-z0-9-]+)\/)?([a-z]+)\/([A-Za-z0-9._-]+)$/);
            if (request.method === "GET" && arquivo) {
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarServirArquivo(request, env, alvo.db, arquivo[1] || "", arquivo[2], arquivo[3]);
            }

            const arquivoBanner = rota.match(/^\/banners\/arquivo\/(?:([a-z0-9-]+)\/)?([A-Za-z0-9._-]+)$/);
            if (request.method === "GET" && arquivoBanner) {
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarArquivoDeBanner(request, env, alvo.db, arquivoBanner[1] || "", arquivoBanner[2]);
            }

            /* Daqui para baixo é a loja olhando os PRÓPRIOS dados.

               O portão devolve qual farmácia provou a senha e qual é o
               banco dela. Nenhum handler abaixo lê a loja do request:
               todos a recebem como argumento. Se um deles aceitasse
               "?loja=", a dona da farmácia A autenticada pediria
               /fila?loja=farmacia-b e leria a fila da concorrente. */
            const porta = await barrarSeNaoPuder(request, env);
            if (porta.recusa) return porta.recusa;

            const loja = porta.loja;
            const db = porta.db;

            /* Cadastrar/trocar senha. Fica aqui em cima, logo depois do
               portão, porque é a única rota de painel que aceita o slug
               por parâmetro — e isso merece estar visível, não perdido no
               meio das outras. */
            if (request.method === "POST" && rota === "/loja/senha") {
                return await tratarSenhaDaLoja(request, env, loja, porta.dono);
            }

            /* Quem sou eu, em qual loja estou, e sou dono da plataforma. */
            if (request.method === "GET" && rota === "/sessao") {
                return await tratarSessao(request, env, loja, porta.dono);
            }

            /* A lista de farmácias. Só o dono — e a recusa é no worker,
               não na tela: aba escondida não é permissão. */
            if (request.method === "GET" && rota === "/lojas") {
                return await tratarListarLojas(request, env, porta.dono);
            }

            /* Cadastrar filial nova. Nasce sempre desligada. */
            if (request.method === "POST" && rota === "/lojas") {
                return await tratarCriarLoja(request, env, porta.dono);
            }

            const conferir = rota.match(/^\/lojas\/([a-z0-9-]+)\/conferir$/);
            if (request.method === "GET" && conferir) {
                return await tratarConferirLoja(request, env, porta.dono, conferir[1]);
            }

            const logo = rota.match(/^\/lojas\/([a-z0-9-]+)\/logo$/);
            if (request.method === "POST" && logo) {
                return await tratarLogoDaLoja(request, env, loja, porta.dono, logo[1]);
            }
            if (request.method === "DELETE" && logo) {
                return await tratarApagarLogo(request, env, loja, porta.dono, logo[1]);
            }

            const cor = rota.match(/^\/lojas\/([a-z0-9-]+)\/cor$/);
            if (request.method === "POST" && cor) {
                return await tratarCorDaLoja(request, env, loja, porta.dono, cor[1]);
            }

            const ativar = rota.match(/^\/lojas\/([a-z0-9-]+)\/ativo$/);
            if (request.method === "POST" && ativar) {
                return await tratarAtivarLoja(request, env, porta.dono, ativar[1]);
            }

            if (request.method === "GET" && rota === "/fila")     return await tratarFila(request, env, loja, db);
            if (request.method === "GET" && rota === "/resumo")   return await tratarResumo(request, env, loja, db);
            if (request.method === "GET" && rota === "/clientes") return await tratarClientes(request, env, loja, db);
            if (request.method === "POST" && rota === "/status")  return await tratarStatus(request, env, loja, db);

            if (request.method === "GET"  && rota === "/banners/todos")   return await tratarBannersDaLoja(request, env, loja, db);
            if (request.method === "POST" && rota === "/banners")         return await tratarSalvarBanner(request, env, loja, db);
            if (request.method === "POST" && rota === "/banners/excluir") return await tratarExcluirBanner(request, env, loja, db);
            if (request.method === "POST" && rota === "/banners/imagem")  return await tratarEnviarImagemDeBanner(request, env, loja, db);

            if (request.method === "POST" && rota === "/arquivos") {
                return await tratarEnviarArquivo(request, env, loja, db, new URL(request.url).searchParams.get("pasta") || "banner");
            }

            if (request.method === "GET"  && rota === "/encartes")         return await tratarEncartesDaLoja(request, env, loja, db);
            if (request.method === "POST" && rota === "/encartes")         return await tratarSalvarEncarte(request, env, loja, db);
            if (request.method === "POST" && rota === "/encartes/excluir") return await tratarExcluirEncarte(request, env, loja, db);

            if (request.method === "GET"  && rota === "/promocoes/todas")   return await tratarPromocoesDaLoja(request, env, loja, db);
            if (request.method === "POST" && rota === "/promocoes")         return await tratarSalvarPromocoes(request, env, loja, db);
            if (request.method === "POST" && rota === "/promocoes/excluir") return await tratarExcluirPromocoes(request, env, loja, db);

            /* Catálogo: a senha do painel já foi conferida acima, então
               daqui para baixo quem chama provou quem é. Este worker
               carimba a chave do destino, que o navegador não tem. */
            if (request.method === "POST" && rota === "/catalogo/imagem") {
                return await encaminhar(request, env, { ...imagens(env), caminho: "/" });
            }

            if (request.method === "POST" && rota === "/catalogo/correcao") {
                return await encaminhar(request, env, { ...imagens(env), caminho: "/correcoes" });
            }

            /* Publicar o catálogo: o porteiro diz ao publish-proxy QUAL
               farmácia está publicando, e é ele que decide o nome do
               arquivo — produtos.json para a primeira, produtos-<slug>
               para as filiais.

               O slug vem de quem provou a senha, nunca de parâmetro. É
               isso que faz o padronizador publicar no catálogo certo sem
               ter mudado uma linha: ele continua chamando /catalogo/
               publicar, e quem sabe de que loja se trata é este worker.

               Vazio para a farmácia original, de propósito: o catálogo
               dela continua em produtos.json, onde o site dela aponta e
               onde o endereço está em cache no navegador de cliente. */
            if (request.method === "POST" && rota === "/catalogo/publicar") {
                const daPrimeira = !loja.slug || !loja.primeira || loja.slug === loja.primeira;
                const qual = daPrimeira ? "" : `?loja=${encodeURIComponent(loja.slug)}`;
                return await encaminhar(request, env, { ...publicacao(env), caminho: "/" + qual });
            }

            // a extração do PDV, que traz preço de custo e por isso não
            // pode mais ser baixada sem credencial
            if (request.method === "GET" && rota === "/catalogo/extracao") {
                return await encaminhar(request, env, { ...imagens(env), caminho: "/extracao" });
            }

            if (request.method === "GET" && rota === "/catalogo/extracao/arquivo") {
                return await encaminhar(request, env, { ...imagens(env), caminho: "/extracao/arquivo" });
            }

            if (request.method === "POST" && rota === "/catalogo/extracao/importado") {
                return await encaminhar(request, env, { ...imagens(env), caminho: "/extracao/importado" });
            }

            if (request.method === "POST" && rota === "/catalogo/extracao/descartar") {
                return await encaminhar(request, env, {
                    ...imagens(env), caminho: "/extracao", metodo: "DELETE"
                });
            }

            // família de uma categoria, listas de referência (CMED e
            // distribuidora) e produtos excluídos — tudo escrita no
            // imagens-proxy, que antes o navegador fazia com a chave
            if (request.method === "POST" && rota === "/catalogo/familia") {
                return await encaminhar(request, env, { ...imagens(env), caminho: "/familias" });
            }

            const referencia = rota.match(/^\/catalogo\/referencia\/([a-z0-9-]+)$/);
            if (request.method === "POST" && referencia) {
                return await encaminhar(request, env, {
                    ...imagens(env), caminho: `/referencias/${referencia[1]}`
                });
            }

            if (request.method === "POST" && rota === "/catalogo/excluido") {
                return await encaminhar(request, env, { ...imagens(env), caminho: "/excluidos" });
            }

            const excluido = rota.match(/^\/catalogo\/excluido\/(.+)$/);
            if (request.method === "DELETE" && excluido) {
                return await encaminhar(request, env, {
                    ...imagens(env), caminho: `/excluidos/${excluido[1]}`, metodo: "DELETE"
                });
            }

            const imagemEan = rota.match(/^\/catalogo\/imagem\/([0-9]+)$/);
            if (request.method === "DELETE" && imagemEan) {
                return await encaminhar(request, env, {
                    ...imagens(env), caminho: `/${imagemEan[1]}`, metodo: "DELETE"
                });
            }

            const umPedido = rota.match(/^\/pedidos\/(.+)$/);
            if (request.method === "GET" && umPedido) {
                return await tratarPedido(request, env, loja, db, decodeURIComponent(umPedido[1]));
            }

            return json({ erro: "Rota não encontrada." }, 404);

        } catch (erro) {

            // a mensagem crua pode conter trecho de SQL — fica no log do
            // worker, não na resposta
            console.error("pedidos-proxy:", erro);

            return json({ erro: "Erro ao processar." }, 500);

        }

    }

};
