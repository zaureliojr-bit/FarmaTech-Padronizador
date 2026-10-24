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

/* =====================================================================
   CUPONS
   =====================================================================

   O site não cobra nada: o pedido vira mensagem de WhatsApp e o dinheiro
   troca de mão no balcão. Então o cupom é uma INSTRUÇÃO para a farmácia
   cobrar menos, e o que ele precisa garantir é que o desconto que a
   atendente vê na fila foi mesmo criado pela loja.

   Por isso a conta é feita AQUI, nunca no navegador. Validado no site,
   qualquer pessoa abriria o console, inventaria "DESCONTO90", e a
   atendente veria um cupom com cara de legítimo no pedido.

   O código é limpo do mesmo jeito em todo lugar — maiúscula, sem espaço
   — porque quem digita no celular digita "bemvindo10", "BemVindo10" e
   " BEMVINDO10 ", e os três têm de ser o mesmo cupom. */
function limparCupom(valor) {
    return String(valor ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
}

/* O desconto em reais, dado o cupom e o que está no carrinho.

   Separada da consulta ao banco de propósito: é a única parte que faz
   conta, e é a que tem teste. */
function descontoDoCupom(cupom, subtotal, frete) {

    const base = numero(subtotal);

    if (cupom.tipo === "frete") {
        return Number(numero(frete).toFixed(2));
    }

    if (cupom.tipo === "valor") {
        /* Nunca mais que o próprio pedido: um cupom de R$ 20 num pedido
           de R$ 12 não pode virar troco. */
        return Number(Math.min(numero(cupom.valor), base).toFixed(2));
    }

    if (cupom.tipo === "percentual") {

        let desconto = base * (numero(cupom.valor) / 100);

        /* O teto existe para o percentual não virar outra promoção num
           pedido grande: 20% de R$ 800 é R$ 160, e não era isso que a
           loja quis dizer quando escreveu "20% de desconto". */
        if (numero(cupom.teto) > 0) desconto = Math.min(desconto, numero(cupom.teto));

        return Number(Math.min(desconto, base).toFixed(2));
    }

    return 0;
}

/* Diz se o cupom vale, e por quê não quando não vale.

   A mensagem de recusa é específica de propósito: "cupom inválido" faz
   o cliente tentar de novo, digitar de novo e desistir. "Este cupom vale
   em pedidos a partir de R$ 50" faz ele pôr mais um item no carrinho —
   que é o que a promoção queria. */
async function avaliarCupom(db, codigoBruto, { subtotal, frete, telefone }) {

    const codigo = limparCupom(codigoBruto);

    if (!codigo) return { valido: false, motivo: "Digite o código do cupom." };

    const cupom = await db.prepare(
        `SELECT codigo, tipo, valor, minimo, teto, inicio, fim,
                limite_total, limite_pessoa, usos, ativo, descricao
           FROM cupons WHERE codigo = ?1`
    ).bind(codigo).first();

    /* "Não existe" e "está desligado" dão a MESMA resposta, e isso é de
       propósito: respostas diferentes transformam o campo de cupom num
       detector de códigos válidos, e aí alguém varre a lista inteira. */
    if (!cupom || !cupom.ativo) {
        return { valido: false, motivo: "Cupom não encontrado." };
    }

    const agora = Date.now();

    if (cupom.inicio && agora < cupom.inicio) {
        return { valido: false, motivo: "Este cupom ainda não começou a valer." };
    }

    if (cupom.fim && agora > cupom.fim) {
        return { valido: false, motivo: "Este cupom já expirou." };
    }

    if (cupom.limite_total > 0 && cupom.usos >= cupom.limite_total) {
        return { valido: false, motivo: "Este cupom já atingiu o limite de usos." };
    }

    if (numero(subtotal) < numero(cupom.minimo)) {
        return {
            valido: false,
            motivo: `Este cupom vale em pedidos a partir de ${dinheiroBR(cupom.minimo)}.`
        };
    }

    /* O limite por pessoa é o que impede o uso mais óbvio: o cupom de
       boas-vindas rodando toda semana no mesmo telefone. Só dá para
       conferir quando o telefone já foi digitado — no carrinho ele pode
       ainda estar vazio, e aí a checagem fica para o envio do pedido. */
    const fone = soDigitos(telefone);

    if (fone && cupom.limite_pessoa > 0) {

        const jaUsou = await db.prepare(
            `SELECT COUNT(*) AS n FROM cupom_usos WHERE codigo = ?1 AND telefone = ?2`
        ).bind(codigo, fone).first();

        if ((jaUsou?.n || 0) >= cupom.limite_pessoa) {
            return { valido: false, motivo: "Você já usou este cupom." };
        }

    }

    const desconto = descontoDoCupom(cupom, subtotal, frete);

    if (desconto <= 0) {
        return { valido: false, motivo: "Este cupom não dá desconto neste pedido." };
    }

    return {
        valido: true,
        codigo,
        tipo: cupom.tipo,
        desconto,
        descricao: cupom.descricao || ""
    };

}

function dinheiroBR(v) {
    return "R$ " + numero(v).toFixed(2).replace(".", ",");
}

/* A rota pública: o carrinho pergunta antes de o cliente fechar o
   pedido. Devolve o desconto JÁ CALCULADO — a tela só mostra o número
   que veio daqui, em vez de recalcular e arriscar divergir. */
async function tratarCupomValidar(request, env, db) {

    const corpo = await request.json().catch(() => null);

    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const resultado = await avaliarCupom(db, corpo.codigo, {
        subtotal: corpo.subtotal,
        frete: corpo.frete,
        telefone: corpo.telefone
    });

    return json(resultado);

}

/* ---- o lado do painel: criar, listar e desligar cupons ------------- */

async function tratarCuponsDaLoja(request, env, loja, db) {

    const cupons = await db.prepare(
        `SELECT c.codigo, c.tipo, c.valor, c.minimo, c.teto, c.inicio, c.fim,
                c.limite_total, c.limite_pessoa, c.usos, c.ativo, c.descricao,
                c.criado_em,
                COALESCE((SELECT SUM(u.desconto) FROM cupom_usos u
                           WHERE u.codigo = c.codigo), 0) AS descontado
           FROM cupons c
          ORDER BY c.ativo DESC, c.criado_em DESC
          LIMIT 100`
    ).all();

    return json({ cupons: cupons.results || [] });

}

const TIPOS_DE_CUPOM = ["percentual", "valor", "frete"];

/* Quantas vezes a MESMA pessoa pode usar.

   Campo em branco vale 1, e não zero. O schema já dizia isso no DEFAULT,
   mas o INSERT passa a coluna explicitamente — então o DEFAULT nunca
   valia, e um numero(undefined) virava 0, que aqui quer dizer
   ILIMITADO. Resultado: todo cupom criado sem preencher esse campo
   podia rodar toda semana no mesmo telefone, que é exatamente o buraco
   que o limite existe para fechar. Quem pegou foi o teste.

   Zero continua existindo como escapatória, para o cupom que a loja
   quer mesmo deixar solto — mas aí é escolha escrita, não esquecimento. */
function limitePessoaDe(valor) {
    if (valor === undefined || valor === null || valor === "") return 1;
    return Math.max(0, Math.round(numero(valor)));
}

async function tratarSalvarCupom(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const codigo = limparCupom(corpo.codigo);

    if (!codigo) return json({ erro: "Dê um código ao cupom." }, 400);
    if (!/^[A-Z0-9-]+$/.test(codigo)) {
        return json({ erro: "O código aceita só letra, número e hífen." }, 400);
    }

    const tipo = TIPOS_DE_CUPOM.includes(corpo.tipo) ? corpo.tipo : "valor";
    const valor = numero(corpo.valor);

    if (tipo !== "frete" && valor <= 0) {
        return json({ erro: "O desconto precisa ser maior que zero." }, 400);
    }

    if (tipo === "percentual" && valor > 90) {
        return json({ erro: "Mais de 90% é quase dar o produto. Confira o número." }, 400);
    }

    /* O fim é o fim do DIA escolhido. Quem põe 31/10 quer que valha até
       o fim do dia 31, e não até a meia-noite que começa o dia. */
    const dia = (texto(corpo.fim, 10) || "").trim();
    const fim = dia ? Date.parse(dia + "T23:59:59-03:00") || null : null;

    const inicioDia = (texto(corpo.inicio, 10) || "").trim();
    const inicio = inicioDia ? Date.parse(inicioDia + "T00:00:00-03:00") || null : null;

    await db.prepare(
        `INSERT INTO cupons
            (codigo, tipo, valor, minimo, teto, inicio, fim,
             limite_total, limite_pessoa, usos, ativo, descricao, criado_em)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,0,?10,?11,?12)
         ON CONFLICT(codigo) DO UPDATE SET
            tipo = excluded.tipo, valor = excluded.valor,
            minimo = excluded.minimo, teto = excluded.teto,
            inicio = excluded.inicio, fim = excluded.fim,
            limite_total = excluded.limite_total,
            limite_pessoa = excluded.limite_pessoa,
            ativo = excluded.ativo, descricao = excluded.descricao`
    ).bind(
        codigo, tipo, valor,
        numero(corpo.minimo), numero(corpo.teto),
        inicio, fim,
        Math.max(0, Math.round(numero(corpo.limiteTotal))),
        limitePessoaDe(corpo.limitePessoa),
        corpo.ativo === false ? 0 : 1,
        texto(corpo.descricao, 120),
        Date.now()
    ).run();

    return json({ ok: true, codigo });

}

/* Desligar, e não apagar. Cupom apagado leva junto o histórico de uso —
   e é o histórico que responde se a promoção valeu a pena. */
async function tratarExcluirCupom(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    const codigo = limparCupom(corpo && corpo.codigo);

    if (!codigo) return json({ erro: "Qual cupom?" }, 400);

    await db.prepare(`UPDATE cupons SET ativo = 0 WHERE codigo = ?1`).bind(codigo).run();

    return json({ ok: true });

}

/* =====================================================================
   O FUNIL
   =====================================================================

   Quantas visitas entram, quantas buscam, quantas chegam ao carrinho,
   quantas pedem. A Cloudflare conta visita; o que ela não responde é
   onde a conta cai — e é só isso que faz a farmácia mudar alguma coisa.

   O servidor recebe a ETAPA e nada mais. Quem garante uma contagem por
   visita é o navegador, com um número sorteado que fica no
   sessionStorage e nunca sai de lá. Aqui não há como saber quem fez o
   quê, e é de propósito: sem identificador não há dado pessoal, e sem
   dado pessoal não há banner de consentimento numa farmácia, onde o
   que a pessoa busca é informação de saúde. */
const ETAPAS_DO_FUNIL = ["visita", "busca", "carrinho", "pedido"];

function diaEmSP(quando) {
    const agora = new Date((quando || Date.now()) - 3 * 3600000);
    return agora.toISOString().slice(0, 10);
}

async function registrarEtapa(db, etapa, quando) {

    if (!ETAPAS_DO_FUNIL.includes(etapa)) return;

    /* Falha em silêncio quando a loja ainda não colou o schema-funil.
       Contagem de visita não pode derrubar o pedido de ninguém — e é
       justamente no pedido que a etapa "pedido" é gravada. */
    try {

        await db.prepare(
            `INSERT INTO funil (dia, etapa, total) VALUES (?1, ?2, 1)
             ON CONFLICT(dia, etapa) DO UPDATE SET total = total + 1`
        ).bind(diaEmSP(quando), etapa).run();

    } catch (erro) {
        /* sem a tabela, o funil simplesmente não enche */
    }

}

async function tratarFunil(request, env, db) {

    const corpo = await request.json().catch(() => null);

    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const etapa = texto(corpo.etapa, 20);

    if (!ETAPAS_DO_FUNIL.includes(etapa)) {
        return json({ erro: "Etapa desconhecida." }, 400);
    }

    /* O pedido se conta sozinho, no tratarNovoPedido. Aceitar aqui
       também deixaria o site mandar "pedido" sem pedido nenhum, e o
       funil terminaria com mais vendas do que a loja fez. */
    if (etapa === "pedido") {
        return json({ erro: "Esta etapa é contada no pedido." }, 400);
    }

    await registrarEtapa(db, etapa);

    return json({ ok: true });

}

/* =====================================================================
   CAMPANHAS
   =====================================================================

   O Meta diz "47 cliques". O Google diz "R$ 80 gastos". Nenhum dos
   dois sabe que saíram três pedidos de R$ 280 desta farmácia — eles
   não enxergam o carrinho daqui. Sem isso o dono decide onde pôr o
   dinheiro do mês por quantidade de clique, que não paga conta.

   O carimbo (?c=instagram-outubro) vai no link do anúncio, o site o
   guarda no navegador por 7 dias e devolve no pedido. Continua sem
   identificar ninguém: o que chega aqui é "mais uma visita da campanha
   X hoje", igual ao funil. */

/* Minúscula, número e hífen: este texto aparece na barra de endereço do
   cliente, e também vira chave primária. Limitado a 40 porque o nome
   bonito mora na coluna `nome` — aqui é só o carimbo. */
function limparIdCampanha(valor) {
    return String(valor || "")
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
}

const CANAIS = ["instagram", "facebook", "google", "whatsapp", "panfleto", "outro"];

/* Só conta visita de campanha QUE EXISTE.

   Sem esta checagem, qualquer um inventaria ?c=qualquer-coisa e a aba
   de Marketing encheria de campanha que a loja nunca criou — e o
   relatório de uma farmácia não pode ser escrito por quem está do lado
   de fora. Como o carimbo vem do próprio painel, uma campanha real
   nunca cai aqui. */
async function registrarVisitaCampanha(db, id, quando) {

    if (!id) return;

    try {

        const existe = await db.prepare(
            `SELECT 1 AS n FROM campanhas WHERE id = ?1`
        ).bind(id).first();

        if (!existe) return;

        await db.prepare(
            `INSERT INTO campanha_dia (dia, campanha, visitas) VALUES (?1, ?2, 1)
             ON CONFLICT(dia, campanha) DO UPDATE SET visitas = visitas + 1`
        ).bind(diaEmSP(quando), id).run();

    } catch (erro) {
        /* loja que ainda não colou o schema-campanhas: a contagem não
           acontece e o site segue vendendo igual */
    }

}

async function tratarVisitaDeCampanha(request, env, db) {

    const corpo = await request.json().catch(() => null);

    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const id = limparIdCampanha(corpo.campanha);

    if (!id) return json({ erro: "Sem campanha." }, 400);

    await registrarVisitaCampanha(db, id);

    /* Sempre ok, mesmo quando a campanha não existe: o site não ganha
       nada sabendo disso, e responder "não existe" daria a quem sonda o
       endereço uma lista das campanhas da loja. */
    return json({ ok: true });

}

/* Guardado fora da transação do pedido, como o funil, e pelo mesmo
   motivo: saber de onde veio a venda é bom, perder a venda por causa
   disso é inaceitável. */
async function registrarPedidoDeCampanha(db, ref, id, quando) {

    if (!id) return;

    try {

        const existe = await db.prepare(
            `SELECT 1 AS n FROM campanhas WHERE id = ?1`
        ).bind(id).first();

        if (!existe) return;

        await db.prepare(
            `INSERT INTO pedido_campanha (ref, campanha, quando) VALUES (?1,?2,?3)
             ON CONFLICT(ref) DO NOTHING`
        ).bind(ref, id, quando).run();

    } catch (erro) {
        /* idem */
    }

}

/* A aba Marketing do painel: a campanha e o que ela deu.

   As duas contas que o dono procura estão aqui prontas, e não na tela,
   porque conta feita no navegador é conta que diverge quando alguém
   mexe num dos dois lugares:

     custo por pedido = gasto / pedidos
     retorno          = receita / gasto

   Pedido cancelado não entra na receita. Já tínhamos sido mordidos por
   isso no relatório de vendas: venda que não aconteceu inflando número
   que decide compra. */
async function tratarCampanhasDaLoja(request, env, loja, db) {

    const url = new URL(request.url);
    const dias = Math.min(Math.max(parseInt(url.searchParams.get("dias") || "30", 10) || 30, 1), MAX_DIAS_RELATORIO);
    const desde = Date.now() - dias * 86400000;

    let campanhas = [];

    try {

        const linhas = await db.prepare(
            `SELECT c.id, c.nome, c.canal, c.gasto, c.ativa, c.criado_em,

                    COALESCE((SELECT SUM(d.visitas) FROM campanha_dia d
                               WHERE d.campanha = c.id AND d.dia >= ?1), 0) AS visitas,

                    COALESCE((SELECT COUNT(*)
                                FROM pedido_campanha pc
                                JOIN pedidos p ON p.ref = pc.ref
                               WHERE pc.campanha = c.id
                                 AND p.criado_em >= ?2
                                 AND p.status <> 'cancelado'), 0) AS pedidos,

                    COALESCE((SELECT SUM(p.total)
                                FROM pedido_campanha pc
                                JOIN pedidos p ON p.ref = pc.ref
                               WHERE pc.campanha = c.id
                                 AND p.criado_em >= ?2
                                 AND p.status <> 'cancelado'), 0) AS receita

               FROM campanhas c
              ORDER BY c.ativa DESC, c.criado_em DESC
              LIMIT 100`
        ).bind(diaEmSP(desde), desde).all();

        campanhas = linhas.results || [];

    } catch (erro) {
        campanhas = [];
    }

    return json({ dias, campanhas });

}

async function tratarSalvarCampanha(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const nome = texto(corpo.nome, 80);

    if (!nome) return json({ erro: "Dê um nome à campanha." }, 400);

    /* O id sai do nome quando não vem escrito. Pedir ao dono que invente
       um "identificador" separado é pedir que ele entenda uma coisa que
       só existe por causa da URL. */
    const id = limparIdCampanha(corpo.id || nome);

    if (!id) return json({ erro: "Esse nome não vira endereço. Use letras e números." }, 400);

    const canal = CANAIS.includes(corpo.canal) ? corpo.canal : "outro";

    await db.prepare(
        `INSERT INTO campanhas (id, nome, canal, gasto, ativa, criado_em)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET
            nome = excluded.nome, canal = excluded.canal,
            gasto = excluded.gasto, ativa = excluded.ativa`
    ).bind(
        id, nome, canal,
        Math.max(0, numero(corpo.gasto)),
        corpo.ativa === false ? 0 : 1,
        Date.now()
    ).run();

    return json({ ok: true, id });

}

/* Desligar, e não apagar — mesma regra do cupom. A campanha apagada
   levaria junto a resposta de quanto ela vendeu, que é justamente o
   que a loja vai querer olhar no mês que vem, na hora de decidir se
   repete. */
async function tratarExcluirCampanha(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    const id = limparIdCampanha(corpo && corpo.id);

    if (!id) return json({ erro: "Qual campanha?" }, 400);

    await db.prepare(`UPDATE campanhas SET ativa = 0 WHERE id = ?1`).bind(id).run();

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
    const subtotal = numero(corpo.subtotal);
    const frete = numero(corpo.frete);

    /* O cupom é revalidado AQUI, do zero.

       O carrinho já perguntou antes, mas aquela resposta ficou no
       navegador do cliente — e entre a pergunta e o envio cabe de tudo:
       o cupom expirar, acabar o limite, o carrinho mudar de valor, ou
       alguém simplesmente mandar um JSON com o desconto que quiser.
       O que vale é o que esta consulta disser agora.

       Pedido sem cupom não paga nada por isto: o avaliarCupom sai na
       primeira linha quando o código vem vazio. */
    let cupom = null;

    if (limparCupom(corpo.cupom)) {

        const avaliado = await avaliarCupom(db, corpo.cupom, {
            subtotal, frete, telefone
        });

        /* Cupom recusado não derruba o pedido. O cliente mandou a
           compra; recusar tudo por causa de um código vencido seria
           perder a venda para proteger o desconto. Ele entra sem o
           desconto, e a resposta diz por quê — a tela avisa antes de
           abrir o WhatsApp. */
        if (avaliado.valido) cupom = avaliado;

    }

    const desconto = cupom ? cupom.desconto : 0;

    /* O total é RECALCULADO quando há cupom, em vez de aceito como veio.
       É o que fecha o laço: de nada adianta validar o cupom e depois
       gravar o total que o navegador mandou. */
    const total = cupom
        ? Number(Math.max(subtotal + frete - desconto, 0).toFixed(2))
        : numero(corpo.total);

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
            subtotal,
            frete,
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

    /* O uso do cupom entra na MESMA transação do pedido. Separado, um
       erro de rede no meio deixaria o pedido com desconto e o contador
       sem registro — e o cupom "uma vez por pessoa" valeria duas.

       O índice único em `ref` é o que torna o reenvio inofensivo: o
       cliente que clica duas vezes não gasta dois usos. */
    if (cupom) {

        /* Já contado antes? Então este é um reenvio, e o contador não
           pode subir de novo.

           A pergunta é feita ANTES do batch, e não dentro dele com um
           NOT EXISTS: as instruções do batch rodam em sequência, então
           o INSERT acima já teria gravado a linha e o NOT EXISTS seria
           sempre falso — o contador nunca subiria. Escrevi assim na
           primeira versão e o teste do reenvio pegou. */
        const jaContado = await db.prepare(
            `SELECT 1 AS n FROM cupom_usos WHERE ref = ?1`
        ).bind(ref).first();

        comandos.push(
            db.prepare(
                `INSERT INTO cupom_usos (codigo, telefone, ref, desconto, quando)
                 VALUES (?1,?2,?3,?4,?5)
                 ON CONFLICT(ref) DO NOTHING`
            ).bind(cupom.codigo, telefone, ref, desconto, criadoEm)
        );

        if (!jaContado) {
            comandos.push(
                db.prepare(`UPDATE cupons SET usos = usos + 1 WHERE codigo = ?1`)
                    .bind(cupom.codigo)
            );
        }

    }

    // batch roda tudo numa transação: ou o pedido inteiro entra, ou nada
    await db.batch(comandos);

    /* A última etapa do funil, contada aqui e não pelo site: é o único
       lugar que sabe que o pedido entrou mesmo. Fora da transação de
       propósito — um erro na contagem não pode desfazer a venda. */
    await registrarEtapa(db, "pedido", criadoEm);

    /* De onde veio esta venda. Fora da transação pelo mesmo motivo: o
       pedido já entrou, e nenhuma estatística vale desfazê-lo. */
    await registrarPedidoDeCampanha(
        db, ref, limparIdCampanha(corpo.campanha), criadoEm
    );

    return json({
        sucesso: true, ref, itens: linhas.length,
        cupom: cupom ? cupom.codigo : null,
        desconto,
        total
    });

}

/* ========================= LER ========================= */

function janela(url) {

    const dias = Math.min(
        Math.max(parseInt(url.searchParams.get("dias") || "30", 10) || 30, 1),
        MAX_DIAS_RELATORIO
    );

    return { dias, desde: Date.now() - dias * 86400000 };

}

/* =====================================================================
   ESTOQUE — a fotografia diária que vem do PC da farmácia
   =====================================================================

   Quem manda é o agente que roda lá dentro, no mesmo PC e na mesma
   tarefa agendada que já extrai o catálogo. O Firebird do Farmax não é
   acessível pela internet; é por isso que isto é um envio, e não uma
   consulta nossa.

   A diferença para a extração do catálogo é uma linha de SQL, e é a
   linha inteira do problema: a consulta do catálogo termina com
   ESTOQUE > 0, porque não se mostra no site o que não dá para vender.
   Só que ruptura É o produto com estoque zero. A consulta que alimenta
   o site descarta, por definição, tudo que esta tela precisa ver.

   Por isso são duas consultas, e não um ajuste naquela. */

const MAX_ITENS_ESTOQUE = 1000;

/* Lote grande vira lote menor: SQLite tem limite de parâmetros por
   instrução, e 1.000 EANs numa cláusula IN já é bastante. O agente
   manda 6.800 produtos em alguns pedidos; aqui cada um é atômico. */
function emPedacos(lista, tamanho) {
    const pedacos = [];
    for (let i = 0; i < lista.length; i += tamanho) pedacos.push(lista.slice(i, i + tamanho));
    return pedacos;
}

function numeroOuNulo(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

async function tratarEstoqueEnviar(request, env, loja, db) {

    let corpo;
    try { corpo = await request.json(); }
    catch { return json({ erro: "Corpo não é JSON." }, 400); }

    /* A data é a LOCAL da farmácia, mandada por quem está lá. Uma
       extração às 22h em Cuiabá é do dia 14 para a dona da farmácia e
       seria do dia 15 em UTC — o relatório tem de bater com o calendário
       de quem lê. */
    const dia = String(corpo.dia || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
        return json({ erro: "Informe 'dia' no formato AAAA-MM-DD, na data local da farmácia." }, 400);
    }

    const itens = Array.isArray(corpo.produtos) ? corpo.produtos : null;
    if (!itens) return json({ erro: "Informe 'produtos' como lista." }, 400);
    if (itens.length > MAX_ITENS_ESTOQUE) {
        return json({ erro: `No máximo ${MAX_ITENS_ESTOQUE} produtos por envio.` }, 413);
    }

    /* EAN é a chave. Produto sem EAN existe no Farmax (manipulado,
       produto interno), mas não dá para cruzar com venda do site nem
       com catálogo — entra na conta de ninguém, então é descartado aqui
       em vez de virar linha órfã. */
    const limpos = [];
    const vistos = new Set();
    for (const p of itens) {
        const ean = String((p && p.ean) || "").replace(/\D/g, "");
        if (!ean || ean.length > 14) continue;
        if (vistos.has(ean)) continue;
        vistos.add(ean);

        const estoque = numeroOuNulo(p.estoque);
        if (estoque === null) continue;

        limpos.push({
            ean,
            codigo: String(p.codigo || "").slice(0, 30) || null,
            descricao: String(p.descricao || "").slice(0, 200) || null,
            estoque,
            custo: numeroOuNulo(p.custo),
            preco: numeroOuNulo(p.preco),
            minimo: numeroOuNulo(p.minimo),
            validade: /^\d{4}-\d{2}-\d{2}$/.test(String(p.validade || "")) ? String(p.validade) : null
        });
    }

    if (!limpos.length) return json({ ok: true, gravados: 0, movimentos: 0 });

    const agora = Date.now();
    let movimentos = 0;

    for (const pedaco of emPedacos(limpos, 500)) {
        const eans = pedaco.map((p) => p.ean);
        const marcas = eans.map(() => "?").join(",");

        /* O estoque de antes vem de duas fontes, e a ordem importa.

           Se já existe linha de HOJE em estoque_mov, o "antes" dela é o
           começo do dia — e é esse que vale. Usar a foto atual faria a
           segunda extração do dia comparar com a primeira, e a venda do
           dia apareceria picada em pedaços que somam errado quando a
           linha é substituída. */
        const [{ results: fotos = [] }, { results: movsDeHoje = [] }] = await db.batch([
            db.prepare(`SELECT ean, estoque FROM estoque_foto WHERE ean IN (${marcas})`).bind(...eans),
            db.prepare(`SELECT ean, estoque_antes FROM estoque_mov WHERE dia = ? AND ean IN (${marcas})`)
              .bind(dia, ...eans)
        ]);

        const estoqueAnterior = new Map();
        for (const f of fotos) estoqueAnterior.set(f.ean, f.estoque);
        for (const m of movsDeHoje) {
            if (m.estoque_antes !== null) estoqueAnterior.set(m.ean, m.estoque_antes);
        }

        const comandos = [];
        for (const p of pedaco) {
            comandos.push(
                db.prepare(`INSERT INTO estoque_foto
                                (ean, codigo, descricao, estoque, custo, preco, minimo, validade, visto_em)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT (ean) DO UPDATE SET
                                codigo = excluded.codigo, descricao = excluded.descricao,
                                estoque = excluded.estoque, custo = excluded.custo,
                                preco = excluded.preco, minimo = excluded.minimo,
                                validade = excluded.validade, visto_em = excluded.visto_em`)
                  .bind(p.ean, p.codigo, p.descricao, p.estoque, p.custo,
                        p.preco, p.minimo, p.validade, agora)
            );

            /* Produto visto pela primeira vez não gera movimento: não há
               "antes", e tratar a primeira fotografia como entrada
               inventaria uma compra de 6.800 itens no dia da instalação,
               estragando a média de giro do primeiro mês inteiro. */
            if (!estoqueAnterior.has(p.ean)) continue;

            const antes = estoqueAnterior.get(p.ean);
            if (antes === p.estoque) continue;

            const variacao = p.estoque - antes;
            comandos.push(
                db.prepare(`INSERT INTO estoque_mov
                                (ean, dia, estoque_antes, estoque_depois, saida, entrada)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT (ean, dia) DO UPDATE SET
                                estoque_depois = excluded.estoque_depois,
                                saida = excluded.saida, entrada = excluded.entrada`)
                  .bind(p.ean, dia, antes, p.estoque,
                        variacao < 0 ? -variacao : 0,
                        variacao > 0 ? variacao : 0)
            );
            movimentos++;
        }

        await db.batch(comandos);
    }

    return json({ ok: true, dia, gravados: limpos.length, movimentos });
}

/* A tela de estoque: o que rompeu, o que vai romper, o que está parado.

   Tudo sai de duas tabelas e de uma conta só — DIAS DE COBERTURA:

       estoque ÷ média de saída por dia

   É a métrica que responde as três perguntas com o mesmo número. Zero é
   ruptura; abaixo de uma semana é alerta; sem saída nenhuma é encalhe.

   Ordenado por DINHEIRO, nunca por quantidade: 200 unidades de algo de
   R$ 2 importa menos que 8 de algo de R$ 190, e uma lista ordenada por
   quantidade enterra o caro embaixo do barato. */

const DIAS_GIRO = 30;
const DIAS_PARADO = 60;
const COBERTURA_ALERTA = 7;

async function tratarEstoqueAnalise(request, env, loja, db) {

    const url = new URL(request.url);
    const limite = Math.min(
        Math.max(parseInt(url.searchParams.get("limite") || "50", 10) || 50, 1), 200
    );

    const hoje = new Date();
    const diaMenos = (n) => new Date(hoje.getTime() - n * 86400000).toISOString().slice(0, 10);
    const desdeGiro = diaMenos(DIAS_GIRO);
    const desdeParado = diaMenos(DIAS_PARADO);

    /* A saída média por dia de cada produto, no período de giro. O
       denominador é o período inteiro, e não a quantidade de dias com
       movimento: quem vendeu 3 unidades num dia e ficou 29 parado vende
       0,1 por dia, não 3.

       Vem como WITH, e não como subconsulta no meio do FROM, por causa
       da ORDEM DOS PARÂMETROS. Embutida, o "?" dela cai entre os do
       SELECT e os do WHERE, e ligar os valores passa a exigir contar
       interrogações salteadas no texto. Foi exatamente o erro que o
       teste pegou aqui: a consulta rodava, não dava erro nenhum, e
       simplesmente não achava os produtos prestes a acabar. No topo, a
       ordem dos valores é a ordem de leitura. */
    const giro = `
        WITH giro AS (
            SELECT ean, SUM(saida) AS saiu
              FROM estoque_mov
             WHERE dia >= ? AND saida > 0
             GROUP BY ean
        )
    `;

    const [rompidos, vaoRomper, parados, totais] = await db.batch([

        /* Rompeu: está zerado E vinha girando. O "vinha girando" é o que
           separa ruptura de produto que a farmácia simplesmente não
           trabalha — sem ele, a lista viria com milhares de itens que
           nunca tiveram estoque e nunca farão falta. */
        db.prepare(`${giro}
            SELECT f.ean, f.descricao, f.preco, f.custo,
                   g.saiu AS saiu_no_periodo,
                   ROUND(g.saiu * 1.0 / ?, 2) AS media_dia,
                   ROUND(g.saiu * COALESCE(f.preco, 0) / ?, 2) AS venda_perdida_dia
              FROM estoque_foto f
              JOIN giro g ON g.ean = f.ean
             WHERE f.estoque <= 0
             ORDER BY venda_perdida_dia DESC
             LIMIT ?
        `).bind(desdeGiro, DIAS_GIRO, DIAS_GIRO, limite),

        /* Vai romper: ainda tem, mas acaba dentro da semana.
           COBERTURA_ALERTA em dias, e não "estoque < mínimo", porque
           mínimo nem sempre está cadastrado — e quando está, costuma ser
           um número antigo que ninguém revisou. */
        db.prepare(`${giro}
            SELECT f.ean, f.descricao, f.estoque, f.preco, f.minimo,
                   ROUND(g.saiu * 1.0 / ?, 2) AS media_dia,
                   ROUND(f.estoque / (g.saiu * 1.0 / ?), 1) AS dias_cobertura
              FROM estoque_foto f
              JOIN giro g ON g.ean = f.ean
             WHERE f.estoque > 0
               AND f.estoque / (g.saiu * 1.0 / ?) < ?
             ORDER BY dias_cobertura ASC
             LIMIT ?
        `).bind(desdeGiro, DIAS_GIRO, DIAS_GIRO, DIAS_GIRO, COBERTURA_ALERTA, limite),

        /* Parado: tem estoque e não saiu NADA no período longo.
           NOT EXISTS, e não LEFT JOIN com saiu IS NULL, porque o que
           interessa é a ausência de movimento — a tabela de movimento
           não tem linha para quem não se mexeu, e é essa ausência que
           responde a pergunta. */
        db.prepare(`
            SELECT f.ean, f.descricao, f.estoque, f.custo, f.validade,
                   ROUND(f.estoque * COALESCE(f.custo, 0), 2) AS dinheiro_parado
              FROM estoque_foto f
             WHERE f.estoque > 0
               AND NOT EXISTS (
                     SELECT 1 FROM estoque_mov m
                      WHERE m.ean = f.ean AND m.dia >= ? AND m.saida > 0
                   )
             ORDER BY dinheiro_parado DESC
             LIMIT ?
        `).bind(desdeParado, limite),

        /* O total parado é a frase que faz o dono agir, e tem de ser o
           total DE VERDADE — não a soma da lista de cima, que está
           cortada no limite. */
        db.prepare(`
            SELECT COUNT(*) AS itens,
                   ROUND(SUM(f.estoque * COALESCE(f.custo, 0)), 2) AS dinheiro,
                   (SELECT COUNT(*) FROM estoque_foto WHERE estoque <= 0) AS zerados,
                   (SELECT MAX(visto_em) FROM estoque_foto) AS atualizado_em
              FROM estoque_foto f
             WHERE f.estoque > 0
               AND NOT EXISTS (
                     SELECT 1 FROM estoque_mov m
                      WHERE m.ean = f.ean AND m.dia >= ? AND m.saida > 0
                   )
        `).bind(desdeParado)
    ]);

    const resumo = (totais.results && totais.results[0]) || {};

    return json({
        loja,
        /* Dito na resposta, e não só na tela: quem consumir isto por
           outro caminho precisa saber que a saída é ESTIMADA pela
           diferença entre fotografias, e que compra e perda entram na
           mesma conta. Vira exato quando o Farmax abrir a tabela de
           vendas. */
        origem: "diferença entre fotografias diárias de estoque",
        exato: false,
        periodo: { giro: DIAS_GIRO, parado: DIAS_PARADO, alerta_dias: COBERTURA_ALERTA },
        atualizado_em: resumo.atualizado_em || null,
        parado_total: { itens: resumo.itens || 0, dinheiro: resumo.dinheiro || 0 },
        zerados: resumo.zerados || 0,
        rompidos: rompidos.results || [],
        vaoRomper: vaoRomper.results || [],
        parados: parados.results || []
    });
}

/* =====================================================================
   REATIVAÇÃO — a fila que o agente de envio consome
   =====================================================================

   Enquanto a campanha era um clique por vez, a lista podia viver no
   navegador. Com um agente enviando, não pode: ele é outro programa, em
   outra máquina, e precisa saber o que já saiu. Duas mensagens iguais,
   do mesmo número, com o nome trocado, é o que faz alguém bloquear a
   farmácia.

   São quatro rotas, e o desenho é deliberadamente burro — o agente puxa,
   confirma e avisa de quem pediu para parar:

       POST /reativacao/fila       o painel carrega a campanha
       GET  /reativacao/proximos   o agente pega o próximo lote
       POST /reativacao/resultado  o agente diz o que aconteceu
       POST /reativacao/parar      alguém pediu para não receber mais

   SOBRE ENVIAR EM MASSA PELO WHATSAPP

   Vale estar escrito onde quem mexe vai ler: biblioteca não oficial
   (Baileys e parentes) funciona até o dia em que a Meta banir o número,
   e aí a farmácia perde o canal que mais vende junto com o histórico de
   conversa dos clientes. O caminho que sobrevive é a API oficial, que
   exige modelo aprovado e aceite prévio.

   Este worker não escolhe por você — ele entrega a fila. Mas o
   /proximos tem um teto por chamada e devolve o ritmo sugerido, porque
   o jeito mais rápido de queimar um número é despejar mil mensagens em
   dez minutos. */

const MAX_FILA = 2000;
const MAX_LOTE_AGENTE = 50;
const TENTATIVAS_ATE_DESISTIR = 3;

/* Quanto tempo uma linha pode ficar "enviando" antes de voltar para a
   fila. O agente que cai no meio do lote deixa linhas presas; sem isto,
   elas nunca mais seriam oferecidas e a campanha terminaria pela
   metade, sem ninguém perceber. */
const MINUTOS_PRESO = 15;

function telefoneDaFila(valor) {

    const digitos = String(valor || "").replace(/\D/g, "");

    /* 55 + DDD + 9 dígitos. Aceitar menos deixaria entrar na fila um
       número que o agente tentaria mandar e falharia, gastando uma
       tentativa por nada. */
    if (digitos.length < 12 || digitos.length > 13) return "";
    if (!digitos.startsWith("55")) return "";

    return digitos;

}

async function tratarReativacaoCarregar(request, env, loja, db) {

    let corpo;
    try { corpo = await request.json(); }
    catch { return json({ erro: "Corpo não é JSON." }, 400); }

    const itens = Array.isArray(corpo.contatos) ? corpo.contatos : null;
    if (!itens) return json({ erro: "Informe 'contatos' como lista." }, 400);
    if (itens.length > MAX_FILA) {
        return json({ erro: `No máximo ${MAX_FILA} contatos por campanha.` }, 413);
    }

    /* A fila antiga sai inteira. Campanha é de um momento: deixar
       sobras da anterior faria o agente mandar uma mensagem de outubro
       em novembro, com "faz 183 dias" que já não é verdade.

       O bloqueio NÃO sai — ele vale para sempre, e é o que impede quem
       pediu para parar de voltar na campanha seguinte. */
    const bloqueados = new Set(
        ((await db.prepare("SELECT telefone FROM reativacao_bloqueio").all()).results || [])
            .map((b) => b.telefone)
    );

    const agora = Date.now();
    const comandos = [db.prepare("DELETE FROM reativacao_fila")];
    const vistos = new Set();
    let bloqueadosFora = 0;

    for (const item of itens) {

        const telefone = telefoneDaFila(item && item.telefone);
        if (!telefone || vistos.has(telefone)) continue;

        if (bloqueados.has(telefone)) { bloqueadosFora++; continue; }

        const mensagem = String((item && item.mensagem) || "").slice(0, 1000);
        if (!mensagem.trim()) continue;

        vistos.add(telefone);

        comandos.push(
            db.prepare(`INSERT INTO reativacao_fila
                            (telefone, nome, dias, mensagem, situacao, criado_em)
                        VALUES (?, ?, ?, ?, 'espera', ?)`)
              .bind(telefone, String(item.nome || "").slice(0, 120),
                    parseInt(item.dias, 10) || 0, mensagem, agora)
        );

    }

    await db.batch(comandos);

    return json({
        ok: true,
        naFila: vistos.size,
        bloqueadosFora,
        /* Dito na resposta para a tela poder mostrar: a loja precisa
           saber que a fila tem menos gente do que a lista dela, e por
           quê. Silêncio aqui vira "sumiram clientes". */
        recado: bloqueadosFora
            ? `${bloqueadosFora} contato(s) do "não perturbe" ficaram de fora.`
            : ""
    });

}

/* O agente pega o próximo lote. Esta é a única rota que ENTREGA texto
   de mensagem, então o teto por chamada importa: com ele, um agente mal
   configurado em laço gasta a fila devagar em vez de despejar tudo. */
async function tratarReativacaoProximos(request, env, loja, db) {

    const url = new URL(request.url);
    const limite = Math.min(
        Math.max(parseInt(url.searchParams.get("limite") || "10", 10) || 10, 1),
        MAX_LOTE_AGENTE
    );

    const agora = Date.now();

    /* Devolve para a fila o que ficou preso: agente que caiu no meio do
       lote deixa linhas em 'enviando' para sempre. Mas só até um
       limite de tentativas — uma linha que foi pega três vezes e nunca
       voltou tem algo de errado nela, e insistir é girar no mesmo item
       enquanto o resto da campanha espera. */
    await db.prepare(
        `UPDATE reativacao_fila
            SET situacao = CASE WHEN tentativas >= ? THEN 'falhou' ELSE 'espera' END,
                erro = CASE WHEN tentativas >= ? THEN 'sem resposta do agente' ELSE erro END
          WHERE situacao = 'enviando' AND pego_em < ?`
    ).bind(TENTATIVAS_ATE_DESISTIR, TENTATIVAS_ATE_DESISTIR,
           agora - MINUTOS_PRESO * 60000).run();

    const { results = [] } = await db.prepare(
        `SELECT telefone, nome, dias, mensagem
           FROM reativacao_fila
          WHERE situacao = 'espera'
          ORDER BY criado_em
          LIMIT ?`
    ).bind(limite).all();

    if (results.length) {
        const marcas = results.map(() => "?").join(",");
        await db.prepare(
            `UPDATE reativacao_fila
                SET situacao = 'enviando', pego_em = ?, tentativas = tentativas + 1
              WHERE telefone IN (${marcas})`
        ).bind(agora, ...results.map((r) => r.telefone)).run();
    }

    const resumo = await db.prepare(
        `SELECT situacao, COUNT(*) AS n FROM reativacao_fila GROUP BY situacao`
    ).all();

    const conta = {};
    for (const linha of resumo.results || []) conta[linha.situacao] = linha.n;

    return json({
        loja,
        contatos: results,
        restam: conta.espera || 0,
        resumo: conta,
        /* O ritmo vai na resposta, e não só na documentação: quem
           escreve o fluxo no n8n lê isto antes de ler qualquer manual.
           Despejar mil mensagens em dez minutos é o jeito mais rápido
           de queimar o número da farmácia. */
        ritmoSugerido: {
            segundosEntreMensagens: 20,
            porHora: 150,
            porque: "ritmo humano; rajada é o que faz a Meta banir o número"
        }
    });

}

async function tratarReativacaoResultado(request, env, loja, db) {

    let corpo;
    try { corpo = await request.json(); }
    catch { return json({ erro: "Corpo não é JSON." }, 400); }

    const itens = Array.isArray(corpo.resultados) ? corpo.resultados : null;
    if (!itens) return json({ erro: "Informe 'resultados' como lista." }, 400);
    if (itens.length > MAX_LOTE_AGENTE) {
        return json({ erro: `No máximo ${MAX_LOTE_AGENTE} resultados por vez.` }, 413);
    }

    const agora = Date.now();
    const comandos = [];
    let confirmados = 0;

    for (const item of itens) {

        const telefone = telefoneDaFila(item && item.telefone);
        if (!telefone) continue;

        const deuCerto = item.enviado === true;

        comandos.push(
            db.prepare(`UPDATE reativacao_fila
                           SET situacao = ?, enviado_em = ?, erro = ?
                         WHERE telefone = ?`)
              .bind(deuCerto ? "enviado" : "falhou",
                    deuCerto ? agora : null,
                    deuCerto ? null : String(item.erro || "").slice(0, 200),
                    telefone)
        );

        confirmados++;

    }

    if (comandos.length) await db.batch(comandos);

    return json({ ok: true, confirmados });

}

/* Quem pediu para parar. Chamada pelo agente quando o cliente responde
   "sair", e pelo painel quando alguém clica em "não perturbe".

   O bloqueio entra ANTES de tirar da fila, e nos dois casos: se a linha
   sumisse primeiro e o INSERT falhasse, a pessoa voltaria na campanha
   seguinte — insistindo depois de um não. */
async function tratarReativacaoParar(request, env, loja, db) {

    let corpo;
    try { corpo = await request.json(); }
    catch { return json({ erro: "Corpo não é JSON." }, 400); }

    const telefone = telefoneDaFila(corpo && corpo.telefone);
    if (!telefone) return json({ erro: "Telefone inválido." }, 400);

    const motivo = String((corpo && corpo.motivo) || "pediu").slice(0, 40);

    await db.batch([
        db.prepare(`INSERT INTO reativacao_bloqueio (telefone, motivo, criado_em)
                    VALUES (?, ?, ?)
                    ON CONFLICT (telefone) DO UPDATE SET motivo = excluded.motivo`)
          .bind(telefone, motivo, Date.now()),
        db.prepare("DELETE FROM reativacao_fila WHERE telefone = ?").bind(telefone)
    ]);

    const { results = [] } = await db.prepare(
        "SELECT COUNT(*) AS n FROM reativacao_bloqueio"
    ).all();

    return json({ ok: true, telefone, bloqueados: (results[0] && results[0].n) || 0 });

}

async function tratarReativacaoBloqueados(request, env, loja, db) {

    const { results = [] } = await db.prepare(
        "SELECT telefone, motivo, criado_em FROM reativacao_bloqueio ORDER BY criado_em DESC"
    ).all();

    return json({ bloqueados: results });

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

    /* A janela anterior, do mesmo tamanho, imediatamente antes desta.

       Sem ela, "R$ 1.010,28 em 30 dias" não responde à única pergunta
       que a dona da farmácia faz ao abrir esta tela: está melhor ou
       pior? Um número sozinho não diz nada — e, sem comparação, a tela
       vira enfeite que ninguém abre duas vezes. */
    const anteriorDesde = desde - dias * 86400000;

    const [hoje, periodo, anterior, porDia, topProdutos, recentes, aguardando,
           maisProcurados, naoEncontrados] = await db.batch([

        /* PEDIDO CANCELADO NÃO É VENDA.

           Faltava este filtro em toda esta função, e o estrago era
           silencioso: o cancelado somava no faturamento, puxava o
           ticket médio e aparecia em "produtos mais vendidos". A loja
           decidiria compra em cima de venda que não aconteceu — e,
           pior, a conta FICA ERRADA PARA SEMPRE, porque ninguém olha
           duas vezes para um número que parece bom.

           'novo' e 'separando' contam, de propósito: é pedido feito,
           que a loja vai entregar. O que não conta é o que foi
           desfeito. */
        db.prepare(
            `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento
               FROM pedidos WHERE criado_em >= ?1 AND status <> 'cancelado'`
        ).bind(inicioDoDiaSP),

        db.prepare(
            `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento,
                    COALESCE(AVG(total),0) AS ticket
               FROM pedidos WHERE criado_em >= ?1 AND status <> 'cancelado'`
        ).bind(desde),

        db.prepare(
            `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento,
                    COALESCE(AVG(total),0) AS ticket
               FROM pedidos
              WHERE criado_em >= ?1 AND criado_em < ?2 AND status <> 'cancelado'`
        ).bind(anteriorDesde, desde),

        db.prepare(
            `SELECT date((criado_em - 10800000)/1000, 'unixepoch') AS dia,
                    COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento
               FROM pedidos WHERE criado_em >= ?1 AND status <> 'cancelado'
              GROUP BY dia ORDER BY dia`
        ).bind(desde),

        db.prepare(
            `SELECT i.descricao, i.ean,
                    SUM(i.qtd) AS unidades,
                    SUM(i.total_item) AS faturamento
               FROM pedido_itens i
               JOIN pedidos p ON p.ref = i.ref
              WHERE p.criado_em >= ?1 AND p.status <> 'cancelado'
              GROUP BY COALESCE(NULLIF(i.ean,''), i.descricao)
              ORDER BY unidades DESC
              LIMIT 10`
        ).bind(desde),

        db.prepare(
            `SELECT ref, criado_em, cliente, telefone, entrega, pagamento,
                    total, tem_receita, status
               FROM pedidos ORDER BY criado_em DESC LIMIT 15`
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
              LIMIT 10`
        ).bind(desde),

        // procuraram e o site não tinha: cada linha é uma venda perdida
        db.prepare(
            `SELECT termo, COUNT(*) AS buscas, MAX(criado_em) AS ultima
               FROM buscas
              WHERE criado_em >= ?1 AND resultados = 0
              GROUP BY termo ORDER BY buscas DESC, ultima DESC
              LIMIT 10`
        ).bind(desde)

    ]);

    /* O funil vem numa consulta à parte, e não no batch acima, por um
       motivo prático: a tabela é nova, e farmácia que ainda não colou o
       schema-funil.sql derrubaria o relatório INTEIRO se ela entrasse
       no batch — um batch falha por inteiro. Aqui, sem a tabela, o
       funil vem vazio e o resto da tela continua de pé. */
    let funil = {};

    try {

        const linhas = await db.prepare(
            `SELECT etapa, COALESCE(SUM(total), 0) AS total
               FROM funil WHERE dia >= ?1
              GROUP BY etapa`
        ).bind(diaEmSP(desde)).all();

        (linhas.results || []).forEach((l) => { funil[l.etapa] = l.total; });

    } catch (erro) {
        funil = {};
    }

    return json({
        dias,
        hoje: hoje.results[0] || { pedidos: 0, faturamento: 0 },
        periodo: periodo.results[0] || { pedidos: 0, faturamento: 0, ticket: 0 },
        anterior: anterior.results[0] || { pedidos: 0, faturamento: 0, ticket: 0 },
        porDia: porDia.results || [],
        topProdutos: topProdutos.results || [],
        recentes: recentes.results || [],
        aguardandoReceita: (aguardando.results[0] || {}).n || 0,
        maisProcurados: maisProcurados.results || [],
        naoEncontrados: naoEncontrados.results || [],
        funil
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
/* O cupom de cada pedido, em consulta separada.

   A primeira versão disto era um LEFT JOIN na consulta da fila, que é
   mais curto e estava errado: a fila passaria a EXIGIR a tabela
   cupom_usos, e qualquer farmácia que ainda não tivesse colado o
   schema-cupons.sql perderia a tela de pedidos inteira — 500 na /fila.

   Entre implantar o worker e rodar o schema no console há sempre uma
   janela, às vezes de dias quando a farmácia é de outra cidade. E
   segunda-feira entra loja nova. O teste de duas lojas pegou isso
   porque o banco dele não tem a tabela.

   Então: consulta à parte, e sem tabela a resposta é "nenhum cupom".
   A fila continua de pé, que é o que não pode faltar. */
async function cuponsPorRef(db, refs) {

    const mapa = new Map();

    if (!refs.length) return mapa;

    const marcadores = refs.map((_, i) => `?${i + 1}`).join(",");

    try {

        const usos = await db.prepare(
            `SELECT ref, codigo, desconto FROM cupom_usos WHERE ref IN (${marcadores})`
        ).bind(...refs).all();

        (usos.results || []).forEach((u) => mapa.set(u.ref, u));

    } catch (erro) {
        /* Sem a tabela: a loja ainda não rodou o schema de cupons. Não
           é erro de pedido, e o pedido é o que importa agora. */
    }

    return mapa;

}

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

    /* O desconto vai junto porque é a atendente quem vai cobrar. Sem
       isso ela veria um total menor que a soma dos itens e não saberia
       por quê — o caminho mais curto para alguém "corrigir" o valor no
       balcão e cobrar o preço cheio de um cliente que tinha desconto. */
    const cupons = await cuponsPorRef(db, refs);

    return json({
        pedidos: lista.map(p => ({
            ...p,
            itens: porRef.get(p.ref) || [],
            cupom: cupons.get(p.ref)?.codigo || null,
            desconto: cupons.get(p.ref)?.desconto || 0
        })),
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

    /* As de quantidade vêm na MESMA resposta, e numa consulta à parte.

       Na mesma resposta porque o site precisa das duas para montar o
       preço de um produto, e duas idas ao worker fariam a vitrine
       piscar o preço de tabela antes de corrigi-lo.

       Em consulta à parte, fora do mesmo prepare, porque a tabela é
       nova: farmácia que ainda não colou o schema-promo-quantidade
       derrubaria TODAS as promoções se esta consulta pudesse falhar
       junto. Aqui ela falha sozinha e o resto continua de pé. */
    let quantidade = [];

    try {

        const extra = await db.prepare(
            `SELECT codigo, tipo, leve, pague, quantidade, preco
               FROM promocao_quantidade
              WHERE ativo = 1
                AND (inicio IS NULL OR inicio = '' OR inicio <= ?1)
                AND (fim    IS NULL OR fim    = '' OR fim    >= ?1)`
        ).bind(hoje).all();

        quantidade = extra.results || [];

    } catch (erro) {
        quantidade = [];
    }

    return json({ promocoes: results || [], quantidade });

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

    let quantidade = [];

    try {
        const extra = await db.prepare(
            `SELECT codigo, tipo, leve, pague, quantidade, preco,
                    inicio, fim, ativo, lote, criado_em
               FROM promocao_quantidade ORDER BY criado_em DESC`
        ).all();
        quantidade = extra.results || [];
    } catch (erro) {
        quantidade = [];
    }

    return json({
        promocoes: results || [],
        lotes: lotes.results || [],
        quantidade
    });

}

/* As ofertas de quantidade. O painel manda uma por vez — são feitas a
   dedo, produto a produto, ao contrário da promoção em massa por
   percentual. */
const TIPOS_DE_OFERTA = ["leve-pague", "pacote"];

async function tratarSalvarPromoQuantidade(request, env, loja, db) {

    const corpo = await request.json().catch(() => null);
    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    /* Um código ou muitos: "leve 3 pague 2 em todas as fraldas Pompom"
       é uma campanha de verdade, e marcar cinco produtos para repetir o
       mesmo cadastro cinco vezes é o tipo de trabalho que faz a loja
       desistir da promoção. */
    const codigos = (Array.isArray(corpo.codigos) ? corpo.codigos : [corpo.codigo])
        .map((c) => texto(c, 40)).filter(Boolean);

    if (!codigos.length) return json({ erro: "Qual produto?" }, 400);
    if (codigos.length > MAX_PROMOCOES_POR_LOTE) {
        return json({ erro: `Máximo de ${MAX_PROMOCOES_POR_LOTE} produtos por vez.` }, 400);
    }

    const tipo = TIPOS_DE_OFERTA.includes(corpo.tipo) ? corpo.tipo : "";
    if (!tipo) return json({ erro: "Tipo de oferta desconhecido." }, 400);

    const leve = Math.max(0, Math.round(numero(corpo.leve)));
    const pague = Math.max(0, Math.round(numero(corpo.pague)));
    const quantidade = Math.max(0, Math.round(numero(corpo.quantidade)));
    const preco = Number(numero(corpo.preco).toFixed(2));

    /* As mesmas recusas do promoQtd.js, repetidas aqui de propósito. A
       tela já avisa antes de salvar, mas a tela é do lado de fora: quem
       guarda o que a loja prometeu ao cliente não pode depender de um
       JavaScript que qualquer um reescreve. */
    if (tipo === "leve-pague") {
        if (leve < 2) return json({ erro: "A oferta precisa valer a partir de 2 unidades." }, 400);
        if (pague < 1 || pague >= leve) {
            return json({ erro: `Pagar ${pague} levando ${leve} não é promoção.` }, 400);
        }
    } else {
        if (quantidade < 2) return json({ erro: "A oferta precisa valer a partir de 2 unidades." }, 400);
        if (preco <= 0) return json({ erro: "Quanto custa o pacote?" }, 400);
    }

    const inicio = dataISO(corpo.inicio);
    const fim = dataISO(corpo.fim);
    if (inicio && fim && fim < inicio) {
        return json({ erro: "A data final não pode ser antes da inicial." }, 400);
    }

    const ativo = corpo.ativo === false ? 0 : 1;
    const lote = texto(corpo.lote, 60) || null;
    const agora = Date.now();

    try {

        /* Uma transação só, como no lote de percentual: meio lote de
           promoção aplicado é pior que nenhum, porque ninguém sabe
           onde parou. */
        await db.batch(codigos.map((codigo) =>
            db.prepare(
                `INSERT INTO promocao_quantidade
                    (codigo, tipo, leve, pague, quantidade, preco,
                     inicio, fim, ativo, lote, criado_em)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
                 ON CONFLICT(codigo) DO UPDATE SET
                    tipo = excluded.tipo, leve = excluded.leve,
                    pague = excluded.pague, quantidade = excluded.quantidade,
                    preco = excluded.preco, inicio = excluded.inicio,
                    fim = excluded.fim, ativo = excluded.ativo,
                    lote = excluded.lote, criado_em = excluded.criado_em`
            ).bind(
                codigo, tipo, leve, pague, quantidade, preco,
                inicio, fim, ativo, lote, agora
            )
        ));

    } catch (erro) {
        /* Aqui o silêncio seria o pior serviço possível: a loja
           montaria o encarte achando que a oferta está no ar. */
        return json({
            erro: "Não consegui gravar a oferta. Se esta farmácia é nova, "
                + "falta rodar o schema-promo-quantidade.sql no banco dela."
        }, 500);
    }

    return json({ sucesso: true, gravados: codigos.length, lote });

}

async function tratarExcluirPromoQuantidade(request, env, loja, db) {

    const corpo = await request.json().catch(() => ({}));

    const lote = texto(corpo.lote, 60);

    try {

        if (lote) {
            const r = await db.prepare(
                `DELETE FROM promocao_quantidade WHERE lote = ?1`).bind(lote).run();
            return json({ sucesso: true, apagados: r.meta?.changes ?? 0 });
        }

        const codigos = (Array.isArray(corpo.codigos) ? corpo.codigos : [corpo.codigo])
            .map((c) => texto(c, 40)).filter(Boolean);

        if (!codigos.length) return json({ erro: "Informe 'codigo', 'codigos' ou 'lote'." }, 400);
        if (codigos.length > MAX_PROMOCOES_POR_LOTE) {
            return json({ erro: `Máximo de ${MAX_PROMOCOES_POR_LOTE} por vez.` }, 400);
        }

        const marcadores = codigos.map((_, i) => `?${i + 1}`).join(",");
        const r = await db.prepare(
            `DELETE FROM promocao_quantidade WHERE codigo IN (${marcadores})`
        ).bind(...codigos).run();

        return json({ sucesso: true, apagados: r.meta?.changes ?? 0 });

    } catch (erro) {
        return json({ erro: "Não consegui apagar a oferta." }, 500);
    }

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

    const codigo = texto(ref, 40);

    /* De quem é este pedido: preciso saber ANTES de mudar o status,
       porque o resumo do cliente vai ser refeito a partir dele. */
    const dono = await db.prepare(
        `SELECT telefone FROM pedidos WHERE ref = ?1`
    ).bind(codigo).first();

    const comandos = [
        db.prepare(`UPDATE pedidos SET status = ?2 WHERE ref = ?1`).bind(codigo, status)
    ];

    /* A tabela `clientes` é um RESUMO dos pedidos — quantos, quanto
       gastou —, somado na hora em que o pedido entra. Cancelar não
       desfazia essa soma: o cliente ficava com um pedido e um valor que
       não existem mais, e a aba Reativação passava a tratá-lo como
       alguém que já comprou mais do que comprou.

       Em vez de subtrair (que erra assim que alguém cancela duas vezes
       ou reabre um pedido), o resumo é RECALCULADO a partir dos pedidos
       que sobraram. Fica certo por definição, inclusive se o status for
       e voltar. */
    if (dono && dono.telefone) {

        comandos.push(
            db.prepare(
                `UPDATE clientes SET
                    pedidos = (SELECT COUNT(*) FROM pedidos p
                                WHERE p.telefone = clientes.telefone
                                  AND p.status <> 'cancelado'),
                    total_gasto = (SELECT COALESCE(SUM(p.total),0) FROM pedidos p
                                    WHERE p.telefone = clientes.telefone
                                      AND p.status <> 'cancelado')
                  WHERE telefone = ?1`
            ).bind(dono.telefone)
        );

        /* Cancelado também devolve o cupom. Senão o cliente que teve o
           pedido cancelado — por falta do produto, por exemplo — fica
           sem poder usar de novo o cupom que ele nunca chegou a
           aproveitar. */
        if (status === "cancelado") {
            comandos.push(db.prepare(`DELETE FROM cupom_usos WHERE ref = ?1`).bind(codigo));
            comandos.push(
                db.prepare(
                    `UPDATE cupons SET usos = (
                        SELECT COUNT(*) FROM cupom_usos u WHERE u.codigo = cupons.codigo)`
                )
            );
        }

    }

    /* O DELETE de cupom_usos pode falhar na farmácia que ainda não
       colou o schema-cupons.sql. Cancelar um pedido não pode depender
       disso: se der erro, o status muda assim mesmo. */
    let alterados = 0;

    try {
        const saidas = await db.batch(comandos);
        alterados = saidas[0]?.meta?.changes ?? 0;
    } catch (erro) {
        const r = await db.prepare(`UPDATE pedidos SET status = ?2 WHERE ref = ?1`)
            .bind(codigo, status).run();
        alterados = r.meta?.changes ?? 0;
    }

    return json({ sucesso: true, alterados });

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

            /* Conferir cupom: público, porque quem pergunta é o carrinho
               antes de o cliente fechar o pedido.

               Com teto por acesso, e aqui ele não é formalidade: sem
               limite, este endereço vira uma máquina de adivinhar código
               — tenta "NATAL10", "BLACK20", "FRETE" até achar. O mesmo
               teto dos pedidos serve, porque ninguém digita cupom
               dezenas de vezes por hora. */
            if (request.method === "POST" && rota === "/cupom/validar") {
                const cheio = await barrarRotaPublica(
                    env, request, "cupom", LIMITE_PEDIDOS_HORA,
                    "Muitas tentativas de cupom deste acesso. Tente mais tarde."
                );
                if (cheio) return cheio;
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarCupomValidar(request, env, alvo.db);
            }

            /* O funil: uma linha por etapa, sem identificador nenhum.

               Com o mesmo teto das buscas, que é folgado de propósito:
               se um bairro inteiro sai pelo mesmo IP, perder contagem
               de visita é melhor que barrar gente de verdade — e um
               funil com buraco ainda mostra onde a conta cai. */
            if (request.method === "POST" && rota === "/funil") {
                const cheio = await barrarRotaPublica(
                    env, request, "funil", LIMITE_BUSCAS_HORA,
                    "Muitos acessos deste endereço em pouco tempo."
                );
                if (cheio) return cheio;
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarFunil(request, env, alvo.db);
            }

            /* De onde a visita veio. Mesmo teto do funil e da busca, e
               mesma tolerância: perder contagem de um bairro que sai
               pelo mesmo IP é melhor que barrar cliente. */
            if (request.method === "POST" && rota === "/campanha") {
                const cheio = await barrarRotaPublica(
                    env, request, "campanha", LIMITE_BUSCAS_HORA,
                    "Muitos acessos deste endereço em pouco tempo."
                );
                if (cheio) return cheio;
                const alvo = await lojaPublicaDaURL(request, env);
                if (alvo.recusa) return alvo.recusa;
                return await tratarVisitaDeCampanha(request, env, alvo.db);
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

            /* Estoque: o agente da farmácia envia, o painel lê. Os dois
               passam pelo mesmo portão acima, então o envio já chega
               amarrado à loja que provou a senha — não há "?loja=" aqui
               para alguém apontar para o estoque da concorrente. */
            if (request.method === "POST" && rota === "/estoque")         return await tratarEstoqueEnviar(request, env, loja, db);
            if (request.method === "GET"  && rota === "/estoque/analise") return await tratarEstoqueAnalise(request, env, loja, db);

            /* Reativação. O agente de envio passa pelo MESMO portão do
               painel: ele entra com a senha daquela farmácia, e por isso
               a fila que ele enxerga é a dela e só a dela. Não há
               "?loja=" aqui para apontar para a carteira de clientes da
               concorrente. */
            if (request.method === "POST" && rota === "/reativacao/fila")       return await tratarReativacaoCarregar(request, env, loja, db);
            if (request.method === "GET"  && rota === "/reativacao/proximos")   return await tratarReativacaoProximos(request, env, loja, db);
            if (request.method === "POST" && rota === "/reativacao/resultado")  return await tratarReativacaoResultado(request, env, loja, db);
            if (request.method === "POST" && rota === "/reativacao/parar")      return await tratarReativacaoParar(request, env, loja, db);
            if (request.method === "GET"  && rota === "/reativacao/bloqueados") return await tratarReativacaoBloqueados(request, env, loja, db);

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

            if (request.method === "GET"  && rota === "/cupons")         return await tratarCuponsDaLoja(request, env, loja, db);
            if (request.method === "POST" && rota === "/cupons")         return await tratarSalvarCupom(request, env, loja, db);
            if (request.method === "POST" && rota === "/cupons/excluir") return await tratarExcluirCupom(request, env, loja, db);

            if (request.method === "GET"  && rota === "/campanhas")         return await tratarCampanhasDaLoja(request, env, loja, db);
            if (request.method === "POST" && rota === "/campanhas")         return await tratarSalvarCampanha(request, env, loja, db);
            if (request.method === "POST" && rota === "/campanhas/excluir") return await tratarExcluirCampanha(request, env, loja, db);

            if (request.method === "GET"  && rota === "/promocoes/todas")   return await tratarPromocoesDaLoja(request, env, loja, db);
            if (request.method === "POST" && rota === "/promocoes")         return await tratarSalvarPromocoes(request, env, loja, db);
            if (request.method === "POST" && rota === "/promocoes/excluir") return await tratarExcluirPromocoes(request, env, loja, db);

            if (request.method === "POST" && rota === "/promocoes/quantidade")         return await tratarSalvarPromoQuantidade(request, env, loja, db);
            if (request.method === "POST" && rota === "/promocoes/quantidade/excluir") return await tratarExcluirPromoQuantidade(request, env, loja, db);

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
