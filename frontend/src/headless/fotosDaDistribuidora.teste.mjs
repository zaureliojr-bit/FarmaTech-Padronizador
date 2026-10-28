/* A foto que vem da listagem da distribuidora, por EAN.

   A loja nova entrou com 2.000 produtos sem foto, e a listagem da
   DPCNET - que já estava no servidor - cobria algumas centenas deles.
   O painel passou a oferecer "Procurar / Aplicar" em vez de pedir que
   alguém colasse link por link.

   O que este arquivo guarda não é o caminho feliz: é o que não pode
   entrar no banco de imagens. Uma célula vazia, um "-", um nome de
   arquivo solto em vez de endereço - qualquer um desses, gravado,
   produz produto COM imagem e SEM foto, que é pior que produto sem
   imagem: ele sai da lista "sem imagem" e ninguém mais olha.

   E guarda a regra do EAN de 12 dígitos, que precisa ser a mesma do
   padronizador. Se as duas divergirem, o painel acha foto que a
   importação depois não acha, e a conta nunca fecha.

   Uso: node src/headless/fotosDaDistribuidora.teste.mjs
*/

import { readFileSync } from "node:fs";

/* Os módulos do padronizador se importam sem extensão (é o Vite que
   resolve), então o Node não os carrega direto. Em vez de montar meio
   Vite aqui, o teste lê do arquivo as duas funções de que precisa — as
   MESMAS que rodam em produção, não cópias. */
const lerFonte = (caminho) => readFileSync(new URL(caminho, import.meta.url), "utf8");

/* Do início da assinatura até a chave que fecha a função, contando os
   pares — recortar até o fim do arquivo traria todos os outros
   `export` do módulo junto. */
const recortar = (fonte, assinatura) => {

    const inicio = fonte.indexOf(assinatura);

    if (inicio < 0) throw new Error(`Não achei "${assinatura}" no arquivo.`);

    let nivel = 0;

    for (let i = fonte.indexOf("{", inicio); i < fonte.length; i++) {
        if (fonte[i] === "{") nivel++;
        else if (fonte[i] === "}" && --nivel === 0) {
            /* `export` fora de módulo é erro de sintaxe; vira
               declaração comum. */
            return fonte.slice(inicio, i + 1).replace("export ", "");
        }
    }

    throw new Error(`A função "${assinatura}" não fecha.`);

};

const consultarEanDistribuidor = new Function(
    `${recortar(lerFonte("../services/cmedService.js"), "export function apenasDigitos")}
     ${recortar(lerFonte("../services/distribuidorService.js"), "export function consultarEanDistribuidor")}
     ; return consultarEanDistribuidor;`
)();

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* O módulo real importa meio padronizador (planilha, CMED, publicação).
   O teste lê só o trecho desta função e o avalia com as duas
   dependências que ela usa de verdade. */
const fonte = readFileSync(new URL("./importarEPublicar.js", import.meta.url), "utf8");

/* As duas variáveis de cache mais a função — elas são o cache, e sem
   elas a seção 5 não teria o que testar. */
const trecho = "let listaDaDistribuidora; let listaJaBuscada = false;\n"
    + recortar(fonte, "export async function imagensDaDistribuidora");

conferir("achei a função no arquivo", trecho.includes("imagensDaDistribuidora"));

let buscarReferencia;   // trocado a cada seção

const montar = () => new Function(
    "buscarReferencia", "consultarEanDistribuidor",
    `${trecho}
     ; return imagensDaDistribuidora;`
)((...a) => buscarReferencia(...a), consultarEanDistribuidor);

const indiceCom = (porEan) => ({
    versao: 1, importadoEm: "2026-10-11T12:00:00.000Z",
    totalLinhas: Object.keys(porEan).length, porEan
});

/* ---- 1. a foto da listagem ------------------------------------------ */
console.log("\n1. o EAN que está na listagem traz a foto");
{
    buscarReferencia = async (chave) => {
        conferir("pede a listagem da distribuidora", chave === "distribuidor", chave);
        return indiceCom({
            "7891234567895": { descricao: "SENSODYNE 90G", imagem: "https://dpc.example/sensodyne.jpg" }
        });
    };

    const lista = await montar()();

    conferir("conta quantos produtos a listagem tem", lista.total === 1, String(lista.total));
    conferir("e de quando ela é, pra loja saber se está velha",
        lista.importadoEm === "2026-10-11T12:00:00.000Z", String(lista.importadoEm));

    conferir("devolve o link da foto",
        lista.imagemDe("7891234567895") === "https://dpc.example/sensodyne.jpg",
        String(lista.imagemDe("7891234567895")));

    conferir("e nada para um EAN que não está na listagem",
        lista.imagemDe("7899999999999") === null, String(lista.imagemDe("7899999999999")));
}

/* ---- 2. linha sem foto ---------------------------------------------- */
console.log("\n2. linha sem foto não vira foto");
{
    /* Boa parte da planilha da DPCNET não tem imagem, e a célula vazia
       chega de várias formas. Nenhuma delas pode ser gravada: o
       imagens-proxy tentaria baixar e, pior, o produto sairia da lista
       "sem imagem" do painel como se estivesse resolvido. */
    buscarReferencia = async () => indiceCom({
        "7890000000001": { descricao: "A", imagem: "" },
        "7890000000002": { descricao: "B", imagem: "   " },
        "7890000000003": { descricao: "C", imagem: "-" },
        "7890000000004": { descricao: "D", imagem: "sem foto" },
        "7890000000005": { descricao: "E", imagem: "produto_123.jpg" },
        "7890000000006": { descricao: "F" },
        "7890000000007": { descricao: "G", imagem: null },
        "7890000000008": { descricao: "H", imagem: 42 }
    });

    const lista = await montar()();

    for (let i = 1; i <= 8; i++) {
        const ean = "789000000000" + i;
        conferir(`${ean} não devolve link`,
            lista.imagemDe(ean) === null, JSON.stringify(lista.imagemDe(ean)));
    }

    /* E um endereço de verdade continua passando — o filtro não pode
       ser tão zeloso que recuse a listagem inteira. */
    buscarReferencia = async () => indiceCom({
        "7890000000009": { descricao: "I", imagem: "  http://dpc.example/i.png  " }
    });

    const outra = await montar()();
    conferir("endereço de verdade passa, com os espaços tirados",
        outra.imagemDe("7890000000009") === "http://dpc.example/i.png",
        String(outra.imagemDe("7890000000009")));
}

/* ---- 3. EAN de 12 dígitos ------------------------------------------- */
console.log("\n3. o EAN de 12 dígitos é o mesmo código com zero na frente");
{
    /* UPC-A. O padronizador já trata assim (consultarEanDistribuidor);
       aqui a asserção existe para o painel não passar a tratar
       diferente - são produtos importados, boa parte da perfumaria. */
    buscarReferencia = async () => indiceCom({
        "0012345678905": { descricao: "HEAD SHOULDERS", imagem: "https://dpc.example/hs.jpg" }
    });

    const lista = await montar()();

    conferir("acha pelo código de 12 dígitos",
        lista.imagemDe("012345678905") === "https://dpc.example/hs.jpg",
        String(lista.imagemDe("012345678905")));

    conferir("e pelo de 13, do jeito que está na listagem",
        lista.imagemDe("0012345678905") === "https://dpc.example/hs.jpg",
        String(lista.imagemDe("0012345678905")));
}

/* ---- 4. ninguém subiu listagem nenhuma ------------------------------ */
console.log("\n4. sem listagem no servidor, o painel só avisa");
{
    buscarReferencia = async () => null;

    const lista = await montar()();

    /* O painel decide pelo total: zero significa "manda a loja subir a
       planilha no padronizador", e não um botão "Aplicar 0". */
    conferir("o total é zero", lista.total === 0, String(lista.total));
    conferir("não tem data de importação", lista.importadoEm === null, String(lista.importadoEm));

    /* E consultar não pode estourar: o painel chama imagemDe num laço
       pelo catálogo inteiro. */
    let quebrou = false;
    let url;
    try { url = lista.imagemDe("7891234567895"); } catch { quebrou = true; }

    conferir("consultar sem listagem não quebra", !quebrou);
    conferir("e devolve nada", url === null, String(url));
}

/* ---- 5. a listagem é buscada uma vez -------------------------------- */
console.log("\n5. a listagem de 2,6 MB não é buscada por produto");
{
    let idas = 0;
    buscarReferencia = async () => {
        idas++;
        return indiceCom({ "7891234567895": { descricao: "X", imagem: "https://dpc.example/x.jpg" } });
    };

    const imagensDaDistribuidora = montar();

    await imagensDaDistribuidora();
    await imagensDaDistribuidora();
    await imagensDaDistribuidora();

    /* Esta é a asserção que protege a loja de esperar meia hora: o
       "Procurar" cruza o catálogo inteiro contra a listagem, e um
       fetch de 2,6 MB por consulta seria inviável. */
    conferir("três chamadas, uma ida à rede", idas === 1, String(idas));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
