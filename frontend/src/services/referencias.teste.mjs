/* A lista de referência que vem do servidor quando este navegador não
   tem a dele.

   O padronizador já SUBIA a CMED e a lista da distribuidora para o
   servidor desde que o painel da loja passou a padronizar sozinho — e
   nunca as buscava de volta. Quem abrisse o padronizador em outro
   computador, em outro navegador, ou numa farmácia recém-instalada via
   as duas caixas vazias e ia procurar a planilha para subir de novo. A
   lista estava no servidor o tempo todo.

   É o que faz a listagem da DPCNET ser do SISTEMA e não daquela
   máquina: sobe uma vez, vale para todo mundo. E é o que permite
   padronizar a perfumaria de uma loja nova no primeiro dia, já que é
   dela que saem descrição e imagem desses produtos.

   O que este arquivo guarda é o comportamento quando dá errado, que é
   a parte que ninguém testa à mão: sem servidor configurado, sem
   internet, resposta estragada. Em nenhum desses casos a tela pode
   quebrar — ela volta a ser o que sempre foi, com a caixa pedindo a
   planilha.

   Uso: node src/services/referencias.teste.mjs
*/

import { readFileSync } from "node:fs";

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* O módulo real importa `import.meta.env` do Vite e o credencialPainel,
   que fala com o navegador. Em vez de montar meio Vite aqui, o teste lê
   a função do arquivo e a avalia com as dependências que ela realmente
   usa — que são duas: buscarReferencia e console. */
const fonte = readFileSync(
    new URL("./referenciasService.js", import.meta.url), "utf8"
);

const trecho = fonte.slice(fonte.indexOf("export async function referenciaDoServidor"));

/* Vira declaração comum: `export` fora de módulo é erro de sintaxe. */
const corpo = trecho.replace("export async function", "async function");

let buscarReferencia;   // trocado a cada seção
const referenciaDoServidor = new Function(
    "buscarReferencia",
    `${corpo}; return referenciaDoServidor;`
)((...args) => buscarReferencia(...args));

/* ---- 1. o caminho feliz --------------------------------------------- */
console.log("\n1. o navegador sem lista busca a do servidor");
{
    const INDICE = { totalLinhas: 8123, porEan: { "7891234567895": "x" } };

    buscarReferencia = async (chave) => {
        conferir("pede a chave certa", chave === "distribuidor", chave);
        return INDICE;
    };

    const guardados = [];
    const indice = await referenciaDoServidor("distribuidor", (i) => guardados.push(i));

    conferir("devolve o índice do servidor", indice === INDICE, JSON.stringify(indice));

    /* Guardar localmente é conveniência da PRÓXIMA abertura: sem isso,
       toda abertura pagaria uma ida à rede por uma lista que muda uma
       vez por mês. */
    conferir("e guarda no navegador para a próxima vez",
        guardados.length === 1 && guardados[0] === INDICE, String(guardados.length));
}

/* ---- 2. ninguém subiu a lista ainda --------------------------------- */
console.log("\n2. sem lista no servidor, a tela continua como era");
{
    buscarReferencia = async () => null;

    const guardados = [];
    const indice = await referenciaDoServidor("distribuidor", (i) => guardados.push(i));

    conferir("não devolve índice nenhum", indice === null, JSON.stringify(indice));

    /* O nulo não pode ser gravado como se fosse lista: na abertura
       seguinte o IndexedDB devolveria "tem algo" e a caixa ficaria
       dizendo que a lista existe, vazia. */
    conferir("e não grava nulo no navegador",
        guardados.length === 0, JSON.stringify(guardados));
}

/* ---- 3. a rede caiu no meio ----------------------------------------- */
console.log("\n3. erro de rede não derruba a tela");
{
    buscarReferencia = async () => { throw new Error("Failed to fetch"); };

    let quebrou = false;
    let indice;

    try {
        indice = await referenciaDoServidor("cmed", () => {});
    } catch {
        quebrou = true;
    }

    /* Esta é a asserção que importa. O padronizador abre com a lista
       vindo de uma promessa; se ela rejeitar, a tela monta pela metade
       e a pessoa não entende por quê. */
    conferir("a exceção não escapa", !quebrou);
    conferir("e o resultado é nulo, como quem não achou",
        indice === null, JSON.stringify(indice));
}

/* ---- 4. gravar local falhou, mas a lista serve ---------------------- */
console.log("\n4. IndexedDB bloqueado não impede usar a lista");
{
    const INDICE = { totalLinhas: 12 };
    buscarReferencia = async () => INDICE;

    /* Aba privada, cota estourada, armazenamento desligado: guardar
       falha. A lista desta sessão continua valendo — só não vai ter
       atalho na próxima. */
    const indice = await referenciaDoServidor("distribuidor", () => {
        throw new Error("QuotaExceededError");
    });

    conferir("a lista do servidor continua valendo",
        indice === INDICE, JSON.stringify(indice));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
