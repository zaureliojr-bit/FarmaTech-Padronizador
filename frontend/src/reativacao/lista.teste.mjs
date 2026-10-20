/* A lista de quem recebe a mensagem.

   Uso: node src/reativacao/lista.teste.mjs
*/

import { montarRegistros, contarPorSituacao, montarMensagem, linkWhatsApp, tituloDeNome }
    from "./lista.js";

let falhas = 0;

function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* ---- 1. a mesma pessoa em duas fichas -------------------------------- */
console.log("\n1. duas fichas, uma pessoa, uma mensagem");
{
    const { registros, duplicadosUnidos } = montarRegistros([
        { nome: "MARIA SILVA",     telefone: "(19) 97517-2840", dias: 183 },
        { nome: "Maria A. Silva",  telefone: "19975172840",     dias: 40 },
        { nome: "João",            telefone: "(11) 98902-4152", dias: 90 }
    ]);

    conferir("duas fichas viraram uma pessoa", registros.length === 2, String(registros.length));
    conferir("e a tela diz quantas foram unidas", duplicadosUnidos === 1, String(duplicadosUnidos));

    const maria = registros.find((r) => r.telefone.e164 === "5519975172840");

    /* O menor "dias" é o verdadeiro: ela comprou há 40 dias pelo outro
       cadastro. Ficar com 183 diria que uma cliente ativa sumiu. */
    conferir("vale a compra mais recente das duas", maria.dias === 40, String(maria.dias));
    conferir("e conta quantas fichas tinha", maria.fichas === 2, String(maria.fichas));
}

/* ---- 2. não perturbe -------------------------------------------------- */
console.log("\n2. quem pediu para não receber, não entra");
{
    const { registros, descartadosNaoPerturbe } = montarRegistros([
        { nome: "Quem pediu para parar", telefone: "19975172840", dias: 200 },
        { nome: "Outro",                 telefone: "11989024152", dias: 100 }
    ], { naoPerturbe: ["5519975172840"] });

    conferir("some da lista", registros.length === 1, String(registros.length));
    conferir("e nem aparece como bloqueado para alguém reativar sem querer",
        !registros.some((r) => r.telefone.e164 === "5519975172840"));
    conferir("a tela sabe quantos foram poupados",
        descartadosNaoPerturbe === 1, String(descartadosNaoPerturbe));
}

/* ---- 3. a contagem da tela -------------------------------------------- */
console.log("\n3. o que a tela mostra no topo");
{
    const { registros } = montarRegistros([
        { nome: "Celular",      telefone: "19975172840",  dias: 10 },
        { nome: "Antigo",       telefone: "1984810539",   dias: 20 },
        { nome: "Fixo",         telefone: "1132514000",   dias: 30 },
        { nome: "Sem DDD",      telefone: "975172841",    dias: 40 },
        { nome: "Lixo",         telefone: "00000000000",  dias: 50 }
    ]);

    const conta = contarPorSituacao(registros);

    conferir("dois prontos", conta.ok === 2, JSON.stringify(conta));
    conferir("um fixo, contado à parte", conta.fixo === 1, JSON.stringify(conta));
    conferir("um sem DDD", conta.semDDD === 1, JSON.stringify(conta));
    conferir("um inválido", conta.invalido === 1, JSON.stringify(conta));
    conferir("e o total fecha",
        conta.ok + conta.fixo + conta.semDDD + conta.invalido === conta.total,
        JSON.stringify(conta));
}

/* ---- 4. a mensagem ----------------------------------------------------- */
console.log("\n4. a mensagem de cada um");
{
    const { registros } = montarRegistros([
        { nome: "maria aparecida da silva", telefone: "19975172840", dias: 183 }
    ]);
    const r = registros[0];

    conferir("o nome vem arrumado",
        r.nome === "Maria Aparecida da Silva", r.nome);

    const msg = montarMensagem("Oi {primeiro}! Faz {dias} dias. ({nome})", r);
    conferir("{primeiro} é só o primeiro nome",
        msg.startsWith("Oi Maria!"), msg);
    conferir("{dias} entra", /183 dias/.test(msg), msg);
    conferir("{nome} continua valendo", /\(Maria Aparecida da Silva\)/.test(msg), msg);

    const link = linkWhatsApp(r, msg);
    conferir("o link vai para o número certo",
        link.startsWith("https://wa.me/5519975172840?text="), link.slice(0, 50));
    conferir("e a mensagem vai codificada, sem quebrar o link",
        !/ /.test(link), link.slice(0, 80));
}

/* ---- 5. nomes que o título antigo estragava ----------------------------- */
console.log("\n5. nomes com apóstrofo e preposição");
{
    conferir("d'Ávila", tituloDeNome("maria d'ávila") === "Maria D'Ávila", tituloDeNome("maria d'ávila"));
    conferir("preposição fica minúscula no meio",
        tituloDeNome("JOSE DOS SANTOS") === "Jose dos Santos", tituloDeNome("JOSE DOS SANTOS"));
    conferir("mas não no começo",
        tituloDeNome("de paula") === "De Paula", tituloDeNome("de paula"));
    conferir("espaço sobrando não vira palavra",
        tituloDeNome("  ana   lima  ") === "Ana Lima", `"${tituloDeNome("  ana   lima  ")}"`);
}

/* ---- 6. sem telefone não vira link ------------------------------------- */
console.log("\n6. quem não tem número não ganha botão");
{
    const { registros } = montarRegistros([
        { nome: "Fixo", telefone: "1132514000", dias: 10 }
    ]);
    conferir("fixo não gera link de WhatsApp",
        linkWhatsApp(registros[0], "oi") === null);
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
