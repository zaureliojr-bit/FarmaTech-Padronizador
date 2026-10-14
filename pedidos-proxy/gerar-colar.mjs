/* Refaz o schema-lojas-colar.sql a partir do schema-lojas.sql.

   Existe porque o console do D1 não aceita comentário de jeito nenhum:
   nem o de linha, que achatado apaga o resto do arquivo, nem o de bloco,
   que vira um pedaço sem instrução e devolve "SQL code did not contain
   a statement".

   E não dá para simplesmente escrever o SQL sem comentário: daqui a seis
   meses, ninguém (inclusive eu) vai lembrar por que o horário é uma
   linha por dia em vez de uma coluna de texto, nem por que o rótulo do
   responsável técnico é cadastrado em vez de escrito no site.

   Então são dois arquivos: o que explica e o que roda. Este script
   garante que o segundo é o primeiro, sem os comentários — e não uma
   cópia que alguém esqueceu de atualizar.

   Uso:  node gerar-colar.mjs
         node gerar-colar.mjs --conferir   (não grava; falha se divergir)
*/

import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const ENTRADA = new URL("./schema-lojas.sql", import.meta.url);
const SAIDA = new URL("./schema-lojas-colar.sql", import.meta.url);

const original = readFileSync(ENTRADA, "utf8");

const limpo = original
    .replace(/\/\*[\s\S]*?\*\//g, "")   // comentário de bloco
    .replace(/^\s*--.*$/gm, "")          // comentário de linha
    .replace(/\n\s*\n/g, "\n")           // linhas em branco que sobraram
    .trim() + "\n";

/* Conferências antes de gravar. São as três formas conhecidas de o
   console do D1 recusar o arquivo. */
const problemas = [];

if (/--|\/\*/.test(limpo)) problemas.push("sobrou comentário");

const pedacos = limpo.split(";").map((p) => p.trim()).filter(Boolean);
if (pedacos.some((p) => !/[a-zA-Z]/.test(p))) {
    problemas.push("algum pedaço entre ponto-e-vírgula ficou sem instrução");
}

/* Roda de verdade, inclusive achatado numa linha — que é o que o console
   faz antes de enviar — e duas vezes, porque colar de novo tem de ser
   inofensivo. */
for (const [nome, versao] of [["como arquivo", limpo], ["achatado", limpo.replace(/\r?\n/g, " ")]]) {
    try {
        const db = new DatabaseSync(":memory:");
        db.exec(versao);
        db.exec(versao);
        const lojas = db.prepare("SELECT COUNT(*) AS n FROM lojas").get().n;
        const horarios = db.prepare("SELECT COUNT(*) AS n FROM lojas_horario").get().n;
        if (lojas !== 1 || horarios !== 7) {
            problemas.push(`${nome}: ${lojas} lojas e ${horarios} horários, esperava 1 e 7`);
        }
    } catch (erro) {
        problemas.push(`${nome}: ${erro.message}`);
    }
}

if (problemas.length) {
    console.error("não gravei:\n  " + problemas.join("\n  "));
    process.exit(1);
}

if (process.argv.includes("--conferir")) {
    const atual = (() => {
        try { return readFileSync(SAIDA, "utf8"); } catch { return ""; }
    })();
    if (atual !== limpo) {
        console.error("o schema-lojas-colar.sql está desatualizado — rode: node gerar-colar.mjs");
        process.exit(1);
    }
    console.log("schema-lojas-colar.sql confere com o schema-lojas.sql");
    process.exit(0);
}

writeFileSync(SAIDA, limpo, "utf8");
console.log(`gravado: ${pedacos.length} instruções, ${(limpo.length / 1024).toFixed(1)} KB`);
