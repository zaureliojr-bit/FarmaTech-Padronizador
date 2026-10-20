/* A aba de reativação, no navegador.

   O que está sendo provado:

     1. a aba existe e troca de tela;
     2. trocar de aba NÃO perde o que está na outra — o catálogo vive só
        em memória, e desmontar a tela jogaria fora 6.700 produtos que a
        pessoa acabou de importar;
     3. o telefone fixo aparece como fixo e sem botão de WhatsApp. É o
        defeito que trouxe esta tela para cá: antes virava um celular de
        outra pessoa, com o nome de um cliente da farmácia junto;
     4. duas fichas do mesmo telefone viram uma linha só;
     5. "não perturbe" tira da lista e continua valendo depois de
        reimportar a mesma planilha.

   Uso:
     npm run build
     npx serve dist -l 4178     (ou qualquer servidor estático)
     BASE=http://127.0.0.1:4178 CHROME_PATH=... node teste-reativacao.mjs
*/

/* O Playwright NÃO é dependência do padronizador, de propósito: ele
   baixa um navegador inteiro, e o build que roda na Cloudflare a cada
   push não deve carregar isso. Então a origem dele é configurável, e
   quem roda o teste aponta para onde já existe:

     PLAYWRIGHT_EM=/caminho/do/projeto/que/tem/playwright/ \
     node teste-reativacao.mjs

   createRequire porque `import` de pacote não respeita NODE_PATH. */
import { createRequire } from "node:module";

const exigir = createRequire(process.env.PLAYWRIGHT_EM || import.meta.url);
const { chromium } = exigir("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:4178";

let falhas = 0;

function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

const LISTA = [
    "Maria Silva\t(19) 97517-2840\t183",
    "MARIA A SILVA\t19975172840\t40",
    "Jose dos Santos\t(11) 3251-4000\t200",
    "Ana Lima\t97517-2841\t150",
    "Lixo\t00000000000\t90"
].join("\n");

const navegador = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);

const contexto = await navegador.newContext();
const pagina = await contexto.newPage();

const erros = [];
pagina.on("pageerror", (e) => erros.push(e.message));

await pagina.goto(BASE, { waitUntil: "domcontentloaded" });
await pagina.waitForTimeout(800);

/* ---- 1. a aba ------------------------------------------------------- */
console.log("\n1. a aba existe e troca");
{
    const abas = await pagina.$$eval(".aba", (bs) => bs.map((b) => b.textContent.trim()));
    conferir("duas abas no cabeçalho", abas.length === 2, abas.join(" | "));
    conferir("uma delas é a reativação",
        abas.some((a) => /Reativa/i.test(a)), abas.join(" | "));

    await pagina.click(".aba:has-text('Reativação')");
    await pagina.waitForSelector(".reativacao", { timeout: 10000 });
    conferir("clicar abre a tela", await pagina.isVisible(".reativacao"));
}

/* ---- 2. trocar de aba não perde nada --------------------------------- */
console.log("\n2. ir e voltar não apaga o que estava digitado");
{
    await pagina.fill(".rea-area", LISTA);
    await pagina.click(".aba:has-text('Catálogo')");
    await pagina.waitForTimeout(400);
    await pagina.click(".aba:has-text('Reativação')");
    await pagina.waitForTimeout(400);

    const continua = await pagina.inputValue(".rea-area");
    conferir("o texto colado continua lá",
        continua.includes("Maria Silva"), continua.slice(0, 40));
}

/* ---- 3. processar --------------------------------------------------- */
console.log("\n3. a lista processada");
{
    await pagina.click(".rea-principal");
    await pagina.waitForSelector(".rea-tabela tbody tr", { timeout: 10000 });

    const linhas = await pagina.$$eval(".rea-tabela tbody tr",
        (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, " ")));

    /* Cinco linhas coladas, quatro pessoas: as duas Marias são a mesma. */
    conferir("duas fichas da mesma pessoa viraram uma",
        linhas.length === 4, `${linhas.length} linhas`);

    const aviso = await pagina.textContent(".rea-aviso");
    conferir("e a tela conta que uniu", /repetida/i.test(aviso), aviso);

    const maria = linhas.find((l) => /Maria/i.test(l));
    conferir("a Maria mostra que tinha duas fichas",
        /2 fichas/.test(maria), maria);

    /* Lido da CÉLULA de dias, e não do texto da linha inteira: a
       primeira versão procurava "40" no meio de tudo e batia em
       "unidas40", sem fronteira de palavra nenhuma para separar. */
    const diasDaMaria = await pagina.$eval(
        ".rea-tabela tbody tr:has-text('Maria') .rea-num",
        (td) => td.textContent.trim());

    /* O menor "dias" é o verdadeiro: ela comprou há 40, não há 183. */
    conferir("e vale a compra mais recente, não a mais antiga",
        diasDaMaria === "40", diasDaMaria);
}

/* ---- 4. o fixo ------------------------------------------------------- */
console.log("\n4. telefone fixo não vira celular de estranho");
{
    const linhaFixo = await pagina.$$eval(".rea-tabela tbody tr", (trs) =>
        trs.map((tr) => ({
            texto: tr.textContent.replace(/\s+/g, " "),
            temWhats: !!tr.querySelector(".rea-whats")
        })).find((l) => /Jose/i.test(l.texto)));

    conferir("é marcado como fixo", /fixo/i.test(linhaFixo.texto), linhaFixo.texto);
    conferir("e NÃO ganha botão de WhatsApp", !linhaFixo.temWhats);
}

/* ---- 5. os contadores ------------------------------------------------ */
console.log("\n5. o resumo do topo");
{
    const resumo = await pagina.textContent(".rea-contagem");
    conferir("conta prontos, sem DDD, fixos e inválidos separados",
        /prontos/.test(resumo) && /sem DDD/.test(resumo)
        && /fixos/.test(resumo) && /inválidos/.test(resumo),
        resumo.replace(/\s+/g, " "));
}

/* ---- 6. não perturbe -------------------------------------------------- */
console.log("\n6. não perturbe vale para as próximas campanhas");
{
    const antes = await pagina.$$eval(".rea-tabela tbody tr", (t) => t.length);

    await pagina.click(".rea-tabela tbody tr:has-text('Maria') .rea-mini-ruim");
    await pagina.waitForTimeout(500);

    const depois = await pagina.$$eval(".rea-tabela tbody tr", (t) => t.length);
    conferir("sai da lista na hora", depois === antes - 1, `${antes} → ${depois}`);

    /* A prova que importa: reimportar a MESMA lista não traz de volta
       quem pediu para parar. */
    await pagina.fill(".rea-area", LISTA);
    await pagina.click(".rea-principal");
    await pagina.waitForTimeout(600);

    const nomes = await pagina.$$eval(".rea-tabela tbody tr",
        (trs) => trs.map((tr) => tr.textContent));
    conferir("e não volta ao reimportar a mesma planilha",
        !nomes.some((n) => /Maria/i.test(n)), nomes.join(" | ").slice(0, 120));

    const aviso = await pagina.textContent(".rea-aviso");
    conferir("a tela avisa quantos foram poupados",
        /não perturbe/i.test(aviso), aviso);
}

/* ---- 7. nenhum erro de JavaScript ------------------------------------ */
console.log("\n7. o console");
conferir("nenhum erro de página", erros.length === 0, erros.join(" | "));

await navegador.close();
console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
