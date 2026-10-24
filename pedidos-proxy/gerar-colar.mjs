/* Refaz os *-colar.sql a partir dos schema-*.sql.

   Existe porque o console do D1 não aceita comentário de jeito nenhum:
   nem o de linha, que achatado apaga o resto do arquivo, nem o de bloco,
   que vira um pedaço sem instrução e devolve "SQL code did not contain
   a statement".

   E não dá para simplesmente escrever o SQL sem comentário: daqui a seis
   meses, ninguém (inclusive eu) vai lembrar por que o horário é uma
   linha por dia em vez de uma coluna de texto, nem por que o sal da
   senha é por loja em vez de um só. Sem isso, a próxima pessoa
   "simplifica" os dois.

   Então são dois arquivos para cada schema: o que explica e o que roda.
   Este script garante que o segundo é o primeiro sem os comentários — e
   não uma cópia que alguém esqueceu de atualizar.

   Uso:  node gerar-colar.mjs
         node gerar-colar.mjs --conferir   (não grava; falha se divergir)
*/

import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/* Dois bancos, e por isso dois grupos.

   O principal guarda o cadastro de quem são as farmácias. O de operação
   é o de CADA farmácia, um por loja — é o isolamento que impede uma
   consulta esquecida de mostrar o pedido (ou o encalhe) de uma loja para
   a outra.

   Rodar os dois grupos no mesmo banco de mentira passaria, porque os
   nomes das tabelas não se chocam. Mas esconderia o erro que importa:
   um schema de operação que, sem perceber, dependesse de uma tabela que
   só existe no principal. Separados, isso falha aqui em vez de falhar no
   console da Cloudflare com a filial nova esperando.

   Dentro de cada grupo, a ordem é a de rodar: o de lojas cria as tabelas
   que o de acesso pressupõe. */
const GRUPOS = {
    principal: ["schema-lojas.sql", "schema-acesso.sql", "schema-visual.sql"],
    operacao: ["schema.sql", "schema-estoque.sql", "schema-reativacao.sql",
               "schema-cupons.sql", "schema-funil.sql",
               "schema-campanhas.sql", "schema-promo-quantidade.sql"],
    /* Não é schema: é a limpeza dos pedidos de teste, que se roda uma
       vez por loja, no dia em que cai o primeiro pedido de verdade.
       Entra aqui pelo mesmo motivo que os outros — o console do D1 não
       aceita comentário, e este arquivo é quase todo comentário. */
    manutencao: ["LIMPAR-TESTES.sql"]
};

const SCHEMAS = [...GRUPOS.principal, ...GRUPOS.operacao, ...GRUPOS.manutencao];

const CONFERIR = process.argv.includes("--conferir");

/* Varre caractere a caractere, e não com expressão regular, por um
   motivo só: comentário no FIM da linha.

       estoque REAL NOT NULL,   -- quanto tem hoje

   Tirar isso com /--.*$/ funciona até o dia em que um valor de texto
   contiver dois hifens — 'Entrega -- combinar', um nome de bairro, um
   recado. Aí a regra cortaria no meio da string e geraria um SQL
   quebrado que só falha no console da Cloudflare, longe daqui.

   Então o estado "estou dentro de aspas" é lido de verdade. Dentro de
   aspas, nada é comentário; fora delas, -- vai até o fim da linha e
   um bloco vai até o fecha. */
function semComentario(sql) {
    let fora = "";
    let emTexto = false;

    for (let i = 0; i < sql.length; i++) {
        const c = sql[i];

        if (emTexto) {
            fora += c;
            /* '' dentro de string é uma aspa escapada, não o fim dela. */
            if (c === "'") {
                if (sql[i + 1] === "'") { fora += sql[++i]; }
                else emTexto = false;
            }
            continue;
        }

        if (c === "'") { emTexto = true; fora += c; continue; }

        if (c === "-" && sql[i + 1] === "-") {
            while (i < sql.length && sql[i] !== "\n") i++;
            fora += "\n";
            continue;
        }

        if (c === "/" && sql[i + 1] === "*") {
            i += 2;
            while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
            i++;
            continue;
        }

        fora += c;
    }

    return fora
        .split("\n")
        .map((linha) => linha.replace(/\s+$/, ""))
        .filter((linha) => linha.trim() !== "")
        .join("\n")
        .trim() + "\n";
}

const problemas = [];
const limpos = new Map();

for (const arquivo of SCHEMAS) {
    const original = readFileSync(new URL("./" + arquivo, import.meta.url), "utf8");
    const limpo = semComentario(original);
    limpos.set(arquivo, limpo);

    /* Limpar o que já está limpo tem de não mudar nada. Vale mais que
       procurar "--" no resultado: um valor de texto pode conter dois
       hifens legitimamente, e aí a procura acusaria um problema que não
       existe. */
    if (semComentario(limpo) !== limpo) problemas.push(`${arquivo}: sobrou comentário`);

    const pedacos = limpo.split(";").map((p) => p.trim()).filter(Boolean);
    if (pedacos.some((p) => !/[a-zA-Z]/.test(p))) {
        problemas.push(`${arquivo}: algum pedaço entre ponto-e-vírgula ficou sem instrução`);
    }
}

/* Roda a sequência inteira num banco de mentira, inclusive achatada numa
   linha — que é o que o console faz antes de enviar — e duas vezes, porque
   colar de novo tem de ser inofensivo. */
for (const [nome, achatar] of [["como arquivo", false], ["achatado", true]]) {
  for (const [grupo, arquivos] of Object.entries(GRUPOS)) {
    try {
        const db = new DatabaseSync(":memory:");

        /* A manutenção não cria tabela: ela mexe nas que o schema de
           operação já criou. Então o banco de mentira começa com elas,
           que é exatamente o estado do D1 de uma loja no dia em que
           alguém roda a limpeza. Sem isto o teste falharia com "no such
           table: pedidos" — um erro sobre o teste, não sobre o SQL. */
        if (grupo === "manutencao") {
            for (const arquivo of GRUPOS.operacao) db.exec(limpos.get(arquivo));
        }

        /* A limpeza também mexe em cupom_usos, que é do schema de
           cupons — já incluído no grupo de operação acima. */

        for (const volta of [1, 2]) {
            for (const arquivo of arquivos) {
                const sql = limpos.get(arquivo);
                db.exec(achatar ? sql.replace(/\r?\n/g, " ") : sql);
            }
            if (volta === 1 && grupo === "principal") {
                const lojas = db.prepare("SELECT COUNT(*) AS n FROM lojas").get().n;
                const horarios = db.prepare("SELECT COUNT(*) AS n FROM lojas_horario").get().n;
                if (lojas !== 1 || horarios !== 7) {
                    problemas.push(`${nome}: ${lojas} lojas e ${horarios} horários, esperava 1 e 7`);
                }
                /* A tabela de acesso nasce vazia de propósito: loja sem
                   linha nela é a loja de hoje, que segue com a PAINEL_KEY
                   e com o banco de sempre. */
                for (const lateral of ["lojas_acesso", "lojas_visual"]) {
                    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${lateral}`).get().n;
                    if (n !== 0) problemas.push(`${nome}: ${lateral} devia nascer vazia, veio com ${n}`);
                }
            }

            /* O banco de uma farmácia nova nasce sem pedido, sem busca e
               sem estoque. Se algum dia um schema vier com linha de
               exemplo dentro, a filial recém-criada abriria o painel
               mostrando venda que não houve. */
            /* A limpeza roda num banco COM pedido de teste dentro e
               tem de sair deixando só o que foi mandado ficar. É a
               asserção que importa: um DELETE largo demais aqui apaga o
               pedido do cliente, e esse ninguém recupera. */
            if (volta === 1 && grupo === "manutencao") {
                const sobraram = db.prepare("SELECT COUNT(*) AS n FROM pedidos").get().n;
                if (sobraram !== 0) problemas.push(`${nome}: a limpeza devia rodar sem erro em banco vazio`);
            }

            if (volta === 1 && grupo === "operacao") {
                for (const tabela of ["pedidos", "pedido_itens", "buscas",
                                      "estoque_foto", "estoque_mov",
                                      "reativacao_fila", "reativacao_bloqueio",
                                      "cupons", "cupom_usos", "funil",
                                      "campanhas", "campanha_dia", "pedido_campanha",
                                      "promocao_quantidade"]) {
                    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;
                    if (n !== 0) problemas.push(`${nome}: ${tabela} devia nascer vazia, veio com ${n}`);
                }
            }
        }
    } catch (erro) {
        problemas.push(`${nome}/${grupo}: ${erro.message}`);
    }
  }
}

if (problemas.length) {
    console.error("não gravei:\n  " + problemas.join("\n  "));
    process.exit(1);
}

let divergiu = false;

for (const arquivo of SCHEMAS) {
    const destino = new URL("./" + arquivo.replace(/\.sql$/, "-colar.sql"), import.meta.url);
    const limpo = limpos.get(arquivo);

    if (CONFERIR) {
        let atual = "";
        try { atual = readFileSync(destino, "utf8"); } catch { /* ainda não existe */ }
        if (atual !== limpo) {
            console.error(`${arquivo}: o -colar está desatualizado`);
            divergiu = true;
        }
        continue;
    }

    writeFileSync(destino, limpo, "utf8");
    const instrucoes = limpo.split(";").filter((p) => p.trim()).length;
    console.log(`gravado ${arquivo.replace(/\.sql$/, "-colar.sql")}: ${instrucoes} instruções`);
}

if (divergiu) {
    console.error("rode: node gerar-colar.mjs");
    process.exit(1);
}
if (CONFERIR) console.log("os -colar conferem com os schemas");
