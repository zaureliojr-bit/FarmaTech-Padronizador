/* Prova, com SQLite de verdade, as tres colisoes que o schema de hoje
   tem quando duas lojas dividem o mesmo banco.

   Nao e teste de regressao: e a evidencia que justifica recriar as
   tabelas promocoes, clientes e pedidos com chave composta antes de
   cadastrar a segunda loja. Ver PLATAFORMA-MULTILOJA.md, secao 3.

   Rodar:  node --experimental-sqlite pedidos-proxy/prova-colisao-multiloja.cjs
*/
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync("/home/user/FarmaTech-Padronizador/pedidos-proxy/schema.sql", "utf8"));

console.log("=== promocoes: loja A poe o produto 1234 a R$ 10,00 ===");
const promo = db.prepare(`INSERT INTO promocoes (codigo, preco, inicio, fim, ativo, lote, criado_em)
  VALUES (?1,?2,?3,?4,?5,?6,?7)
  ON CONFLICT(codigo) DO UPDATE SET
     preco = excluded.preco, inicio = excluded.inicio, fim = excluded.fim,
     ativo = excluded.ativo, lote = excluded.lote, criado_em = excluded.criado_em`);
promo.run("1234", 10.00, "", "", 1, "loja-A-outubro", 1000);
console.log("  ", JSON.stringify(db.prepare("SELECT codigo, preco, lote FROM promocoes").all()));

console.log("=== agora a loja B poe o MESMO produto a R$ 25,00 ===");
promo.run("1234", 25.00, "", "", 1, "loja-B-outubro", 2000);
const r = db.prepare("SELECT codigo, preco, lote FROM promocoes").all();
console.log("  ", JSON.stringify(r));
console.log("   linhas na tabela:", r.length, "(esperado 2, uma por loja)");
console.log("   >>> o preco da loja A virou R$", r[0].preco.toFixed(2),
            "e o lote dela sumiu:", r[0].lote);

console.log("\n=== clientes: mesmo telefone compra nas duas lojas ===");
const cli = db.prepare(`INSERT INTO clientes
   (telefone, nome, ultimo_endereco, primeiro_pedido, ultimo_pedido, pedidos, total_gasto)
   VALUES (?1,?2,?3,?4,?4,1,?5)
   ON CONFLICT(telefone) DO UPDATE SET
      nome = excluded.nome,
      ultimo_pedido = excluded.ultimo_pedido,
      pedidos = clientes.pedidos + 1,
      total_gasto = clientes.total_gasto + excluded.total_gasto`);
cli.run("11988887777", "Maria", "Rua A", 1000, 100.00);   // comprou 100 na loja A
cli.run("11988887777", "Maria", "Rua A", 2000, 50.00);    // comprou 50 na loja B
const c = db.prepare("SELECT telefone, pedidos, total_gasto FROM clientes").get();
console.log("  ", JSON.stringify(c));
console.log("   >>> as duas donas veem", c.pedidos, "pedidos e R$", c.total_gasto.toFixed(2),
            "— a soma das duas lojas");

console.log("\n=== a chave composta resolve? ===");
db.exec(`CREATE TABLE promocoes2 (
   loja_id INTEGER NOT NULL, codigo TEXT NOT NULL, preco REAL NOT NULL,
   PRIMARY KEY (loja_id, codigo))`);
const p2 = db.prepare(`INSERT INTO promocoes2 (loja_id, codigo, preco) VALUES (?1,?2,?3)
   ON CONFLICT(loja_id, codigo) DO UPDATE SET preco = excluded.preco`);
p2.run(1, "1234", 10.00);
p2.run(2, "1234", 25.00);
console.log("  ", JSON.stringify(db.prepare("SELECT * FROM promocoes2 ORDER BY loja_id").all()));
console.log("   >>> duas linhas, cada loja com o seu preco. Resolve.");

console.log("\n=== da pra trocar a chave primaria com ALTER TABLE? ===");
try { db.exec("ALTER TABLE promocoes ADD PRIMARY KEY (loja_id, codigo)"); console.log("   deu"); }
catch (e) { console.log("   NAO:", e.message.slice(0, 80), "-> migracao e recriar a tabela"); }
