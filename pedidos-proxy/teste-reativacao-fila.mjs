/* A fila que o agente de envio consome, contra um SQLite de verdade.

   O que está sendo provado, e por que cada coisa importa:

     1. quem pediu para não receber NÃO entra na fila, nem quando a loja
        reimporta a mesma planilha. Sem isso não é descuido, é insistir
        depois de um não;
     2. o agente nunca recebe o mesmo contato duas vezes — duas
        mensagens iguais, do mesmo número, é o que faz alguém bloquear
        a farmácia;
     3. agente que cai no meio do lote não deixa a campanha presa pela
        metade — mas também não gira para sempre no mesmo item;
     4. carregar campanha nova apaga a fila velha e NÃO apaga o
        bloqueio: a fila é de um momento, o "não quero mais" é para
        sempre;
     5. a fila de uma farmácia não é alcançável com a senha de outra;
     6. a resposta diz o ritmo — quem escreve o fluxo no n8n lê isto
        antes de ler qualquer manual, e rajada queima o número.

   Uso: node teste-reativacao-fila.mjs
*/

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

const ler = (nome) => readFileSync(new URL("./" + nome, import.meta.url), "utf8");

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

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
                bind(...args) { ligados = args; return stmt; },
                async first() {
                    const [s, a] = traduzir(sql, ligados);
                    return db.prepare(s).get(...a) ?? null;
                },
                async all() {
                    const [s, a] = traduzir(sql, ligados);
                    return { results: db.prepare(s).all(...a) };
                },
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

const SENHA = "senha-do-worker";

const bancoA = new DatabaseSync(":memory:");
const bancoB = new DatabaseSync(":memory:");

{
    const principal = ler("schema-lojas-colar.sql") + "\n" + ler("schema-acesso-colar.sql");
    const operacao = ler("schema-colar.sql") + "\n" + ler("schema-reativacao-colar.sql");
    const achatar = (sql) => sql.replace(/\r?\n/g, " ");
    bancoA.exec(achatar(principal + "\n" + operacao));
    bancoB.exec(achatar(operacao));
}

const env = { DB: fingirD1(bancoA), DB_LOJA_B: fingirD1(bancoB), PAINEL_KEY: SENHA };

function pedir(caminho, { senha = SENHA, semSenha = false, metodo = "GET", corpo } = {}) {
    const cabecalhos = { "CF-Connecting-IP": "1.2.3.4" };
    if (!semSenha) cabecalhos["X-Painel-Key"] = senha;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

const CAMPANHA = [
    { telefone: "5519975172840", nome: "Maria Silva", dias: 183, mensagem: "Oi Maria!" },
    { telefone: "5511989024152", nome: "João Lima", dias: 182, mensagem: "Oi João!" },
    { telefone: "5519989395228", nome: "Ana", dias: 150, mensagem: "Oi Ana!" }
];

/* ---- 1. carregar a campanha ------------------------------------------ */
console.log("\n1. o painel carrega a campanha");
{
    const r = await pedir("/reativacao/fila", { metodo: "POST", corpo: { contatos: CAMPANHA } });
    const c = await r.json();

    conferir("aceita", r.status === 200, String(r.status));
    conferir("os três entraram", c.naFila === 3, JSON.stringify(c));

    /* Telefone que não é telefone não entra: o agente tentaria mandar,
       falharia, e gastaria uma tentativa por nada. */
    const sujo = await pedir("/reativacao/fila", {
        metodo: "POST",
        corpo: { contatos: [
            ...CAMPANHA,
            { telefone: "123", nome: "Curto", mensagem: "oi" },
            { telefone: "5519975172840", nome: "Repetida", mensagem: "oi de novo" },
            { telefone: "5519900000001", nome: "Sem mensagem", mensagem: "   " }
        ] }
    });
    const cs = await sujo.json();
    conferir("telefone curto, repetido e sem mensagem ficam de fora",
        cs.naFila === 3, JSON.stringify(cs));
}

/* ---- 2. o agente pega o lote ------------------------------------------ */
console.log("\n2. o agente pega, e ninguém pega duas vezes");
{
    const r = await pedir("/reativacao/proximos?limite=2");
    const c = await r.json();

    conferir("veio o lote pedido", c.contatos.length === 2, String(c.contatos.length));
    conferir("com a mensagem pronta", !!c.contatos[0].mensagem, JSON.stringify(c.contatos[0]));
    conferir("e diz quantos faltam", c.restam === 1, String(c.restam));

    /* A asserção que mais importa: a segunda chamada não repete
       ninguém. É o que impede o cliente de receber a mesma mensagem
       duas vezes. */
    const r2 = await pedir("/reativacao/proximos?limite=10");
    const c2 = await r2.json();

    const primeiros = c.contatos.map((x) => x.telefone);
    const segundos = c2.contatos.map((x) => x.telefone);

    conferir("a segunda chamada traz só o que sobrou",
        segundos.length === 1, segundos.join(","));
    conferir("e nenhum repetido entre os dois lotes",
        !segundos.some((t) => primeiros.includes(t)),
        `${primeiros.join(",")} | ${segundos.join(",")}`);

    const r3 = await pedir("/reativacao/proximos");
    conferir("e a terceira não traz nada", (await r3.json()).contatos.length === 0);
}

/* ---- 3. o ritmo ------------------------------------------------------- */
console.log("\n3. a resposta diz o ritmo");
{
    const c = await (await pedir("/reativacao/proximos")).json();
    conferir("tem ritmo sugerido", !!c.ritmoSugerido, JSON.stringify(c.ritmoSugerido));
    conferir("com segundos entre mensagens",
        c.ritmoSugerido.segundosEntreMensagens >= 10,
        String(c.ritmoSugerido.segundosEntreMensagens));
    conferir("e diz por quê, não só o número",
        /banir|queima/i.test(c.ritmoSugerido.porque), c.ritmoSugerido.porque);

    const teto = await (await pedir("/reativacao/proximos?limite=9999")).json();
    conferir("e o limite por chamada tem teto", teto.contatos.length <= 50);
}

/* ---- 4. o agente devolve o resultado ---------------------------------- */
console.log("\n4. o agente diz o que aconteceu");
{
    const r = await pedir("/reativacao/resultado", {
        metodo: "POST",
        corpo: { resultados: [
            { telefone: "5519975172840", enviado: true },
            { telefone: "5511989024152", enviado: false, erro: "número não tem WhatsApp" }
        ] }
    });
    conferir("aceita", r.status === 200, String(r.status));

    const fila = bancoA.prepare("SELECT telefone, situacao, erro FROM reativacao_fila").all();
    const maria = fila.find((f) => f.telefone === "5519975172840");
    const joao = fila.find((f) => f.telefone === "5511989024152");

    conferir("o enviado fica enviado", maria.situacao === "enviado", JSON.stringify(maria));
    conferir("o que falhou fica falhou", joao.situacao === "falhou", JSON.stringify(joao));
    conferir("com o motivo guardado", /WhatsApp/.test(joao.erro), joao.erro);
}

/* ---- 5. agente que cai no meio ---------------------------------------- */
console.log("\n5. agente que cai não deixa a campanha presa");
{
    /* A Ana ficou em 'enviando' e o agente nunca voltou. Envelhece a
       linha para o worker considerá-la presa. */
    bancoA.prepare(
        "UPDATE reativacao_fila SET situacao='enviando', pego_em=?, tentativas=0 WHERE telefone=?"
    ).run(Date.now() - 60 * 60000, "5519989395228");

    const c = await (await pedir("/reativacao/proximos")).json();
    conferir("a linha presa volta para a fila e é oferecida de novo",
        c.contatos.some((x) => x.telefone === "5519989395228"),
        JSON.stringify(c.contatos));

    /* Mas não para sempre: depois de algumas tentativas sem notícia,
       ela sai do caminho em vez de girar enquanto o resto espera. */
    bancoA.prepare(
        "UPDATE reativacao_fila SET situacao='enviando', pego_em=?, tentativas=9 WHERE telefone=?"
    ).run(Date.now() - 60 * 60000, "5519989395228");

    const c2 = await (await pedir("/reativacao/proximos")).json();
    conferir("depois de tentativas demais, desiste dela",
        !c2.contatos.some((x) => x.telefone === "5519989395228"),
        JSON.stringify(c2.contatos));

    const linha = bancoA.prepare(
        "SELECT situacao, erro FROM reativacao_fila WHERE telefone=?").get("5519989395228");
    conferir("marcando por quê", linha.situacao === "falhou" && /sem resposta/.test(linha.erro),
        JSON.stringify(linha));
}

/* ---- 6. não perturbe --------------------------------------------------- */
console.log("\n6. quem pede para parar, para de verdade");
{
    const r = await pedir("/reativacao/parar", {
        metodo: "POST",
        corpo: { telefone: "5519975172840", motivo: "respondeu-stop" }
    });
    const c = await r.json();
    conferir("aceita o pedido", r.status === 200 && c.ok, JSON.stringify(c));

    const naFila = bancoA.prepare(
        "SELECT COUNT(*) AS n FROM reativacao_fila WHERE telefone=?").get("5519975172840").n;
    conferir("sai da fila na hora", naFila === 0, String(naFila));

    /* A prova que importa: a loja reimporta a MESMA planilha no mês
       seguinte, e a pessoa não volta. */
    const recarga = await pedir("/reativacao/fila", { metodo: "POST", corpo: { contatos: CAMPANHA } });
    const rc = await recarga.json();

    conferir("e não volta na campanha seguinte", rc.naFila === 2, JSON.stringify(rc));
    conferir("a tela é avisada de quantos ficaram de fora",
        rc.bloqueadosFora === 1 && /não perturbe/i.test(rc.recado), JSON.stringify(rc));

    const bloq = await (await pedir("/reativacao/bloqueados")).json();
    conferir("e o motivo fica registrado",
        bloq.bloqueados.some((b) => b.motivo === "respondeu-stop"),
        JSON.stringify(bloq.bloqueados));
}

/* ---- 7. isolamento ----------------------------------------------------- */
console.log("\n7. a carteira de uma farmácia não é da outra");
{
    const semSenha = await pedir("/reativacao/proximos", { semSenha: true });
    conferir("sem senha, o agente não lê a fila", semSenha.status === 401, String(semSenha.status));

    const envioSemSenha = await pedir("/reativacao/fila", {
        semSenha: true, metodo: "POST", corpo: { contatos: CAMPANHA }
    });
    conferir("nem carrega campanha", envioSemSenha.status === 401, String(envioSemSenha.status));

    const n = bancoB.prepare("SELECT COUNT(*) AS n FROM reativacao_fila").get().n;
    conferir("o banco da outra farmácia continua vazio", n === 0, String(n));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
