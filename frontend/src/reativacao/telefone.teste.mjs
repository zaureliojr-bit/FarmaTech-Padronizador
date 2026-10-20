/* O telefone de quem vai receber a mensagem.

   Este teste existe por um caso só, e é o primeiro aqui embaixo: o
   ativador antigo transformava o telefone FIXO do cliente em um celular
   que existe e é de outra pessoa. A tela dizia "Pronto", e quem recebia
   "você não compra há 183 dias, sentimos sua falta" era um estranho,
   com o nome de um cliente da farmácia junto.

   O resto das asserções é o que impede a correção de virar outro erro:
   celular antigo de 10 dígitos CONTINUA ganhando o nono dígito, porque
   nesse caso acrescentar está certo.

   Uso: node src/reativacao/telefone.teste.mjs
*/

import { normalizarTelefone, comDDD, formatarTelefone, dddValido } from "./telefone.js";

let falhas = 0;

function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

const r = (t) => normalizarTelefone(t);

/* ---- 1. o motivo deste arquivo existir ------------------------------ */
console.log("\n1. fixo não vira celular de estranho");
{
    const fixo = r("(11) 3251-4000");
    conferir("fixo com DDD é reconhecido como fixo",
        fixo.situacao === "fixo", JSON.stringify(fixo));
    conferir("e NÃO ganha um nono dígito inventado",
        !fixo.e164, fixo.e164 || "(sem e164)");

    for (const n of ["1132514000", "1142223333", "1152220000", "1122334455"]) {
        conferir(`${n} é fixo`, r(n).situacao === "fixo", JSON.stringify(r(n)));
    }

    const semDDD = r("3251-4000");
    conferir("fixo sem DDD também é fixo, e não celular",
        semDDD.situacao === "fixo", JSON.stringify(semDDD));
}

/* ---- 2. e o celular antigo continua ganhando o 9 -------------------- */
console.log("\n2. celular de 10 dígitos ainda ganha o nono dígito");
{
    const antigo = r("19 8481-0539");
    conferir("vira celular pronto", antigo.situacao === "ok", JSON.stringify(antigo));
    conferir("com o 9 na frente do número",
        antigo.numero === "984810539", antigo.numero);
    conferir("e o e164 completo", antigo.e164 === "5519984810539", antigo.e164);

    for (const n of ["1961234567", "1971234567", "1981234567", "1991234567"]) {
        conferir(`${n} (começa com ${n[2]}) é celular`, r(n).situacao === "ok", r(n).situacao);
    }
}

/* ---- 3. celular normal ---------------------------------------------- */
console.log("\n3. celular de 11 dígitos");
{
    const c = r("(19) 97517-2840");
    conferir("com pontuação", c.situacao === "ok" && c.e164 === "5519975172840", JSON.stringify(c));
    conferir("sem pontuação", r("19989395228").e164 === "5519989395228", r("19989395228").e164);
    conferir("com +55 colado", r("5511989024152").e164 === "5511989024152", r("5511989024152").e164);
    conferir("com +55 e 10 dígitos", r("551984810539").e164 === "5519984810539", r("551984810539").e164);

    /* 11 dígitos que não começam com 9 depois do DDD não é celular —
       é dígito a mais digitado por engano. */
    conferir("11 dígitos sem o 9 é inválido",
        r("11325140001").situacao === "invalido", JSON.stringify(r("11325140001")));
}

/* ---- 4. o DDD que não existe ---------------------------------------- */
console.log("\n4. DDD conferido contra a lista de verdade");
{
    conferir("00 não existe", !dddValido("00"));
    conferir("20 não existe", !dddValido("20"));
    conferir("23 não existe", !dddValido("23"));
    conferir("29 não existe", !dddValido("29"));
    conferir("36 não existe", !dddValido("36"));
    conferir("40 não existe", !dddValido("40"));
    conferir("11 existe", dddValido("11"));
    conferir("79 existe", dddValido("79"));

    const errado = r("40991234567");
    conferir("número com DDD inexistente é recusado",
        errado.situacao === "invalido", JSON.stringify(errado));
    conferir("e o recado diz qual DDD",
        /40/.test(errado.motivo), errado.motivo);
}

/* ---- 5. sem DDD ------------------------------------------------------ */
console.log("\n5. celular sem DDD, e o DDD padrão da loja");
{
    const s = r("97517-2840");
    conferir("fica pendente, e não pronto", s.situacao === "semDDD", JSON.stringify(s));
    conferir("e sem e164 — não dá para mandar assim", !s.e164);

    const completo = comDDD(s, "19");
    conferir("com o DDD escolhido, fica pronto",
        completo.situacao === "ok" && completo.e164 === "5519975172840",
        JSON.stringify(completo));

    conferir("DDD inválido não completa nada",
        comDDD(s, "40").situacao === "semDDD", comDDD(s, "40").situacao);

    /* 8 dígitos de celular antigo sem DDD: ganha o 9 e continua
       esperando o DDD. */
    const oito = r("84810539");
    conferir("celular antigo de 8 dígitos ganha o 9 e espera o DDD",
        oito.situacao === "semDDD" && oito.numero === "984810539",
        JSON.stringify(oito));
}

/* ---- 6. o que não é telefone ----------------------------------------- */
console.log("\n6. campo preenchido só para passar da validação do PDV");
{
    for (const lixo of ["00000000000", "11111111111", "99999999999"]) {
        conferir(`${lixo} é recusado`, r(lixo).situacao === "invalido", JSON.stringify(r(lixo)));
    }
    conferir("vazio é recusado", r("").situacao === "invalido");
    conferir("texto é recusado", r("não tem").situacao === "invalido");
    conferir("curto demais é recusado", r("1234").situacao === "invalido");
    conferir("longo demais é recusado", r("1912345678901234").situacao === "invalido");
}

/* ---- 7. como aparece na tela ----------------------------------------- */
console.log("\n7. formatação");
{
    conferir("celular com DDD",
        formatarTelefone(r("19975172840")) === "(19) 97517-2840",
        formatarTelefone(r("19975172840")));
    conferir("fixo com DDD",
        formatarTelefone(r("1132514000")) === "(11) 3251-4000",
        formatarTelefone(r("1132514000")));
    conferir("sem DDD, sem parênteses vazios",
        formatarTelefone(r("975172840")) === "97517-2840",
        formatarTelefone(r("975172840")));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
