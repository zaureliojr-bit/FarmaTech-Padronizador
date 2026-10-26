/* Cupons de desconto, contra um SQLite de verdade.

   O SITE NÃO COBRA NADA: o pedido vira mensagem de WhatsApp e o dinheiro
   troca de mão no balcão. O cupom é uma instrução para a farmácia cobrar
   menos — e tudo o que ele precisa garantir é que o desconto na tela da
   atendente foi mesmo criado pela loja.

   É por isso que a seção 4 é a que não dá para pular: ela manda um
   pedido com um cupom inventado e com um desconto escolhido a dedo no
   JSON, que é exatamente o que alguém faria abrindo o console do
   navegador.

   Uso: node teste-cupons.mjs
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
const banco = new DatabaseSync(":memory:");

/* ---- 1. o schema ---------------------------------------------------- */
console.log("\n1. o schema-cupons.sql roda como o console do D1 manda");
{
    /* O banco desta farmácia é também o principal — é assim na
       produção: a loja que existia antes da plataforma ficou onde
       estava, e o cadastro de lojas nasceu ao lado dela. */
    const sql = ler("schema-lojas-colar.sql") + "\n" + ler("schema-acesso-colar.sql")
        + "\n" + ler("schema-colar.sql") + "\n" + ler("schema-cupons-colar.sql");
    const achatado = sql.replace(/\r?\n/g, " ");

    try {
        /* Duas vezes: ninguém sabe se já colou, e schema que quebra na
           segunda colagem é schema abandonado no meio. Foi por isso que
           o desconto não virou coluna em `pedidos` — ALTER TABLE não é
           repetível. */
        banco.exec(achatado);
        banco.exec(achatado);
        conferir("roda achatado e duas vezes", true);
    } catch (erro) {
        conferir("roda achatado e duas vezes", false, erro.message);
    }
}

/* A MESMA senha vale como chave de dono aqui: cupom, banner, encarte
   e campanha são telas de quem administra a plataforma (ver
   SO_DO_DONO no worker, e o teste-permissoes, que é quem prova
   essa separação). Este arquivo trata de outro assunto, e separar
   as duas chaves aqui só acrescentaria ruído ao que ele mede. */
const env = { DB: fingirD1(banco), PAINEL_KEY: SENHA, DONO_KEY: SENHA };

function pedir(caminho, { metodo = "GET", corpo, senha = SENHA, semSenha = false } = {}) {
    const cabecalhos = { "CF-Connecting-IP": "1.2.3.4" };
    if (!semSenha) cabecalhos["X-Painel-Key"] = senha;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

const criar = (cupom) => pedir("/cupons", { metodo: "POST", corpo: cupom });
const validar = (corpo) => pedir("/cupom/validar", { metodo: "POST", corpo, semSenha: true });

const pedido = (corpo) => pedir("/pedidos", { metodo: "POST", semSenha: true, corpo: {
    cliente: "Maria", telefone: "11954664429", entrega: "Entrega",
    endereco: "Rua Tal, 10", pagamento: "Pix",
    itens: [{ ean: "7891106000888", codigo: "1", descricao: "Dipirona", qtd: 1, preco: corpo.subtotal }],
    ...corpo
} });

/* ---- 2. criar e conferir -------------------------------------------- */
console.log("\n2. criar o cupom e conferir no carrinho");
{
    await criar({ codigo: "bemvindo10", tipo: "valor", valor: 10, minimo: 50, descricao: "Primeira compra" });

    /* Quem digita no celular digita de todo jeito. Os três têm de ser o
       mesmo cupom, senão o cliente acha que o código não presta. */
    for (const digitado of ["BEMVINDO10", "bemvindo10", " BemVindo10 "]) {
        const r = await (await validar({ codigo: digitado, subtotal: 80, frete: 8 })).json();
        conferir(`"${digitado}" vale`, r.valido === true && r.desconto === 10, JSON.stringify(r));
    }

    const curto = await (await validar({ codigo: "BEMVINDO10", subtotal: 30, frete: 8 })).json();
    conferir("abaixo do mínimo, não vale", curto.valido === false, JSON.stringify(curto));

    /* A recusa diz O QUE FAZER. "Cupom inválido" faz o cliente tentar de
       novo e desistir; "vale a partir de R$ 50" faz ele pôr mais um item
       no carrinho, que é o que a promoção queria. */
    conferir("e a recusa diz a partir de quanto vale",
        /50,00/.test(curto.motivo || ""), curto.motivo);

    const inexistente = await (await validar({ codigo: "NAOEXISTE", subtotal: 80, frete: 8 })).json();
    conferir("código inventado não vale", inexistente.valido === false, JSON.stringify(inexistente));
}

/* ---- 3. as três formas de desconto ---------------------------------- */
console.log("\n3. valor, percentual e frete");
{
    await criar({ codigo: "DEZPORCENTO", tipo: "percentual", valor: 10, teto: 15 });
    await criar({ codigo: "FRETEGRATIS", tipo: "frete" });
    await criar({ codigo: "VALE20", tipo: "valor", valor: 20 });

    const pct = await (await validar({ codigo: "DEZPORCENTO", subtotal: 100, frete: 8 })).json();
    conferir("10% de 100 é 10", pct.desconto === 10, JSON.stringify(pct));

    /* O teto: 10% de R$ 800 seria R$ 80, e não era isso que a loja quis
       dizer quando escreveu "10% de desconto". */
    const comTeto = await (await validar({ codigo: "DEZPORCENTO", subtotal: 800, frete: 8 })).json();
    conferir("com teto de 15, um pedido grande desconta 15", comTeto.desconto === 15, JSON.stringify(comTeto));

    const frete = await (await validar({ codigo: "FRETEGRATIS", subtotal: 40, frete: 12.5 })).json();
    conferir("frete grátis desconta o frete", frete.desconto === 12.5, JSON.stringify(frete));

    /* Cupom de R$ 20 num pedido de R$ 12 não vira troco. */
    const maior = await (await validar({ codigo: "VALE20", subtotal: 12, frete: 8 })).json();
    conferir("desconto nunca passa do valor dos produtos", maior.desconto === 12, JSON.stringify(maior));
}

/* ---- 4. o cupom inventado ------------------------------------------- */
console.log("\n4. o que acontece com um desconto forjado");
{
    /* Isto é o console do navegador: cupom que não existe e desconto
       escolhido a dedo no JSON. A atendente não tem como saber. */
    const r = await (await pedido({
        ref: "FORJADO-1", subtotal: 100, frete: 10, total: 10,
        cupom: "DESCONTO90", desconto: 90
    })).json();

    conferir("o pedido entra (a venda não se perde)", r.sucesso === true, JSON.stringify(r));
    conferir("mas sem cupom nenhum", r.cupom === null, JSON.stringify(r));

    const gravado = banco.prepare("SELECT total FROM pedidos WHERE ref = 'FORJADO-1'").get();
    conferir("e o total gravado é o cheio, não o que veio no JSON",
        gravado.total === 10, JSON.stringify(gravado));

    const usos = banco.prepare("SELECT COUNT(*) AS n FROM cupom_usos").get().n;
    conferir("nenhum uso registrado", usos === 0, String(usos));
}

/* ---- 5. o cupom de verdade no pedido -------------------------------- */
console.log("\n5. o cupom certo, no pedido certo");
{
    const r = await (await pedido({
        ref: "REAL-1", subtotal: 100, frete: 10, total: 999,
        cupom: "bemvindo10"
    })).json();

    conferir("o cupom é aceito", r.cupom === "BEMVINDO10", JSON.stringify(r));
    conferir("com o desconto calculado aqui", r.desconto === 10, JSON.stringify(r));

    /* O total que o navegador mandou era 999 — propositalmente errado.
       Com cupom, quem calcula é o servidor: 100 + 10 - 10 = 100. */
    conferir("e o total refeito pelo servidor", r.total === 100, JSON.stringify(r));

    const usos = banco.prepare("SELECT codigo, telefone, desconto FROM cupom_usos").all();
    conferir("o uso ficou registrado", usos.length === 1 && usos[0].codigo === "BEMVINDO10",
        JSON.stringify(usos));

    const contador = banco.prepare("SELECT usos FROM cupons WHERE codigo='BEMVINDO10'").get().usos;
    conferir("e o contador subiu", contador === 1, String(contador));
}

/* ---- 6. o reenvio ---------------------------------------------------- */
console.log("\n6. o cliente clica duas vezes");
{
    /* O site reenvia quando a rede oscila. Sem o índice único em `ref`,
       o reenvio gastaria outro uso do cupom — e um cupom de uso único
       valeria duas vezes. */
    await pedido({ ref: "REAL-1", subtotal: 100, frete: 10, total: 100, cupom: "BEMVINDO10" });

    const usos = banco.prepare("SELECT COUNT(*) AS n FROM cupom_usos WHERE ref='REAL-1'").get().n;
    conferir("não gravou o uso duas vezes", usos === 1, String(usos));

    const contador = banco.prepare("SELECT usos FROM cupons WHERE codigo='BEMVINDO10'").get().usos;
    conferir("nem contou duas vezes", contador === 1, String(contador));
}

/* ---- 7. uma vez por pessoa ------------------------------------------ */
console.log("\n7. o mesmo telefone na semana seguinte");
{
    const r = await (await validar({
        codigo: "BEMVINDO10", subtotal: 100, frete: 10, telefone: "11954664429"
    })).json();

    conferir("o mesmo telefone não usa de novo", r.valido === false, JSON.stringify(r));
    conferir("e ouve o motivo", /já usou/i.test(r.motivo || ""), r.motivo);

    /* Outro cliente continua podendo. */
    const outro = await (await validar({
        codigo: "BEMVINDO10", subtotal: 100, frete: 10, telefone: "11988887777"
    })).json();
    conferir("outro cliente ainda pode", outro.valido === true, JSON.stringify(outro));
}

/* ---- 8. validade e limite ------------------------------------------- */
console.log("\n8. validade e limite de usos");
{
    await criar({ codigo: "VENCIDO", tipo: "valor", valor: 5, fim: "2020-01-01" });
    const vencido = await (await validar({ codigo: "VENCIDO", subtotal: 100, frete: 0 })).json();
    conferir("cupom vencido não vale", vencido.valido === false, JSON.stringify(vencido));
    conferir("e diz que expirou", /expirou/i.test(vencido.motivo || ""), vencido.motivo);

    await criar({ codigo: "SOUMA", tipo: "valor", valor: 5, limiteTotal: 1 });
    await pedido({ ref: "LIM-1", subtotal: 100, frete: 0, cupom: "SOUMA", telefone: "11911111111" });

    const esgotado = await (await validar({ codigo: "SOUMA", subtotal: 100, frete: 0 })).json();
    conferir("depois do limite total, não vale mais", esgotado.valido === false, JSON.stringify(esgotado));

    /* Desligar não apaga: o histórico é o que responde se a promoção
       valeu a pena. */
    await pedir("/cupons/excluir", { metodo: "POST", corpo: { codigo: "VALE20" } });
    const desligado = await (await validar({ codigo: "VALE20", subtotal: 100, frete: 0 })).json();
    conferir("cupom desligado não vale", desligado.valido === false, JSON.stringify(desligado));

    const aindaExiste = banco.prepare("SELECT ativo FROM cupons WHERE codigo='VALE20'").get();
    conferir("mas continua no banco, com o histórico", aindaExiste && aindaExiste.ativo === 0,
        JSON.stringify(aindaExiste));

    /* "Não existe" e "desligado" dão a mesma resposta de propósito:
       respostas diferentes transformam o campo num detector de códigos
       válidos. */
    const inexistente = await (await validar({ codigo: "NUNCAEXISTIU", subtotal: 100, frete: 0 })).json();
    conferir("e a recusa é igual à de um código que nunca existiu",
        desligado.motivo === inexistente.motivo, `${desligado.motivo} / ${inexistente.motivo}`);
}

/* ---- 9. quem pode criar --------------------------------------------- */
console.log("\n9. criar cupom é coisa da loja");
{
    const r = await pedir("/cupons", {
        metodo: "POST", semSenha: true,
        corpo: { codigo: "DEGRACA", tipo: "percentual", valor: 90 }
    });

    conferir("sem senha, não cria", r.status === 401, String(r.status));

    const existe = banco.prepare("SELECT 1 AS n FROM cupons WHERE codigo='DEGRACA'").get();
    conferir("e nada foi gravado", !existe, JSON.stringify(existe));

    const absurdo = await (await criar({ codigo: "QUASEDEGRACA", tipo: "percentual", valor: 95 })).json();
    conferir("95% é recusado com explicação", /90%/.test(absurdo.erro || ""), JSON.stringify(absurdo));
}

/* ---- 10. a atendente vê o desconto ---------------------------------- */
console.log("\n10. a fila mostra o cupom");
{
    const r = await (await pedir("/fila")).json();
    const comCupom = (r.pedidos || []).find((p) => p.ref === "REAL-1");

    /* Sem isto, a atendente veria um total menor que a soma dos itens e
       não saberia por quê — o jeito mais rápido de alguém "corrigir" o
       valor no balcão e cobrar o preço cheio de quem tinha desconto. */
    conferir("o pedido com cupom traz o código", comCupom && comCupom.cupom === "BEMVINDO10",
        JSON.stringify(comCupom && { ref: comCupom.ref, cupom: comCupom.cupom, desconto: comCupom.desconto }));
    conferir("e o valor descontado", comCupom && comCupom.desconto === 10,
        JSON.stringify(comCupom && comCupom.desconto));

    const semCupom = (r.pedidos || []).find((p) => p.ref === "FORJADO-1");
    conferir("e o pedido sem cupom não inventa desconto",
        semCupom && !semCupom.cupom && semCupom.desconto === 0,
        JSON.stringify(semCupom && { cupom: semCupom.cupom, desconto: semCupom.desconto }));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
