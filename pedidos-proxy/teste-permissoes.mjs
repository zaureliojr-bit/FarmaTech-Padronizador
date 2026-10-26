/* Quem mexe em quê.

   O painel é o mesmo para duas pessoas com trabalhos diferentes. A
   farmácia atende: pedido, status, estoque, preço. Quem administra a
   plataforma monta vitrine e campanha: banner, encarte, cupom, anúncio.

   A separação não é hierarquia, é escopo — e vale dinheiro: cupom é
   desconto saindo do caixa, banner e encarte são propaganda publicada
   para o cliente, campanha é verba de anúncio.

   O QUE ESTE TESTE PROTEGE

   1. ESCONDER A ABA NÃO É PERMISSÃO. O endereço do worker é público;
      qualquer um monta a mesma requisição com a senha da loja. Se a
      recusa morasse só na tela, ela não existiria.

   2. O QUE A LOJA PRECISA CONTINUA ABERTO. Uma trava larga demais é
      pior que nenhuma: a farmácia para de operar e liga reclamando, e o
      conserto às pressas é o que reabre o que não devia.

   3. A VITRINE NÃO DEPENDE DE SENHA. Banner e encarte são lidos pelo
      site, por qualquer cliente. Uma trava que alcançasse a leitura
      pública apagaria a vitrine de todas as lojas de uma vez — e o
      sintoma ("sumiram os banners") não apontaria para permissão.

   Uso: node teste-permissoes.mjs
*/

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

const ler = (nome) => readFileSync(new URL("./" + nome, import.meta.url), "utf8");

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

function fingirD1(db) {
    const traduzir = (sql, ligados) => {
        const usados = [];
        const novo = sql.replace(/\?(\d+)/g, (_, n) => {
            usados.push(ligados[Number(n) - 1]);
            return "?";
        });
        return [novo, usados.length ? usados : ligados];
    };
    return {
        prepare(sql) {
            let ligados = [];
            const stmt = {
                _sql: sql,
                get _ligados() { return ligados; },
                bind(...a) { ligados = a; return stmt; },
                async first() { const [s, a] = traduzir(sql, ligados); return db.prepare(s).get(...a) ?? null; },
                async all() { const [s, a] = traduzir(sql, ligados); return { results: db.prepare(s).all(...a) }; },
                async run() {
                    const [s, a] = traduzir(sql, ligados);
                    const r = db.prepare(s).run(...a);
                    return { success: true, meta: { changes: r.changes } };
                }
            };
            return stmt;
        },
        async batch(comandos) {
            const saidas = [];
            for (const c of comandos) {
                const [s, a] = traduzir(c._sql, c._ligados);
                if (/^\s*(select|with)\b/i.test(c._sql)) {
                    saidas.push({ results: db.prepare(s).all(...a), success: true });
                } else {
                    const r = db.prepare(s).run(...a);
                    saidas.push({ results: [], success: true, meta: { changes: r.changes } });
                }
            }
            return saidas;
        }
    };
}

const CHAVE_DONO = "chave-de-dono";
const SENHA_DA_LOJA = "senha-do-balcao";

const banco = new DatabaseSync(":memory:");
banco.exec(ler("schema-lojas-colar.sql"));
banco.exec(ler("schema-acesso-colar.sql"));
banco.exec(ler("schema-colar.sql"));
banco.exec(ler("schema-cupons-colar.sql"));
banco.exec(ler("schema-campanhas-colar.sql"));
banco.exec(ler("schema-estoque-colar.sql"));
banco.exec(ler("schema-reativacao-colar.sql"));

const env = { DB: fingirD1(banco), PAINEL_KEY: SENHA_DA_LOJA, DONO_KEY: CHAVE_DONO };

function pedir(caminho, { metodo = "GET", corpo, chave } = {}) {
    const cabecalhos = { "CF-Connecting-IP": "1.2.3.4" };
    if (chave) cabecalhos["X-Painel-Key"] = chave;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo, headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

const comoLoja = (caminho, opcoes = {}) => pedir(caminho, { ...opcoes, chave: SENHA_DA_LOJA });
const comoDono = (caminho, opcoes = {}) => pedir(caminho, { ...opcoes, chave: CHAVE_DONO });

/* As quatro telas, com uma leitura e uma escrita de cada: a trava tem de
   pegar os dois lados. Ler a lista de cupons já entrega quais promoções
   a loja tem no ar. */
const TELAS_DO_DONO = [
    ["Cupons — ler",      "/cupons",              "GET"],
    ["Cupons — criar",    "/cupons",              "POST", { codigo: "TESTE", tipo: "valor", valor: 10 }],
    ["Cupons — desligar", "/cupons/excluir",      "POST", { codigo: "TESTE" }],
    ["Banners — ler",     "/banners/todos",       "GET"],
    ["Banners — salvar",  "/banners",             "POST", { titulo: "X" }],
    ["Banners — excluir", "/banners/excluir",     "POST", { id: 1 }],
    ["Encarte — ler",     "/encartes",            "GET"],
    ["Encarte — salvar",  "/encartes",            "POST", { titulo: "Outubro" }],
    ["Encarte — excluir", "/encartes/excluir",    "POST", { id: 1 }],
    ["Marketing — ler",   "/campanhas",           "GET"],
    ["Marketing — criar", "/campanhas",           "POST", { nome: "Instagram", canal: "instagram" }],
    ["Marketing — tirar", "/campanhas/excluir",   "POST", { id: "instagram" }],
    /* O envio de arquivo serve banner e encarte: aberto para a loja,
       ele seria a porta dos fundos das duas telas. */
    ["Arquivo — enviar",  "/arquivos?pasta=banner", "POST", { nada: 1 }]
];

/* ---- 1. a loja não alcança as quatro telas --------------------------- */
console.log("\n1. entrando com a senha da loja");
{
    for (const [nome, caminho, metodo, corpo] of TELAS_DO_DONO) {
        const r = await comoLoja(caminho, { metodo, corpo });
        conferir(`${nome}: recusado`, r.status === 403, String(r.status));
    }

    /* A recusa diz o que fazer. "403" sozinho faz a farmácia achar que o
       site quebrou e ligar perguntando. */
    const r = await comoLoja("/cupons");
    const erro = (await r.json()).erro || "";
    conferir("e a recusa explica a quem recorrer",
        /administra a plataforma|quem instalou/i.test(erro), erro);
}

/* ---- 2. o dono alcança -------------------------------------------- */
console.log("\n2. entrando com a chave de dono");
{
    for (const [nome, caminho, metodo, corpo] of TELAS_DO_DONO) {
        const r = await comoDono(caminho, { metodo, corpo });
        /* Não interessa se a operação deu certo — interessa que não foi
           barrada por permissão. Um corpo mal montado pode dar 400, e
           isso é outro assunto. */
        conferir(`${nome}: passa pela trava`, r.status !== 403, String(r.status));
    }
}

/* ---- 3. o que a loja continua fazendo -------------------------------- */
console.log("\n3. a farmácia continua operando");
{
    /* Trava larga demais é pior que nenhuma: a loja para de atender e
       liga reclamando, e o conserto às pressas é o que reabre o que não
       devia. Estas são as telas do dia a dia dela. */
    const DO_BALCAO = [
        ["Pedidos",            "/fila",                  "GET"],
        ["Relatórios",         "/resumo?dias=30",        "GET"],
        ["Clientes",           "/clientes",              "GET"],
        ["Mudar status",       "/status",                "POST", { ref: "X", status: "entregue" }],
        ["Promoções — ler",    "/promocoes/todas",       "GET"],
        ["Promoções — aplicar", "/promocoes",            "POST", { itens: [{ codigo: "1", preco: 5 }] }],
        ["Oferta de quantidade", "/promocoes/quantidade", "POST",
            { codigo: "1", tipo: "pacote", quantidade: 3, preco: 10 }],
        ["Estoque",            "/estoque/analise",       "GET"],
        ["Reativação",         "/reativacao/proximos",   "GET"]
    ];

    for (const [nome, caminho, metodo, corpo] of DO_BALCAO) {
        const r = await comoLoja(caminho, { metodo, corpo });
        conferir(`${nome}: segue aberto`, r.status !== 403, String(r.status));
    }
}

/* ---- 4. a vitrine não depende de senha -------------------------------- */
console.log("\n4. o que o cliente lê continua público");
{
    /* Uma trava que alcançasse a leitura pública apagaria a vitrine de
       todas as lojas de uma vez — e "sumiram os banners" não apontaria
       para permissão nenhuma. */
    const PUBLICAS = [
        ["Banners da vitrine", "/banners"],
        ["Encarte do mês",     "/encarte"],
        ["Promoções do site",  "/promocoes"]
    ];

    for (const [nome, caminho] of PUBLICAS) {
        const r = await pedir(caminho);
        conferir(`${nome}: aberto sem senha`, r.status === 200, String(r.status));
    }

    /* O cupom que o cliente digita no carrinho é validado por rota
       pública, e tem de continuar assim: quem usa cupom não tem senha
       de painel nenhuma. */
    const cupom = await pedir("/cupom/validar", {
        metodo: "POST", corpo: { codigo: "QUALQUER", subtotal: 50, frete: 0 }
    });
    conferir("Cupom do carrinho: validado sem senha", cupom.status === 200,
        String(cupom.status));
}

/* ---- 5. sem chave nenhuma --------------------------------------------- */
console.log("\n5. sem senha");
{
    /* 401 e não 403: quem não provou quem é para antes, e a trava de
       escopo nem chega a ser consultada. */
    const r = await pedir("/cupons");
    conferir("quem não entrou leva 401", r.status === 401, String(r.status));
}

/* ---- 6. a loja nem sabe o que existe ---------------------------------- */
console.log("\n6. a trava pega o caminho, não a palavra");
{
    /* Variações do mesmo endereço não podem escapar. É o tipo de furo
       que aparece quando a checagem compara texto exato. */
    const VARIACOES = [
        "/cupons/",
        "/campanhas/excluir",
        "/encartes/excluir",
        "/banners/imagem"
    ];

    for (const caminho of VARIACOES) {
        const r = await comoLoja(caminho, { metodo: "POST", corpo: {} });
        conferir(`${caminho}: recusado`, r.status === 403, String(r.status));
    }

    /* E não pode pegar demais: "/promocoes" começa com outra coisa, mas
       "/encarte" (singular, da vitrine) é vizinho de "/encartes". */
    const vitrine = await pedir("/encarte");
    conferir("/encarte (singular) continua público", vitrine.status === 200,
        String(vitrine.status));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
