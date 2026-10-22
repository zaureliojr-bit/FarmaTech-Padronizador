/* A limpeza dos pedidos de teste, rodada num banco de verdade.

   O dia em que isto roda é o pior dia possível para errar: o primeiro
   pedido de um cliente acabou de cair, e a loja vai apagar o lixo que
   ela mesma criou testando. Um DELETE largo demais leva o pedido do
   cliente junto — e esse não volta: a farmácia não saberia que existiu.

   Por isso o teste monta um banco com as duas coisas misturadas (três
   pedidos de teste e um de cliente) e prova, depois de rodar o arquivo,
   que sobrou exatamente o que tinha de sobrar.

   Uso: node teste-limpar-testes.mjs
*/

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

const ler = (nome) => readFileSync(new URL("./" + nome, import.meta.url), "utf8");

const db = new DatabaseSync(":memory:");
db.exec(ler("schema-colar.sql"));

/* O banco como ele está hoje: três pedidos nossos, de teste, e o
   primeiro de um cliente de verdade. */
const AGORA = Date.now();

const pedidos = [
    ["TESTE-1", AGORA - 5 * 86400000, "Zé Teste", "11999990000", 100],
    ["TESTE-2", AGORA - 4 * 86400000, "Zé Teste", "11999990000", 80],
    ["TESTE-3", AGORA - 3 * 86400000, "Fulano", "11988880000", 50],
    ["REAL-1", AGORA - 3600000, "Maria da Silva", "11977770000", 64.9]
];

for (const [ref, quando, cliente, telefone, total] of pedidos) {
    db.prepare(
        `INSERT INTO pedidos (ref, criado_em, cliente, telefone, entrega, endereco,
                              pagamento, subtotal, frete, total, tem_receita, status)
         VALUES (?, ?, ?, ?, 'Entrega', 'Rua Tal, 10', 'Pix', ?, 0, ?, 0, 'novo')`
    ).run(ref, quando, cliente, telefone, total, total);

    db.prepare(
        `INSERT INTO pedido_itens (ref, ean, codigo, descricao, qtd, preco_unit, total_item)
         VALUES (?, '7891106000888', '001', 'Dipirona 500mg', 1, ?, ?)`
    ).run(ref, total, total);
}

/* A tabela de clientes como o site a deixou: com os testes somados. */
db.exec(`INSERT INTO clientes (telefone, nome, ultimo_endereco, primeiro_pedido, ultimo_pedido, pedidos, total_gasto)
         VALUES ('11999990000', 'Zé Teste', 'Rua Tal, 10', 0, 0, 2, 180),
                ('11988880000', 'Fulano', 'Rua Tal, 10', 0, 0, 1, 50),
                ('11977770000', 'Maria da Silva', 'Rua Tal, 10', 0, 0, 1, 64.9)`);

db.exec(`INSERT INTO buscas (termo, criado_em, resultados)
         VALUES ('teste', ${AGORA - 86400000}, 0),
                ('aaa', ${AGORA - 86400000}, 0),
                ('dipirona', ${AGORA - 3600}, 12)`);

/* O arquivo, com os códigos trocados como a loja vai trocar. Só os
   blocos que apagam: os SELECT de olhar não mudam nada. */
const script = ler("LIMPAR-TESTES-colar.sql")
    .replace(/'TROQUE-AQUI-1', 'TROQUE-AQUI-2'/g, "'TESTE-1', 'TESTE-2', 'TESTE-3'");

conferir("o arquivo de colar não tem comentário sobrando",
    !/--/.test(script.replace(/'[^']*'/g, "")), "achei '--' fora de string");

db.exec(script);

/* ---- o pedido do cliente ------------------------------------------- */
console.log("\n1. o que não podia sair");
{
    const real = db.prepare("SELECT ref, cliente, total FROM pedidos").all();

    conferir("sobrou um pedido, e é o do cliente",
        real.length === 1 && real[0].ref === "REAL-1", JSON.stringify(real));

    const itens = db.prepare("SELECT ref FROM pedido_itens").all();
    conferir("com o item dele", itens.length === 1 && itens[0].ref === "REAL-1",
        JSON.stringify(itens));
}

/* ---- o lixo --------------------------------------------------------- */
console.log("\n2. o que tinha de sair");
{
    const testes = db.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE ref LIKE 'TESTE%'").get().n;
    conferir("os três pedidos de teste sumiram", testes === 0, String(testes));

    /* Itens órfãos são o esquecimento clássico: o pedido some do painel
       e as linhas dele continuam somando em "produtos mais vendidos". */
    const orfaos = db.prepare(
        `SELECT COUNT(*) AS n FROM pedido_itens i
          WHERE NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.ref = i.ref)`
    ).get().n;
    conferir("e não ficou item órfão somando no relatório", orfaos === 0, String(orfaos));
}

/* ---- a lista de clientes -------------------------------------------- */
console.log("\n3. a lista de clientes, refeita");
{
    const clientes = db.prepare("SELECT telefone, nome, pedidos, total_gasto FROM clientes").all();

    conferir("sobrou um cliente", clientes.length === 1, JSON.stringify(clientes));

    const c = clientes[0] || {};
    conferir("é a cliente de verdade", c.telefone === "11977770000", JSON.stringify(c));
    conferir("com o nome dela", c.nome === "Maria da Silva", JSON.stringify(c));

    /* O número que importa: o resumo foi RECALCULADO, e não herdado.
       Herdado, o telefone de teste continuaria lá como "2 pedidos,
       R$ 180" e apareceria na Reativação como cliente sumido. */
    conferir("e o total batendo com o pedido que sobrou",
        c.pedidos === 1 && Math.abs(c.total_gasto - 64.9) < 0.001, JSON.stringify(c));

    /* As datas também são refeitas: as linhas antigas tinham zero, que
       no painel vira 01/01/1970 na coluna "primeira compra". */
    const datas = db.prepare("SELECT primeiro_pedido, ultimo_pedido FROM clientes").get();
    conferir("e as datas vieram do pedido, não do zero antigo",
        datas.primeiro_pedido > 0 && datas.ultimo_pedido > 0, JSON.stringify(datas));
}

/* ---- as buscas ------------------------------------------------------ */
console.log("\n4. as buscas");
{
    const termos = db.prepare("SELECT termo FROM buscas").all().map((b) => b.termo);

    conferir("os termos de teste saíram", !termos.includes("teste") && !termos.includes("aaa"),
        JSON.stringify(termos));

    /* O relatório que mais vale é "procuraram e não acharam". Uma
       limpeza que leva junto as buscas de clientes de verdade apaga
       vendas perdidas que ninguém mais vai ver. */
    conferir("e a busca de cliente de verdade ficou",
        termos.includes("dipirona"), JSON.stringify(termos));
}

/* ---- rodar duas vezes ----------------------------------------------- */
console.log("\n5. colar de novo sem querer");
{
    /* Dedo nervoso no console: a mesma limpeza colada duas vezes não
       pode apagar o pedido do cliente na segunda passada. */
    db.exec(script);

    const real = db.prepare("SELECT ref FROM pedidos").all();
    conferir("o pedido do cliente continua lá",
        real.length === 1 && real[0].ref === "REAL-1", JSON.stringify(real));

    const clientes = db.prepare("SELECT COUNT(*) AS n FROM clientes").get().n;
    conferir("e a lista de clientes não duplicou", clientes === 1, String(clientes));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
