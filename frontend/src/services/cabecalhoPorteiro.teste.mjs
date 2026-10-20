/* O cabeçalho que o padronizador manda ao porteiro.

   Este teste existe por causa de um defeito que não dava erro nenhum: o
   padronizador mandava só a senha, sem a filial. O porteiro, sem o
   cabeçalho de loja, cai na farmácia ORIGINAL — então, com o painel
   aberto numa filial, importar a extração e publicar o catálogo
   escreviam no site da loja errada.

   Para quem entra com a chave de dono era pior ainda: ela abre qualquer
   farmácia, então nada dava 401. A tela dizia "catálogo atualizado" e o
   site da filial continuava igual, enquanto o da outra loja mudava.

   Uso: node src/services/cabecalhoPorteiro.teste.mjs
*/

import { montarCabecalho, limparSlug, CABECALHO_SENHA, CABECALHO_LOJA }
    from "./cabecalhoPorteiro.js";

let falhas = 0;

function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* ---- 1. o defeito ---------------------------------------------------- */
console.log("\n1. a filial viaja junto com a senha");
{
    const c = montarCabecalho("senha-da-filial", "farma-centro");

    conferir("a senha vai", c[CABECALHO_SENHA] === "senha-da-filial", JSON.stringify(c));
    conferir("e a filial TAMBÉM — era isto que faltava",
        c[CABECALHO_LOJA] === "farma-centro", JSON.stringify(c));
}

/* ---- 2. a farmácia original ------------------------------------------ */
console.log("\n2. sem filial é a farmácia original");
{
    for (const vazio of ["", null, undefined, "   "]) {
        const c = montarCabecalho("senha", vazio);
        conferir(`${JSON.stringify(vazio)} não manda cabeçalho de loja`,
            !(CABECALHO_LOJA in c), JSON.stringify(c));
    }

    /* Mandar o cabeçalho VAZIO não é o mesmo que não mandar: o porteiro
       leria "" como apelido e procuraria uma farmácia chamada nada. */
    const c = montarCabecalho("senha", "");
    conferir("e não é cabeçalho vazio, é cabeçalho ausente",
        c[CABECALHO_LOJA] === undefined, JSON.stringify(c));
}

/* ---- 3. sem senha não sai nada ---------------------------------------- */
console.log("\n3. sem senha não há cabeçalho");
{
    for (const vazio of ["", null, undefined, "  "]) {
        conferir(`${JSON.stringify(vazio)} devolve nulo`,
            montarCabecalho(vazio, "farma-centro") === null);
    }

    /* Devolver um objeto meio preenchido faria a requisição sair só
       para tomar 401 — e o recado na tela seria "senha incorreta" para
       quem não digitou senha nenhuma. */
}

/* ---- 4. o apelido, limpo igual ao painel e ao worker ------------------- */
console.log("\n4. o apelido chega saneado");
{
    conferir("maiúscula vira minúscula", limparSlug("Farma-Centro") === "farma-centro");
    conferir("espaço some", limparSlug("  farma-centro  ") === "farma-centro");
    conferir("acento e barra somem", limparSlug("fárma/centro") === "frmacentro",
        limparSlug("fárma/centro"));

    /* O que isto impede: apelido com caractere de controle ou barra
       entrando num cabeçalho HTTP. */
    /* O que importa é o \r\n sumir — é com ele que se injeta um
       cabeçalho a mais. O hífen de "x-outra" sobrevive porque hífen é
       caractere válido de apelido, e isso está certo: o resultado é uma
       palavra só, inofensiva. */
    const injecao = limparSlug("farma\r\nX-Outra: coisa");
    conferir("quebra de linha não entra no cabeçalho",
        !/[\r\n:\s]/.test(injecao), JSON.stringify(injecao));

    const c = montarCabecalho("s", " FARMA-CENTRO ");
    conferir("e o cabeçalho sai com o apelido limpo",
        c[CABECALHO_LOJA] === "farma-centro", JSON.stringify(c));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
