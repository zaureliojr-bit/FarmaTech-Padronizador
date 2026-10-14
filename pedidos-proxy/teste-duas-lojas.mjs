/* O teste que a Fase 3 existe para passar.

   O bug que ela fecha não dá erro. Uma consulta de painel que esquece de
   filtrar a loja devolve 200, com dados, e parece perfeita — só que os
   dados são de todas as farmácias. Com uma loja cadastrada, nada no
   sistema consegue notar: a resposta certa e a resposta vazada são a
   mesma. Por isso aqui há DUAS farmácias desde a primeira linha, com
   dados diferentes em cada uma, e toda consulta é conferida pelo que ela
   NÃO pode trazer.

   O desenho que está sendo verificado: cada farmácia tem o seu banco de
   D1. Não é `WHERE loja_id = ?` espalhado por 23 handlers — é conexão
   diferente. Um handler que esqueça o filtro não vaza: não há o que
   vazar do outro lado da conexão.

     loja A (mais-barato)  -> env.DB, o banco que já existe hoje
     loja B (farma-centro) -> env.DB_FARMA_CENTRO

   A loja A não tem linha em `lojas_acesso`: é a farmácia que já estava
   no ar, entrando com a PAINEL_KEY de sempre e no banco de sempre. Esse
   caso é testado de propósito — é ele que faz esta fase subir sem
   ninguém ficar de fora do painel no meio do expediente.

   Uso: node teste-duas-lojas.mjs
*/

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

const ler = (nome) => readFileSync(new URL("./" + nome, import.meta.url), "utf8");

const SENHA_WORKER = "senha-antiga-do-worker";
const SENHA_B = "senha-da-farma-centro";

let falhas = 0;
function conferir(descricao, condicao, detalhe = "") {
    if (condicao) console.log(`  ok   ${descricao}`);
    else {
        console.log(`  FALHA ${descricao}${detalhe ? "  → " + detalhe : ""}`);
        falhas++;
    }
}

/* ---- um D1 de mentira por cima de um SQLite de verdade -------------- */
function fingirD1(db) {
    const traduzir = (sql, ligados) => {
        const usados = [];
        const novo = sql.replace(/\?(\d+)/g, (_, n) => {
            usados.push(ligados[Number(n) - 1]);
            return "?";
        });
        return [novo, usados.length ? usados : ligados];
    };

    const api = {
        prepare(sql) {
            let ligados = [];
            const stmt = {
                bind(...args) { ligados = args; return stmt; },
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
                },
                /* o batch do D1 recebe statements já ligados */
                _executar() {
                    const [s, a] = traduzir(sql, ligados);
                    const texto = s.trim().toUpperCase();
                    if (texto.startsWith("SELECT")) return { results: db.prepare(s).all(...a) };
                    db.prepare(s).run(...a);
                    return { success: true };
                }
            };
            return stmt;
        },
        async batch(lista) {
            return lista.map((s) => s._executar());
        }
    };
    return api;
}

/* ---- as duas farmácias ---------------------------------------------- */

const compartilhado = new DatabaseSync(":memory:");
const bancoB = new DatabaseSync(":memory:");

const operacional = ler("schema.sql");
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

/* O banco compartilhado guarda o cadastro de lojas, o limite de
   tentativas — e, por ser também o banco da loja A, a operação dela. */
compartilhado.exec(semComentario(operacional));
compartilhado.exec(semComentario(ler("schema-lojas.sql")));
compartilhado.exec(semComentario(ler("schema-acesso.sql")));

/* O banco da loja B tem só a operação. Nada de cadastro de lojas: ele
   nem sabe que outras farmácias existem. */
bancoB.exec(semComentario(operacional));

/* Data lá na frente de propósito: sem slug no cabeçalho, o worker
   atende a loja ATIVA MAIS ANTIGA — que tem de ser a que já existia, ou
   o site de hoje passaria a falar com a farmácia nova. Na primeira
   versão deste teste a segunda loja nasceu com data anterior à do seed,
   virou a padrão, e quatro asserções falharam de uma vez apontando para
   lugares errados. */
compartilhado.exec(`
    INSERT INTO lojas (slug, nome, cidade, uf, ativo, criado_em)
    VALUES ('farma-centro', 'Farmácia do Centro', 'Cuiabá', 'MT', 1, '2099-01-01 00:00:00')
`);

/* A loja B aponta para o próprio banco. A loja A não tem linha aqui — e
   é isso que a mantém no banco de sempre, com a senha de sempre. */
compartilhado.exec(`
    INSERT INTO lojas_acesso (slug, banco, prefixo_r2)
    VALUES ('farma-centro', 'DB_FARMA_CENTRO', 'farma-centro')
`);

/* Dado de cada uma, diferente de propósito: o teste confere pelo que a
   resposta NÃO pode conter. */
const AGORA = 1792000000000;

const pedido = (db, ref, cliente, telefone) => {
    db.exec(`
        INSERT INTO pedidos (ref, criado_em, cliente, telefone, entrega, endereco, total, status)
        VALUES ('${ref}', ${AGORA}, '${cliente}', '${telefone}', 'Entrega', 'Rua X', 50.0, 'novo')
    `);
    db.exec(`
        INSERT INTO clientes (telefone, nome, primeiro_pedido, ultimo_pedido, pedidos, total_gasto)
        VALUES ('${telefone}', '${cliente}', ${AGORA}, ${AGORA}, 1, 50.0)
    `);
};

pedido(compartilhado, "A-001", "Cliente da Mais Barato", "11999990001");
pedido(compartilhado, "A-002", "Outro da Mais Barato", "11999990002");
pedido(bancoB, "B-001", "Cliente da Farma Centro", "65988880001");

compartilhado.exec(`INSERT INTO promocoes (codigo, preco, ativo, criado_em) VALUES ('AAA111', 9.90, 1, ${AGORA})`);
bancoB.exec(`INSERT INTO promocoes (codigo, preco, ativo, criado_em) VALUES ('BBB222', 19.90, 1, ${AGORA})`);

compartilhado.exec(`INSERT INTO banners (imagem, alt, ativo, ordem, criado_em) VALUES ('https://x/a.png', 'Banner da Mais Barato', 1, 1, ${AGORA})`);
bancoB.exec(`INSERT INTO banners (imagem, alt, ativo, ordem, criado_em) VALUES ('https://x/b.png', 'Banner da Farma Centro', 1, 1, ${AGORA})`);

/* Balde R2 de mentira: guarda em memória e registra tudo que apagou,
   que é o que o teste do prefixo precisa conferir. */
function fingirBalde() {
    const conteudo = new Map();
    const apagados = [];
    return {
        conteudo,
        apagados,
        async put(chave, bytes, opcoes) {
            conteudo.set(chave, { bytes, tipo: opcoes?.httpMetadata?.contentType });
        },
        async get(chave) {
            const achado = conteudo.get(chave);
            if (!achado) return null;
            return { body: achado.bytes, httpMetadata: { contentType: achado.tipo } };
        },
        async delete(chave) {
            apagados.push(chave);
            conteudo.delete(chave);
        }
    };
}

const balde = fingirBalde();

const env = {
    DB: fingirD1(compartilhado),
    DB_FARMA_CENTRO: fingirD1(bancoB),
    BANNERS_BUCKET: balde,
    PAINEL_KEY: SENHA_WORKER
};

function pedir(caminho, { loja, senha, metodo = "GET", corpo, ip = "1.2.3.4" } = {}) {
    const cabecalhos = { "CF-Connecting-IP": ip };
    if (senha !== undefined) cabecalhos["X-Painel-Key"] = senha;
    if (loja !== undefined) cabecalhos["X-Painel-Loja"] = loja;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";

    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

const limparTentativas = () => compartilhado.exec("DELETE FROM tentativas_painel");

/* ---- 1. a loja que já existia não percebe a mudança ----------------- */
console.log("\n1. a farmácia que já estava no ar entra como sempre");
{
    const r = await pedir("/fila", { senha: SENHA_WORKER });
    conferir("entra com a PAINEL_KEY, sem mandar slug nenhum", r.status === 200, String(r.status));

    const dados = await r.json();
    const refs = (dados.pedidos || []).map((p) => p.ref);
    conferir("vê os próprios pedidos", refs.includes("A-001") && refs.includes("A-002"), refs.join(","));
    conferir("e nenhum da outra farmácia", !refs.some((r) => String(r).startsWith("B-")), refs.join(","));
}

/* ---- 2. cadastrar a senha da segunda ------------------------------- */
console.log("\n2. cadastrar a senha da segunda farmácia");
{
    limparTentativas();
    const r = await pedir("/loja/senha", {
        senha: SENHA_WORKER, metodo: "POST", corpo: { slug: "farma-centro", senha: SENHA_B }
    });
    conferir("a PAINEL_KEY cadastra a primeira senha de uma loja", r.status === 200, String(r.status));

    const linha = compartilhado.prepare("SELECT hash, sal FROM lojas_acesso WHERE slug='farma-centro'").get();
    conferir("gravou hash e sal", !!(linha.hash && linha.sal));
    conferir("a senha NÃO foi gravada em texto",
        !JSON.stringify(linha).includes(SENHA_B), JSON.stringify(linha).slice(0, 60));
    conferir("o hash tem cara de SHA-256", /^[0-9a-f]{64}$/.test(linha.hash), linha.hash);

    const curta = await pedir("/loja/senha", {
        senha: SENHA_WORKER, metodo: "POST", corpo: { slug: "farma-centro", senha: "1234" }
    });
    conferir("recusa senha curta", curta.status === 400, String(curta.status));

    const inexistente = await pedir("/loja/senha", {
        senha: SENHA_WORKER, metodo: "POST", corpo: { slug: "nao-existe", senha: "uma-senha-boa" }
    });
    conferir("recusa loja que não existe", inexistente.status === 404, String(inexistente.status));
}

/* ---- 3. cada uma vê só o que é seu ---------------------------------- */
console.log("\n3. o isolamento, que é o motivo de tudo isto");
{
    limparTentativas();
    const rb = await pedir("/fila", { loja: "farma-centro", senha: SENHA_B });
    conferir("a segunda farmácia entra com a senha dela", rb.status === 200, String(rb.status));

    const dadosB = await rb.json();
    const refsB = (dadosB.pedidos || []).map((p) => p.ref);
    conferir("vê o pedido dela", refsB.includes("B-001"), refsB.join(","));
    conferir("e NENHUM da outra farmácia",
        !refsB.some((r) => String(r).startsWith("A-")), refsB.join(","));

    /* Clientes: dado pessoal, o que torna o vazamento problema de LGPD
       além de problema comercial. */
    limparTentativas();
    const clientes = await (await pedir("/clientes", { loja: "farma-centro", senha: SENHA_B })).json();
    const telefones = (clientes.clientes || []).map((c) => c.telefone);
    conferir("os clientes também são só os dela",
        !telefones.some((t) => String(t).startsWith("119999")), telefones.join(","));

    limparTentativas();
    const promos = await (await pedir("/promocoes/todas", { loja: "farma-centro", senha: SENHA_B })).json();
    const codigos = (promos.promocoes || []).map((p) => p.codigo);
    conferir("as promoções, idem", codigos.includes("BBB222") && !codigos.includes("AAA111"), codigos.join(","));

    limparTentativas();
    const banners = await (await pedir("/banners/todos", { loja: "farma-centro", senha: SENHA_B })).json();
    const titulos = (banners.banners || []).map((b) => b.alt);
    conferir("os banners, idem",
        titulos.some((x) => /Centro/.test(x)) && !titulos.some((x) => /Mais Barato/.test(x)),
        titulos.join(","));
}

/* ---- 4. as tentativas de atravessar --------------------------------- */
console.log("\n4. tentando ler a fila da concorrente");
{
    /* O ataque mais óbvio: autenticada como A, pedir os dados de B por
       parâmetro. É o cenário que o desenho chama de "a regra mais
       importante do documento". */
    limparTentativas();
    const r = await pedir("/fila?loja=farma-centro", { senha: SENHA_WORKER });
    const refs = ((await r.json()).pedidos || []).map((p) => p.ref);
    conferir("?loja= na rota de painel é ignorado",
        refs.includes("A-001") && !refs.some((x) => String(x).startsWith("B-")), refs.join(","));

    /* Mandar o slug da outra com a própria senha. */
    limparTentativas();
    const r2 = await pedir("/fila", { loja: "farma-centro", senha: SENHA_WORKER });
    conferir("slug da outra + PAINEL_KEY não entra", r2.status === 401, String(r2.status));

    /* E o contrário: a senha da B não abre a A. */
    limparTentativas();
    const r3 = await pedir("/fila", { loja: "mais-barato", senha: SENHA_B });
    conferir("senha da segunda não abre a primeira", r3.status === 401, String(r3.status));

    /* Trocar a senha da concorrente. */
    limparTentativas();
    const r4 = await pedir("/loja/senha", {
        loja: "farma-centro", senha: SENHA_B, metodo: "POST",
        corpo: { slug: "mais-barato", senha: "tomando-a-loja" }
    });
    conferir("uma loja não troca a senha da outra", r4.status === 403, String(r4.status));

    limparTentativas();
    const r5 = await pedir("/fila", { senha: SENHA_WORKER });
    conferir("e a primeira continua entrando com a senha dela", r5.status === 200, String(r5.status));
}

/* ---- 5. a PAINEL_KEY deixa de valer para quem tem senha própria ----- */
console.log("\n5. a chave do worker não é chave-mestra");
{
    limparTentativas();
    const r = await pedir("/fila", { loja: "farma-centro", senha: SENHA_WORKER });
    conferir("a PAINEL_KEY não abre a loja que já tem senha", r.status === 401, String(r.status));
}

/* ---- 6. loja apontando para banco que ninguém ligou ----------------- */
console.log("\n6. loja cadastrada apontando para um banco inexistente");
{
    compartilhado.exec(`
        INSERT INTO lojas (slug, nome, ativo, criado_em)
        VALUES ('sem-banco', 'Farmácia Sem Banco', 1, '2099-01-02 00:00:00')
    `);
    compartilhado.exec(`
        INSERT INTO lojas_acesso (slug, banco) VALUES ('sem-banco', 'DB_QUE_NAO_EXISTE')
    `);

    limparTentativas();
    const r = await pedir("/fila", { loja: "sem-banco", senha: SENHA_WORKER });
    conferir("responde 503, e não grava na base de outra loja", r.status === 503, String(r.status));

    const corpo = await r.json();
    conferir("e diz qual binding está faltando",
        /DB_QUE_NAO_EXISTE/.test(corpo.erro || ""), corpo.erro);
}

/* ---- 7. as rotas públicas ------------------------------------------- */
console.log("\n7. rotas públicas: a loja vem do endereço, e pode");
{
    const semLoja = await (await pedir("/promocoes")).json();
    conferir("sem ?loja=, a vitrine é a da primeira farmácia",
        (semLoja.promocoes || []).some((p) => p.codigo === "AAA111"), JSON.stringify(semLoja));

    const comLoja = await (await pedir("/promocoes?loja=farma-centro")).json();
    const cods = (comLoja.promocoes || []).map((p) => p.codigo);
    conferir("com ?loja=, é a da outra, e só dela",
        cods.includes("BBB222") && !cods.includes("AAA111"), cods.join(","));

    const inventada = await pedir("/promocoes?loja=nao-existe");
    conferir("loja inventada dá 404", inventada.status === 404, String(inventada.status));
}

/* ---- 8. o limite de tentativas continua por IP ---------------------- */
console.log("\n8. o limite de tentativas é por IP, não por (IP, loja)");
{
    limparTentativas();

    /* Errando em lojas diferentes, do mesmo IP: se o limite fosse por
       (IP, loja), trocar de loja renovaria o orçamento, e com 30
       farmácias um atacante teria 150 tentativas em vez de 5. */
    let bloqueou = false;
    for (let i = 0; i < 12; i++) {
        const alvo = i % 2 === 0 ? "mais-barato" : "farma-centro";
        const r = await pedir("/fila", { loja: alvo, senha: "errada" + i, ip: "9.9.9.9" });
        if (r.status === 429) { bloqueou = true; break; }
    }
    conferir("alternar de loja não renova as tentativas", bloqueou);

    /* E o bloqueio é do IP que errou, não do mundo. */
    const outroIp = await pedir("/fila", { senha: SENHA_WORKER, ip: "5.5.5.5" });
    conferir("outro IP não é afetado", outroIp.status === 200, String(outroIp.status));
}

/* ---- 9. o cadastro de lojas fora do ar ------------------------------ */
console.log("\n9. sem cadastro de lojas, ninguém fica trancado para fora");
{
    /* O portão passou a depender da tabela `lojas`. Se ela estiver vazia,
       inacessível, ou ainda não criada — worker publicado antes do SQL —,
       a farmácia não pode ficar trancada fora do próprio painel no meio
       do expediente. Seria estrago maior do que o que esta fase veio
       evitar.

       A saída é tolerar na IDENTIFICAÇÃO, nunca na autenticação: sem
       cadastro, vale a loja anônima, com o banco de sempre e a
       PAINEL_KEY de sempre. E não há como vazar entre lojas nesse
       estado, porque não existe segunda loja. */
    const vazio = new DatabaseSync(":memory:");
    vazio.exec(semComentario(operacional));
    vazio.exec(semComentario(ler("schema-lojas.sql")).replace(/INSERT OR IGNORE[\s\S]*?;/g, ""));
    vazio.exec(semComentario(ler("schema-acesso.sql")));
    vazio.exec(`
        INSERT INTO pedidos (ref, criado_em, cliente, telefone, entrega, total, status)
        VALUES ('S-001', ${AGORA}, 'Alguém', '11900000000', 'Retirada', 10.0, 'novo')
    `);

    const envVazio = { DB: fingirD1(vazio), PAINEL_KEY: SENHA_WORKER };
    const pedirVazio = (caminho, senha, loja) => worker.fetch(new Request(
        "https://exemplo.workers.dev" + caminho,
        { headers: {
            "CF-Connecting-IP": "7.7.7." + Math.floor(Math.random() * 200 + 10),
            ...(senha === undefined ? {} : { "X-Painel-Key": senha }),
            ...(loja === undefined ? {} : { "X-Painel-Loja": loja })
        } }
    ), envVazio);

    const r = await pedirVazio("/fila", SENHA_WORKER);
    conferir("com a senha certa, o painel abre", r.status === 200, String(r.status));

    const refs = ((await r.json()).pedidos || []).map((p) => p.ref);
    conferir("e mostra os pedidos", refs.includes("S-001"), refs.join(","));

    const errada = await pedirVazio("/fila", "senha-errada");
    conferir("mas a senha continua obrigatória", errada.status === 401, String(errada.status));

    const vitrine = await pedirVazio("/promocoes");
    conferir("e a vitrine pública não vira 404", vitrine.status === 200, String(vitrine.status));

    /* Nomear uma loja que não existe continua barrado: a tolerância é só
       para quem não pediu loja nenhuma. */
    const nomeando = await pedirVazio("/fila", SENHA_WORKER, "farma-centro");
    conferir("nomear loja inexistente continua barrado", nomeando.status === 401, String(nomeando.status));
}

/* ---- 10. os arquivos no R2 ------------------------------------------ */
console.log("\n10. os arquivos de cada farmácia, no balde que é um só");
{
    const enviar = (loja, senha, tipo, bytes) => worker.fetch(new Request(
        "https://exemplo.workers.dev/arquivos?pasta=banner",
        {
            method: "POST",
            headers: {
                "Content-Type": tipo,
                "X-Painel-Key": senha,
                "CF-Connecting-IP": "8.8.8." + Math.floor(Math.random() * 200 + 10),
                ...(loja ? { "X-Painel-Loja": loja } : {})
            },
            body: bytes
        }
    ), env);

    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

    limparTentativas();
    const envioA = await (await enviar(null, SENHA_WORKER, "image/png", png)).json();
    conferir("a loja de sempre grava sem prefixo, onde os arquivos dela já estão",
        /^banner\//.test(envioA.chave || ""), envioA.chave);

    limparTentativas();
    const envioB = await (await enviar("farma-centro", SENHA_B, "image/png", png)).json();
    conferir("a farmácia nova grava debaixo do prefixo dela",
        /^farma-centro\/banner\//.test(envioB.chave || ""), envioB.chave);

    conferir("as duas chaves são distintas no mesmo balde",
        envioA.chave !== envioB.chave && balde.conteudo.has(envioA.chave) && balde.conteudo.has(envioB.chave));

    /* Servir: os dois formatos de endereço precisam responder, porque o
       sem prefixo já está publicado na home e dentro de encarte. */
    const servir = (caminho) => worker.fetch(new Request("https://exemplo.workers.dev" + caminho), env);

    const semPrefixo = await servir("/arquivos/" + envioA.chave);
    conferir("endereço de sempre continua servindo", semPrefixo.status === 200, String(semPrefixo.status));

    const comPrefixo = await servir("/arquivos/" + envioB.chave);
    conferir("endereço com prefixo também", comPrefixo.status === 200, String(comPrefixo.status));

    const inventado = await servir("/arquivos/farma-centro/banner/nao-existe.png");
    conferir("arquivo que não existe dá 404", inventado.status === 404, String(inventado.status));

    /* Apagar: a parede. A primeira, e a que realmente isola, é o banco
       separado — a chave vem da tabela da própria loja. Esta é a
       segunda, porque apagar errado não tem desfazer. */
    bancoB.exec(`
        INSERT INTO banners (id, imagem, alt, ativo, ordem, criado_em, r2_chave)
        VALUES (90, 'https://x/b.png', 'da outra loja', 1, 1, ${AGORA}, '${envioA.chave}')
    `);

    limparTentativas();
    const apagar = await worker.fetch(new Request("https://exemplo.workers.dev/banners/excluir", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Painel-Key": SENHA_B,
            "X-Painel-Loja": "farma-centro",
            "CF-Connecting-IP": "8.8.9.1"
        },
        body: JSON.stringify({ id: 90 })
    }), env);

    conferir("o pedido de apagar é aceito", apagar.status === 200, String(apagar.status));
    conferir("mas o arquivo da OUTRA loja não foi apagado",
        balde.conteudo.has(envioA.chave) && !balde.apagados.includes(envioA.chave),
        balde.apagados.join(","));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
