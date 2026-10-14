/* Testa a rota GET /loja contra um SQLite de verdade.

   Não é mock do resultado: o schema-lojas.sql é executado como está, e o
   handler do worker roda contra esse banco. Então este teste pega erro
   de SQL, de nome de coluna e de forma da resposta — que é exatamente o
   tipo de coisa que, sem ele, só apareceria depois de publicar.

   O que está sendo provado:

     1. o schema roda, roda achatado numa linha (que é o que o console do
        D1 faz) e roda duas vezes sem quebrar;
     2. a rota devolve a loja e os 7 horários;
     3. os valores no banco são IDÊNTICOS aos que estão no ar hoje no
        HTML e no script.js do site — esta é a seção que importa, porque
        a Fase 2 promete que "nada muda para o cliente", e a única forma
        de isso ser verdade é o dado novo ser igual ao antigo;
     4. sem a tabela, a resposta é 503 com recado de instalação, e não um
        500 que faria parecer que o site quebrou;
     5. slug que não existe dá 404, e slug com aspas não vira injeção.

   Uso: node teste-loja.mjs
*/

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

const schema = readFileSync(new URL("./schema-lojas.sql", import.meta.url), "utf8");

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* ---- um D1 de mentira por cima de um SQLite de verdade --------------

   O D1 usa parâmetros numerados (?1, ?2) e o node:sqlite liga por
   posição. Converter aqui, em vez de escrever o SQL de outro jeito no
   worker, é o que mantém o teste rodando exatamente o SQL que vai para
   produção. */
function fingirD1(db) {
    const traduzir = (sql, ligados) => {
        const usados = [];
        const novo = sql.replace(/\?(\d+)/g, (_, n) => {
            usados.push(ligados[Number(n) - 1]);
            return "?";
        });
        return [novo, usados.length ? usados : ligados];
    };

    return {
        prepare(sql) {
            let ligados = [];
            const api = {
                bind(...args) { ligados = args; return api; },
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
                    db.prepare(s).run(...a);
                    return { success: true };
                }
            };
            return api;
        }
    };
}

function pedir(caminho, env) {
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho), env);
}

/* ---- 1. o schema ---------------------------------------------------- */
console.log("\n1. o schema-lojas.sql roda do jeito que você vai colar");
const banco = new DatabaseSync(":memory:");
{
    /* Achatado numa linha só: é o que o console do D1 faz antes de
       enviar. Foi assim que o schema.sql original falhou com "Requests
       without any query are not supported" — um comentário "--" apagava
       o arquivo inteiro. */
    const achatado = schema.replace(/\r?\n/g, " ");
    try {
        banco.exec(achatado);
        conferir("achatado numa linha", true);
    } catch (erro) {
        conferir("achatado numa linha", false, erro.message);
    }
    try {
        banco.exec(achatado);
        conferir("rodado duas vezes, sem erro e sem duplicar", true);
    } catch (erro) {
        conferir("rodado duas vezes", false, erro.message);
    }
    const n = banco.prepare("SELECT COUNT(*) AS n FROM lojas").get().n;
    conferir("uma loja cadastrada", n === 1, `${n} lojas`);
}

const env = { DB: fingirD1(banco) };

/* ---- 2. a rota ------------------------------------------------------ */
console.log("\n2. GET /loja");
let dados;
{
    const resposta = await pedir("/loja", env);
    conferir("responde 200", resposta.status === 200, String(resposta.status));
    conferir("é público, sem chave", resposta.status !== 401);
    conferir("manda cachear por 5 minutos",
        /max-age=300/.test(resposta.headers.get("cache-control") || ""),
        resposta.headers.get("cache-control"));

    dados = await resposta.json();
    conferir("traz a loja", !!(dados.loja && dados.loja.slug), JSON.stringify(dados).slice(0, 80));
    conferir("traz os 7 dias de horário", (dados.horario || []).length === 7,
        `${(dados.horario || []).length} dias`);
}

/* ---- 3. o dado novo é igual ao que está no ar ----------------------- */
console.log("\n3. bate com o que o site mostra hoje");
{
    const l = dados.loja;
    const h = Object.fromEntries((dados.horario || []).map((x) => [x.dia, `${x.abre}-${x.fecha}`]));

    /* Cada linha abaixo é um valor que está publicado agora, e de onde
       ele veio. Se alguém mudar o banco e esquecer o site (ou o
       contrário), é aqui que aparece. */
    conferir("CNPJ, igual ao rodapé", l.cnpj === "37.925.108/0001-03", l.cnpj);
    conferir("rua e número, iguais ao rodapé",
        l.logradouro === "Rua Almeida Leme" && l.numero === "07" && l.complemento === "Loja 1",
        `${l.logradouro}, ${l.numero} - ${l.complemento}`);
    conferir("CEP, igual ao rodapé", l.cep === "09761-170", l.cep);
    conferir("cidade e UF", l.cidade === "São Bernardo do Campo" && l.uf === "SP", `${l.cidade}/${l.uf}`);
    conferir("farmacêutica e CRF, iguais ao rodapé",
        l.farmaceutico === "Dra. Laís Carvalho da Silva" && l.crf === "122886",
        `${l.farmaceutico} CRF ${l.crf}`);
    conferir("o rótulo do responsável vem da loja, não do código",
        l.rotulo_responsavel === "Farmacêutica responsável", l.rotulo_responsavel);
    conferir("autorização e licença MS",
        l.autorizacao === "Processo 25351.507967/2022-82" && l.licenca_ms === "MS 7.89888-2",
        `${l.autorizacao} / ${l.licenca_ms}`);
    conferir("WhatsApp, igual ao WHATS_LOJA do script.js",
        l.whatsapp === "5511925190101", l.whatsapp);
    conferir("coordenadas, iguais ao LOJA_LAT/LOJA_LNG",
        Math.abs(l.latitude - -23.7092450) < 1e-7 && Math.abs(l.longitude - -46.5251954) < 1e-7,
        `${l.latitude}, ${l.longitude}`);
    conferir("raio de entrega, igual ao RAIO_MAX_KM", l.raio_entrega_km === 8, String(l.raio_entrega_km));
    conferir("frete grátis desligado, como o FRETE_GRATIS_ACIMA_DE",
        l.frete_gratis_acima === 0, String(l.frete_gratis_acima));
    conferir("domingo 08:00-19:30, como o indicador de Aberto/Fechado",
        h[0] === "08:00-19:30", h[0]);
    conferir("segunda a sábado 07:00-21:30",
        [1, 2, 3, 4, 5, 6].every((d) => h[d] === "07:00-21:30"),
        JSON.stringify(h));
}

/* ---- 4. sem a tabela ------------------------------------------------ */
console.log("\n4. worker publicado antes de rodar o SQL");
{
    const vazio = new DatabaseSync(":memory:");
    const resposta = await pedir("/loja", { DB: fingirD1(vazio) });
    conferir("responde 503, não 500", resposta.status === 503, String(resposta.status));
    const corpo = await resposta.json();
    conferir("e diz qual arquivo rodar", /schema-lojas\.sql/.test(corpo.erro || ""), corpo.erro);
}

/* ---- 5. slug ------------------------------------------------------- */
console.log("\n5. slug");
{
    const r1 = await pedir("/loja?slug=mais-barato", env);
    conferir("slug certo devolve a loja", r1.status === 200, String(r1.status));

    const r2 = await pedir("/loja?slug=nao-existe", env);
    conferir("slug inexistente dá 404", r2.status === 404, String(r2.status));

    /* O slug vem da URL, ou seja, de estranho. Entra como parâmetro
       ligado, nunca concatenado — isto confirma que continua assim. */
    const r3 = await pedir("/loja?slug=" + encodeURIComponent("' OR 1=1 --"), env);
    conferir("slug com aspas não vira injeção", r3.status === 404, String(r3.status));

    const aindaTem = banco.prepare("SELECT COUNT(*) AS n FROM lojas").get().n;
    conferir("a tabela continua de pé depois disso", aindaTem === 1, String(aindaTem));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
