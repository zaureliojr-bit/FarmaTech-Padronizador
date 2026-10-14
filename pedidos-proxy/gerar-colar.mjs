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

/* Na ordem em que se roda no console: o de lojas cria as tabelas que o
   de acesso pressupõe. A ordem também é a do teste aqui embaixo. */
const SCHEMAS = ["schema-lojas.sql", "schema-acesso.sql"];

const CONFERIR = process.argv.includes("--conferir");

function semComentario(sql) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*--.*$/gm, "")
        .replace(/\n\s*\n/g, "\n")
        .trim() + "\n";
}

const problemas = [];
const limpos = new Map();

for (const arquivo of SCHEMAS) {
    const original = readFileSync(new URL("./" + arquivo, import.meta.url), "utf8");
    const limpo = semComentario(original);
    limpos.set(arquivo, limpo);

    if (/--|\/\*/.test(limpo)) problemas.push(`${arquivo}: sobrou comentário`);

    const pedacos = limpo.split(";").map((p) => p.trim()).filter(Boolean);
    if (pedacos.some((p) => !/[a-zA-Z]/.test(p))) {
        problemas.push(`${arquivo}: algum pedaço entre ponto-e-vírgula ficou sem instrução`);
    }
}

/* Roda a sequência inteira num banco de mentira, inclusive achatada numa
   linha — que é o que o console faz antes de enviar — e duas vezes, porque
   colar de novo tem de ser inofensivo. */
for (const [nome, achatar] of [["como arquivo", false], ["achatado", true]]) {
    try {
        const db = new DatabaseSync(":memory:");
        for (const volta of [1, 2]) {
            for (const arquivo of SCHEMAS) {
                const sql = limpos.get(arquivo);
                db.exec(achatar ? sql.replace(/\r?\n/g, " ") : sql);
            }
            if (volta === 1) {
                const lojas = db.prepare("SELECT COUNT(*) AS n FROM lojas").get().n;
                const horarios = db.prepare("SELECT COUNT(*) AS n FROM lojas_horario").get().n;
                if (lojas !== 1 || horarios !== 7) {
                    problemas.push(`${nome}: ${lojas} lojas e ${horarios} horários, esperava 1 e 7`);
                }
                /* A tabela de acesso nasce vazia de propósito: loja sem
                   linha nela é a loja de hoje, que segue com a PAINEL_KEY
                   e com o banco de sempre. */
                const acessos = db.prepare("SELECT COUNT(*) AS n FROM lojas_acesso").get().n;
                if (acessos !== 0) problemas.push(`${nome}: lojas_acesso devia nascer vazia, veio com ${acessos}`);
            }
        }
    } catch (erro) {
        problemas.push(`${nome}: ${erro.message}`);
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
