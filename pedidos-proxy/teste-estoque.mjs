/* Estoque e giro, contra um SQLite de verdade.

   O schema roda como está, e os handlers do worker rodam contra esse
   banco — então aqui aparece erro de SQL, de nome de coluna e de forma
   da resposta, que é o tipo de coisa que de outro jeito só apareceria
   depois de publicar, na farmácia do cliente.

   O que está sendo provado, e por que cada coisa importa:

     1. a PRIMEIRA fotografia não vira movimento. Tratá-la como entrada
        inventaria uma compra de 6.800 itens no dia da instalação e
        estragaria a média de giro do primeiro mês inteiro;
     2. estoque que CAIU é saída, estoque que SUBIU é entrada, e as duas
        não se misturam — senão um recebimento de 50 anularia dez dias
        de venda de 5;
     3. rodar a extração duas vezes no mesmo dia não dobra a venda;
     4. ruptura é estoque zero EM PRODUTO QUE GIRAVA. Sem essa segunda
        metade, a lista viria com milhares de itens que a farmácia nunca
        trabalhou;
     5. a lista de encalhe é ordenada por DINHEIRO, não por quantidade;
     6. o total parado é o total de verdade, e não a soma da lista
        cortada no limite — é o número que o dono vai olhar;
     7. o estoque de uma farmácia não é alcançável com a senha de outra.

   Uso: node teste-estoque.mjs
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

/* ---- D1 de mentira por cima de um SQLite de verdade -----------------

   Igual ao dos outros testes, mais o batch() — que os handlers de
   estoque usam de propósito: a fotografia inteira entra numa transação
   só, para não existir instante em que a foto já mudou e o movimento
   ainda não. */
function fingirD1(db) {
    const traduzir = (sql, ligados) => {
        const usados = [];
        const novo = sql.replace(/\?(\d+)/g, (_, n) => {
            usados.push(ligados[Number(n) - 1]);
            return "?";
        });
        return [novo, usados.length ? usados : ligados];
    };

    const api = {
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
                    return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
                }
            };
            return stmt;
        },
        async batch(comandos) {
            const saidas = [];
            for (const c of comandos) {
                const [s, a] = traduzir(c._sql, c._ligados);
                /* SELECT devolve linhas; o resto devolve contagem. O D1
                   responde os dois com a mesma forma.

                   O "with" na lista importa: uma consulta que começa com
                   WITH é consulta, e sem ele este dublê a tratava como
                   escrita e devolvia lista vazia — três asserções
                   falhando por defeito do teste, apontando para o
                   worker. */
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
    return api;
}

const SENHA_WORKER = "senha-do-worker";

const bancoA = new DatabaseSync(":memory:");
const bancoB = new DatabaseSync(":memory:");

/* ---- 1. o schema, do jeito que você vai colar ----------------------- */
console.log("\n1. o schema-estoque.sql roda como o console do D1 manda");
{
    const operacao = ler("schema-colar.sql") + "\n" + ler("schema-estoque-colar.sql");

    /* O banco A é o principal E o de operação da primeira farmácia — é
       assim na produção: a loja que existia antes da plataforma ficou
       onde estava, e o cadastro de lojas nasceu ao lado dela. O B é uma
       filial de verdade: só operação. */
    const principal = ler("schema-lojas-colar.sql") + "\n" + ler("schema-acesso-colar.sql");

    /* Achatado numa linha: é o que o console faz antes de enviar, e foi
       assim que um "--" já apagou um arquivo inteiro nesta sessão. */
    const achatado = (sql) => sql.replace(/\r?\n/g, " ");
    for (const [nome, banco, sql] of [["loja A", bancoA, principal + "\n" + operacao],
                                      ["loja B", bancoB, operacao]]) {
        try {
            banco.exec(achatado(sql));
            banco.exec(achatado(sql));
            conferir(`roda achatado e duas vezes (${nome})`, true);
        } catch (erro) {
            conferir(`roda achatado e duas vezes (${nome})`, false, erro.message);
        }
    }

    const colunas = bancoA.prepare("PRAGMA table_info(estoque_foto)").all().map((c) => c.name);
    conferir("a foto tem custo, que é o que vira dinheiro parado",
        colunas.includes("custo"), colunas.join(","));
}

const env = { DB: fingirD1(bancoA), DB_LOJA_B: fingirD1(bancoB), PAINEL_KEY: SENHA_WORKER };

/* `semSenha` é uma bandeira, e não `senha: undefined`, porque undefined
   cai no valor PADRÃO do parâmetro — a chamada mandaria a senha certa
   achando que não manda, e o teste de "sem senha, não lê" passaria
   verde contra um worker completamente aberto. */
function pedir(caminho, { senha = SENHA_WORKER, semSenha = false, metodo = "GET", corpo, loja } = {}) {
    const cabecalhos = { "CF-Connecting-IP": "1.2.3.4" };
    if (!semSenha) cabecalhos["X-Painel-Key"] = senha;
    if (loja !== undefined) cabecalhos["X-Painel-Loja"] = loja;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

const enviar = (dia, produtos) =>
    pedir("/estoque", { metodo: "POST", corpo: { dia, produtos } });

/* Datas relativas a hoje: o período de giro é de 30 dias e o de encalhe
   de 60, então uma data fixa faria o teste passar hoje e falhar sozinho
   no mês que vem. */
const hoje = new Date();
const diaMenos = (n) => new Date(hoje.getTime() - n * 86400000).toISOString().slice(0, 10);

/* ---- 2. a primeira fotografia --------------------------------------- */
console.log("\n2. a primeira fotografia não é movimento");
{
    const r = await enviar(diaMenos(40), [
        { ean: "7891106000888", descricao: "Dipirona 500mg",   estoque: 40, custo: 4,   preco: 9.90 },
        { ean: "7896004810140", descricao: "Bismu-Jet 20ml",   estoque: 10, custo: 12,  preco: 24.90 },
        { ean: "7898040328603", descricao: "Bactrim F",        estoque: 60, custo: 20,  preco: 39.90 },
        { ean: "7896269900303", descricao: "Betnovate creme",  estoque:  3, custo: 15,  preco: 29.90 }
    ]);
    const corpo = await r.json();

    conferir("aceita o envio", r.status === 200, String(r.status));
    conferir("gravou os quatro", corpo.gravados === 4, String(corpo.gravados));
    conferir("e NENHUM movimento — não havia 'antes'",
        corpo.movimentos === 0, String(corpo.movimentos));

    const n = bancoA.prepare("SELECT COUNT(*) AS n FROM estoque_mov").get().n;
    conferir("a tabela de movimento continua vazia", n === 0, String(n));
}

/* ---- 3. caiu é saída, subiu é entrada -------------------------------- */
console.log("\n3. o sentido da variação");
{
    await enviar(diaMenos(39), [
        { ean: "7891106000888", estoque: 25, custo: 4, preco: 9.90 },   // caiu 15
        { ean: "7896004810140", estoque: 30, custo: 12, preco: 24.90 }  // subiu 20
    ]);

    const dip = bancoA.prepare("SELECT * FROM estoque_mov WHERE ean = ?").get("7891106000888");
    conferir("o que caiu virou saída", dip.saida === 15 && dip.entrada === 0,
        `saida=${dip.saida} entrada=${dip.entrada}`);
    conferir("e guardou de quanto para quanto",
        dip.estoque_antes === 40 && dip.estoque_depois === 25,
        `${dip.estoque_antes}→${dip.estoque_depois}`);

    const bis = bancoA.prepare("SELECT * FROM estoque_mov WHERE ean = ?").get("7896004810140");
    conferir("o que subiu virou entrada, e não venda",
        bis.entrada === 20 && bis.saida === 0,
        `saida=${bis.saida} entrada=${bis.entrada}`);
}

/* ---- 4. duas extrações no mesmo dia ---------------------------------- */
console.log("\n4. rodar a extração duas vezes no mesmo dia");
{
    const dia = diaMenos(38);
    await enviar(dia, [{ ean: "7891106000888", estoque: 20, custo: 4, preco: 9.90 }]);
    await enviar(dia, [{ ean: "7891106000888", estoque: 18, custo: 4, preco: 9.90 }]);

    const linhas = bancoA.prepare("SELECT * FROM estoque_mov WHERE ean = ? AND dia = ?")
        .all("7891106000888", dia);
    conferir("continua uma linha só para o dia", linhas.length === 1, String(linhas.length));

    /* O começo do dia era 25. A venda do dia é 25→18 = 7, e não 5+2=7
       em duas linhas nem 2 sozinho sobrescrevendo os 5. */
    conferir("o 'antes' continua sendo o do começo do dia",
        linhas[0].estoque_antes === 25, String(linhas[0].estoque_antes));
    conferir("e a saída do dia é a conta inteira, não a do último pedaço",
        linhas[0].saida === 7, String(linhas[0].saida));
}

/* ---- 5. produto sem EAN ---------------------------------------------- */
console.log("\n5. o que não dá para cruzar não entra");
{
    const r = await enviar(diaMenos(37), [
        { ean: "", descricao: "Manipulado sem código", estoque: 5 },
        { descricao: "Sem campo nenhum", estoque: 5 },
        { ean: "7891106000888", estoque: 18, custo: 4, preco: 9.90 }
    ]);
    const corpo = await r.json();
    conferir("produto sem EAN é descartado, não vira linha órfã",
        corpo.gravados === 1, String(corpo.gravados));
}

/* ---- 6. data ---------------------------------------------------------- */
console.log("\n6. a data é a da farmácia, e é obrigatória");
{
    const r = await enviar("14/10/2026", [{ ean: "7891106000888", estoque: 1 }]);
    conferir("formato errado é recusado", r.status === 400, String(r.status));

    const semDia = await pedir("/estoque", { metodo: "POST", corpo: { produtos: [] } });
    conferir("sem data também", semDia.status === 400, String(semDia.status));
}

/* ---- 7. a análise ------------------------------------------------------ */
console.log("\n7. o que rompeu, o que vai romper, o que está parado");
{
    /* Monta a história dos últimos dias:
         Dipirona  — vinha girando e ZEROU       → ruptura
         Betnovate — girando forte, sobrou pouco → vai romper
         Bactrim   — estoque alto, não sai nada  → encalhe caro
         Esparadrapo — zerado, e NUNCA saiu nada → não é ruptura

       O último é o caso que separa ruptura de "produto que a farmácia
       não trabalha". Sem ele no teste, a consulta poderia estar
       devolvendo todo estoque zero e ninguém perceberia — são milhares
       de itens, e nenhum deles faz falta. */
    for (let d = 10; d >= 1; d--) {
        await enviar(diaMenos(d), [
            { ean: "7891106000888", descricao: "Dipirona 500mg",  estoque: Math.max(0, d - 1), custo: 4,  preco: 9.90 },
            { ean: "7896269900303", descricao: "Betnovate creme", estoque: d * 4,              custo: 15, preco: 29.90 },
            { ean: "7898040328603", descricao: "Bactrim F",       estoque: 60,                 custo: 20, preco: 39.90 },
            { ean: "7891010101010", descricao: "Esparadrapo",     estoque: 0,                  custo: 8,  preco: 16.00 }
        ]);
    }

    /* O Betnovate termina em 2 depois de cair 4 por dia: a cobertura dá
       menos de dois dias, que é o alerta de verdade. */
    await enviar(diaMenos(1), [
        { ean: "7896269900303", descricao: "Betnovate creme", estoque: 2, custo: 15, preco: 29.90 }
    ]);

    const r = await pedir("/estoque/analise");
    const a = await r.json();

    conferir("responde 200", r.status === 200, String(r.status));
    conferir("e avisa que a saída é estimada, não exata", a.exato === false, String(a.exato));

    const rompidos = a.rompidos.map((x) => x.ean);
    conferir("a Dipirona, que girava e zerou, é ruptura",
        rompidos.includes("7891106000888"), rompidos.join(","));
    conferir("o Esparadrapo, zerado mas que nunca girou, NÃO é ruptura",
        !rompidos.includes("7891010101010"), rompidos.join(","));

    const vao = a.vaoRomper.map((x) => x.ean);
    conferir("o Betnovate aparece como 'vai romper'",
        vao.includes("7896269900303"), vao.join(","));
    const bet = a.vaoRomper.find((x) => x.ean === "7896269900303");
    conferir("com os dias de cobertura calculados",
        bet && bet.dias_cobertura > 0 && bet.dias_cobertura < 7, bet && String(bet.dias_cobertura));

    const parados = a.parados.map((x) => x.ean);
    conferir("o Bactrim, parado com estoque alto, é encalhe",
        parados.includes("7898040328603"), parados.join(","));
    const bac = a.parados.find((x) => x.ean === "7898040328603");
    conferir("e o encalhe é medido em dinheiro — 60 × R$ 20",
        bac && bac.dinheiro_parado === 1200, bac && String(bac.dinheiro_parado));

    conferir("a lista de parados vem do mais caro para o mais barato",
        a.parados.every((x, i, l) => i === 0 || l[i - 1].dinheiro_parado >= x.dinheiro_parado),
        a.parados.map((x) => x.dinheiro_parado).join(" "));

    conferir("o total parado é dinheiro de verdade",
        a.parado_total.dinheiro >= 1200, JSON.stringify(a.parado_total));
    conferir("e conta quantos itens estão zerados", a.zerados >= 2, String(a.zerados));
    conferir("e diz de quando é a fotografia", !!a.atualizado_em, String(a.atualizado_em));
}

/* ---- 8. o total não é a soma da lista cortada -------------------------- */
console.log("\n8. o total parado ignora o limite da lista");
{
    const muitos = [];
    for (let i = 0; i < 20; i++) {
        muitos.push({ ean: "789000000" + String(i).padStart(4, "0"),
                      descricao: "Encalhe " + i, estoque: 10, custo: 5, preco: 10 });
    }
    await enviar(diaMenos(1), muitos);

    const r = await pedir("/estoque/analise?limite=3");
    const a = await r.json();

    conferir("a lista respeita o limite pedido", a.parados.length === 3, String(a.parados.length));
    conferir("mas o total soma tudo que está parado",
        a.parado_total.itens > 3, JSON.stringify(a.parado_total));
}

/* ---- 9. o estoque de uma não é alcançável pela outra ------------------- */
console.log("\n9. o estoque de uma farmácia não vaza para a outra");
{
    const semSenha = await pedir("/estoque/analise", { semSenha: true });
    conferir("sem senha, não lê", semSenha.status === 401, String(semSenha.status));

    const envioSemSenha = await pedir("/estoque", {
        semSenha: true, metodo: "POST", corpo: { dia: diaMenos(1), produtos: [] }
    });
    conferir("sem senha, não grava", envioSemSenha.status === 401, String(envioSemSenha.status));

    /* E o banco B, que é de outra farmácia, continua vazio depois de
       tudo que foi gravado aqui. */
    const n = bancoB.prepare("SELECT COUNT(*) AS n FROM estoque_foto").get().n;
    conferir("o banco da outra farmácia continua vazio", n === 0, String(n));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
