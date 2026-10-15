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
const SENHA_DONO = "chave-de-quem-administra-a-plataforma";

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
                    const r = db.prepare(s).run(...a);
                    /* meta.changes e meta.last_row_id existem no D1 de
                       verdade, e handlers os usam. Sem eles aqui, o teste
                       passava a mentir: um UPDATE que funcionou parecia
                       não ter achado nada. */
                    return {
                        success: true,
                        meta: {
                            changes: Number(r.changes ?? 0),
                            last_row_id: Number(r.lastInsertRowid ?? 0)
                        }
                    };
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
compartilhado.exec(semComentario(ler("schema-visual.sql")));

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
    PAINEL_KEY: SENHA_WORKER,
    DONO_KEY: SENHA_DONO
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
    vazio.exec(semComentario(ler("schema-visual.sql")));
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

/* ---- 11. a chave do dono da plataforma ------------------------------ */
console.log("\n11. a chave do dono abre qualquer farmácia");
{
    /* Quem administra a plataforma precisa entrar em qualquer loja: para
       cadastrar a senha da farmácia nova, para dar suporte quando a dona
       liga dizendo que o encarte sumiu. Sem isso, cada atendimento
       viraria "me passa sua senha", que é a pior coisa que se pode
       ensinar um cliente a fazer.

       O que esta seção precisa provar é que esse poder é da DONO_KEY, e
       NÃO da senha de uma loja — senão a dona da primeira farmácia
       entraria no painel das concorrentes da rede. */
    const comoDono = (caminho, loja, extra = {}) => worker.fetch(new Request(
        "https://exemplo.workers.dev" + caminho,
        {
            headers: {
                "X-Painel-Key": SENHA_DONO,
                "CF-Connecting-IP": "10.0.0." + Math.floor(Math.random() * 200 + 10),
                ...(loja ? { "X-Painel-Loja": loja } : {}),
                ...extra
            },
            ...(extra.method ? { method: extra.method } : {})
        }
    ), env);

    limparTentativas();
    const naA = await comoDono("/fila", "mais-barato");
    const refsA = ((await naA.json()).pedidos || []).map((p) => p.ref);
    conferir("entra na primeira farmácia", refsA.includes("A-001"), refsA.join(","));

    limparTentativas();
    const naB = await comoDono("/fila", "farma-centro");
    const refsB = ((await naB.json()).pedidos || []).map((p) => p.ref);
    conferir("e na segunda, que tem senha própria", refsB.includes("B-001"), refsB.join(","));

    /* O ponto da seção: entrar nas duas NÃO pode significar ver as duas
       juntas. Cada visita é dentro de uma loja. */
    conferir("mas vê uma de cada vez, nunca as duas misturadas",
        !refsA.some((r) => String(r).startsWith("B-")) && !refsB.some((r) => String(r).startsWith("A-")),
        `A=${refsA.join(",")} B=${refsB.join(",")}`);

    limparTentativas();
    const sessao = await (await comoDono("/sessao", "farma-centro")).json();
    conferir("a sessão diz que é dono", sessao.dono === true, JSON.stringify(sessao));
    conferir("e diz em qual farmácia ele está", sessao.loja.slug === "farma-centro", JSON.stringify(sessao.loja));

    limparTentativas();
    const lista = await (await comoDono("/lojas")).json();
    const slugs = (lista.lojas || []).map((l) => l.slug);
    conferir("lista as farmácias da plataforma",
        slugs.includes("mais-barato") && slugs.includes("farma-centro"), slugs.join(","));

    const comSenha = (lista.lojas || []).find((l) => l.slug === "farma-centro");
    conferir("e diz quais já têm senha própria", comSenha && comSenha.tem_senha === 1, JSON.stringify(comSenha));
    conferir("sem passear hash nem sal pela API",
        !JSON.stringify(lista).includes("hash") || !(lista.lojas || []).some((l) => l.hash || l.sal),
        JSON.stringify(lista).slice(0, 120));

    /* O dono cadastra a senha de qualquer uma — é como a farmácia nova
       recebe a primeira. */
    limparTentativas();
    const trocou = await worker.fetch(new Request("https://exemplo.workers.dev/loja/senha", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Painel-Key": SENHA_DONO,
            "CF-Connecting-IP": "10.0.1.1"
        },
        body: JSON.stringify({ slug: "farma-centro", senha: "nova-senha-da-farma" })
    }), env);
    conferir("troca a senha de qualquer farmácia", trocou.status === 200, String(trocou.status));

    limparTentativas();
    const comNova = await pedir("/fila", { loja: "farma-centro", senha: "nova-senha-da-farma" });
    conferir("e a senha nova passa a valer", comNova.status === 200, String(comNova.status));

    limparTentativas();
    const comVelha = await pedir("/fila", { loja: "farma-centro", senha: SENHA_B });
    conferir("enquanto a antiga deixa de valer", comVelha.status === 401, String(comVelha.status));
}

/* ---- 12. e quem NÃO é dono não vira dono ---------------------------- */
console.log("\n12. a senha de uma farmácia não abre a plataforma");
{
    /* Esta é a seção que justifica a DONO_KEY existir separada. Se a
       PAINEL_KEY, que é a senha de UMA loja, também abrisse as outras, a
       dona da primeira farmácia entraria no painel das concorrentes da
       rede — e ninguém teria decidido isso. */
    limparTentativas();
    const r = await pedir("/lojas", { senha: SENHA_WORKER });
    conferir("a senha da loja não lista as farmácias", r.status === 403, String(r.status));

    limparTentativas();
    const r2 = await pedir("/lojas", { loja: "farma-centro", senha: "nova-senha-da-farma" });
    conferir("a senha da outra farmácia também não", r2.status === 403, String(r2.status));

    limparTentativas();
    const r3 = await pedir("/fila", { loja: "farma-centro", senha: SENHA_WORKER });
    conferir("e continua sem abrir a loja alheia", r3.status === 401, String(r3.status));

    limparTentativas();
    const r4 = await pedir("/sessao", { senha: SENHA_WORKER });
    const s = await r4.json();
    conferir("a sessão dela não se diz dona", s.dono === false, JSON.stringify(s));

    /* Sem DONO_KEY configurada, ninguém é dono — nem quem acerta a senha
       da loja. É o estado de hoje, antes de alguém criar o secret. */
    const semDono = { ...env, DONO_KEY: undefined };
    const r5 = await worker.fetch(new Request("https://exemplo.workers.dev/lojas", {
        headers: { "X-Painel-Key": SENHA_WORKER, "CF-Connecting-IP": "10.0.2.1" }
    }), semDono);
    conferir("sem DONO_KEY configurada, ninguém é dono", r5.status === 403, String(r5.status));
}

/* ---- 13. o preflight do navegador ----------------------------------- */
console.log("\n13. CORS: todo cabeçalho que o worker lê tem de ser permitido");
{
    /* De onde saiu esta seção: o painel passou a mandar a filial em
       X-Painel-Loja, o cabeçalho não estava na lista do
       Access-Control-Allow-Headers, e TUDO depois do login parou. O erro
       na tela era "Failed to fetch", que não diz uma palavra sobre CORS.

       Nenhum dos testes pegou. O de navegador intercepta as requisições,
       e interceptação não faz preflight. Este aqui chama o handler
       direto, sem navegador nenhum. A única defesa que sobra é comparar
       as duas listas lendo o próprio arquivo — é o que esta seção faz, e
       ela continua valendo para o próximo cabeçalho que alguém criar. */
    const codigo = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

    const lidos = [...new Set(
        [...codigo.matchAll(/headers\.get\("(X-[A-Za-z-]+)"\)/g)].map((m) => m[1])
    )];

    const resposta = await worker.fetch(
        new Request("https://exemplo.workers.dev/fila", { method: "OPTIONS" }), env);

    const permitidos = (resposta.headers.get("access-control-allow-headers") || "")
        .split(",").map((s) => s.trim().toLowerCase());

    /* X-Forwarded-For não entra: quem o põe é a borda, não o navegador. */
    const doNavegador = lidos.filter((h) => h.toLowerCase() !== "x-forwarded-for");

    const faltando = doNavegador.filter((h) => !permitidos.includes(h.toLowerCase()));

    conferir(`os ${doNavegador.length} cabeçalhos que o worker lê estão na lista do CORS`,
        faltando.length === 0,
        "faltam: " + faltando.join(", "));

    conferir("e o OPTIONS responde sem exigir senha",
        resposta.status === 200 || resposta.status === 204, String(resposta.status));
}

/* ---- 14. filial cadastrada SEM banco próprio ------------------------ */
console.log("\n14. filial nova sem banco próprio não cai no banco da primeira");
{
    /* O buraco que isto fecha, e que estava no ar: `banco` vazio quer
       dizer "use o principal". Isso é certo para a farmácia que já
       existia — é o que permitiu a Fase 3 subir sem mover dado. Para
       qualquer OUTRA, é o vazamento inteiro de volta: a loja nova
       gravaria pedido dentro do banco da primeira, e o painel dela
       mostraria a fila da primeira. Com 200 em tudo.

       É o erro mais fácil de cometer cadastrando filial na mão: basta
       esquecer uma coluna do INSERT. */
    compartilhado.exec(`
        INSERT INTO lojas (slug, nome, ativo, criado_em)
        VALUES ('sem-banco-proprio', 'Farmácia Esquecida', 1, '2099-03-01 00:00:00')
    `);

    limparTentativas();
    const r = await pedir("/fila", { loja: "sem-banco-proprio", senha: SENHA_WORKER });

    conferir("recusa em vez de atender no banco da primeira",
        r.status === 503, String(r.status));

    const corpo = await r.json().catch(() => ({}));
    conferir("e explica o que falta cadastrar",
        /banco/i.test(corpo.erro || ""), corpo.erro);

    /* E o principal: nada da loja nova encostou no banco da primeira. */
    const pedidosDaPrimeira = compartilhado.prepare(
        "SELECT COUNT(*) AS n FROM pedidos WHERE ref LIKE 'A-%'").get().n;
    conferir("os pedidos da primeira continuam intactos", pedidosDaPrimeira === 2, String(pedidosDaPrimeira));

    /* A primeira continua usando o banco principal, que é o caso certo
       de banco vazio — a correção não pode fechar essa porta. */
    limparTentativas();
    const primeira = await pedir("/fila", { loja: "mais-barato", senha: SENHA_WORKER });
    conferir("a farmácia original segue entrando com banco vazio",
        primeira.status === 200, String(primeira.status));
}

/* ---- 15. cadastrar filial pelo painel -------------------------------- */
console.log("\n15. cadastrar filial sem escrever SQL");
{
    const comoDono = (caminho, corpo, metodo = "POST") => worker.fetch(new Request(
        "https://exemplo.workers.dev" + caminho,
        {
            method: metodo,
            headers: {
                "X-Painel-Key": SENHA_DONO,
                "Content-Type": "application/json",
                "CF-Connecting-IP": "11.0.0." + Math.floor(Math.random() * 200 + 10)
            },
            ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) })
        }
    ), env);

    limparTentativas();
    const criada = await comoDono("/lojas", {
        slug: "farma-nova", nome: "Farmácia Nova",
        cnpj: "99.888.777/0001-66",
        logradouro: "Rua das Flores", numeroEndereco: "42", bairro: "Centro",
        cidade: "Santos", uf: "SP", cep: "11010-000",
        whatsapp: "(13) 99999-8888",
        farmaceutico: "Dra. Ana Lima", crf: "445566",
        rotuloResponsavel: "Farmacêutica responsável",
        raioEntregaKm: 10, fuso: "America/Sao_Paulo"
    });

    conferir("cadastra a filial", criada.status === 200, String(criada.status));
    const dados = await criada.json();

    conferir("deriva o nome do binding do apelido",
        dados.banco === "DB_FARMA_NOVA", dados.banco);
    conferir("e diz o que ainda falta fazer na Cloudflare",
        !!(dados.faltaFazer && dados.faltaFazer.bancoD1 && dados.faltaFazer.binding),
        JSON.stringify(dados.faltaFazer));

    const linha = compartilhado.prepare(
        "SELECT nome, cnpj, whatsapp, raio_entrega_km, ativo FROM lojas WHERE slug='farma-nova'").get();
    conferir("gravou os dados", linha.nome === "Farmácia Nova" && linha.cnpj === "99.888.777/0001-66",
        JSON.stringify(linha));
    conferir("limpou o telefone para só dígitos", linha.whatsapp === "13999998888", linha.whatsapp);
    conferir("nasce DESLIGADA", linha.ativo === 0, String(linha.ativo));

    const h = compartilhado.prepare(
        "SELECT COUNT(*) AS n FROM lojas_horario WHERE slug='farma-nova'").get().n;
    conferir("e já com os 7 dias de horário padrão", h === 7, String(h));

    limparTentativas();
    const repetida = await comoDono("/lojas", { slug: "farma-nova", nome: "Outra" });
    conferir("não deixa cadastrar o mesmo apelido duas vezes", repetida.status === 409, String(repetida.status));

    /* ---- a conferência, que é a parte que importa ---- */
    limparTentativas();
    const conf1 = await (await comoDono("/lojas/farma-nova/conferir", undefined, "GET")).json();
    conferir("a conferência reprova enquanto falta o banco",
        conf1.podeLigar === false, JSON.stringify(conf1.conferencias?.map(c => c.o + "=" + c.ok)));

    const semBinding = (conf1.conferencias || []).find((c) => c.o === "binding ligado ao worker");
    conferir("e diz exatamente qual binding falta",
        semBinding && !semBinding.ok && /DB_FARMA_NOVA/.test(semBinding.recado), semBinding?.recado);

    limparTentativas();
    const naoLiga = await comoDono("/lojas/farma-nova/ativo", { ativo: true });
    conferir("e ligar é recusado com 409", naoLiga.status === 409, String(naoLiga.status));

    /* Agora o binding existe, mas apontando para o banco PRINCIPAL — que
       é o erro mais caro possível, e o que a conferência tem de pegar. */
    limparTentativas();
    const envErrado = { ...env, DB_FARMA_NOVA: fingirD1(compartilhado) };
    const conf2 = await (await worker.fetch(new Request(
        "https://exemplo.workers.dev/lojas/farma-nova/conferir",
        { headers: { "X-Painel-Key": SENHA_DONO, "CF-Connecting-IP": "11.0.1.1" } }
    ), envErrado)).json();

    const separado = (conf2.conferencias || []).find((c) => c.o === "banco separado do principal");
    conferir("pega o binding apontando para o banco principal",
        separado && !separado.ok, JSON.stringify(separado));
    conferir("e não deixa ligar nesse estado", conf2.podeLigar === false, String(conf2.podeLigar));

    /* E, finalmente, com o banco certo. */
    const bancoNovo = new DatabaseSync(":memory:");
    bancoNovo.exec(semComentario(operacional));
    const envCerto = { ...env, DB_FARMA_NOVA: fingirD1(bancoNovo) };

    const conf3 = await (await worker.fetch(new Request(
        "https://exemplo.workers.dev/lojas/farma-nova/conferir",
        { headers: { "X-Painel-Key": SENHA_DONO, "CF-Connecting-IP": "11.0.2.1" } }
    ), envCerto)).json();
    conferir("aprova quando o banco é próprio e tem as tabelas",
        conf3.podeLigar === true, JSON.stringify(conf3.conferencias?.filter(c => !c.ok)));

    const ligou = await worker.fetch(new Request("https://exemplo.workers.dev/lojas/farma-nova/ativo", {
        method: "POST",
        headers: { "X-Painel-Key": SENHA_DONO, "Content-Type": "application/json", "CF-Connecting-IP": "11.0.3.1" },
        body: JSON.stringify({ ativo: true })
    }), envCerto);
    conferir("e aí liga", ligou.status === 200, String(ligou.status));

    const depois = compartilhado.prepare("SELECT ativo FROM lojas WHERE slug='farma-nova'").get();
    conferir("a filial fica no ar", depois.ativo === 1, String(depois.ativo));

    /* Desligar não depende de nada estar certo: tirar do ar é sempre
       possível. */
    const desligou = await worker.fetch(new Request("https://exemplo.workers.dev/lojas/farma-nova/ativo", {
        method: "POST",
        headers: { "X-Painel-Key": SENHA_DONO, "Content-Type": "application/json", "CF-Connecting-IP": "11.0.4.1" },
        body: JSON.stringify({ ativo: false })
    }), env);   // env SEM o binding, de propósito
    conferir("e desligar funciona mesmo com o binding fora do ar",
        desligou.status === 200, String(desligou.status));
}

/* ---- 16. nada disso é acessível a quem não é dono -------------------- */
console.log("\n16. cadastrar filial é só do dono");
{
    for (const [caminho, metodo, corpo] of [
        ["/lojas", "POST", { slug: "pirata", nome: "Pirata" }],
        ["/lojas/farma-nova/conferir", "GET", undefined],
        ["/lojas/farma-nova/ativo", "POST", { ativo: true }]
    ]) {
        limparTentativas();
        const r = await worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
            method: metodo,
            headers: {
                "X-Painel-Key": SENHA_WORKER,
                "Content-Type": "application/json",
                "CF-Connecting-IP": "12.0.0." + Math.floor(Math.random() * 200 + 10)
            },
            ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) })
        }), env);
        conferir(`${metodo} ${caminho} recusa a senha de loja`, r.status === 403, String(r.status));
    }

    const pirata = compartilhado.prepare("SELECT COUNT(*) AS n FROM lojas WHERE slug='pirata'").get().n;
    conferir("e nenhuma filial foi criada por quem não podia", pirata === 0, String(pirata));
}

/* ---- 17. o logotipo e a cor de cada farmácia ------------------------ */
console.log("\n17. a marca de cada filial");
{
    const comoDono = (caminho, opcoes = {}) => worker.fetch(new Request(
        "https://exemplo.workers.dev" + caminho,
        {
            method: opcoes.metodo || "POST",
            headers: {
                "X-Painel-Key": SENHA_DONO,
                "CF-Connecting-IP": "13.0.0." + Math.floor(Math.random() * 200 + 10),
                ...(opcoes.tipo ? { "Content-Type": opcoes.tipo } : {}),
                ...(opcoes.loja ? { "X-Painel-Loja": opcoes.loja } : {})
            },
            ...(opcoes.corpo === undefined ? {} : { body: opcoes.corpo })
        }
    ), env);

    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

    limparTentativas();
    const envio = await comoDono("/lojas/farma-centro/logo", { tipo: "image/png", corpo: png });
    conferir("o dono manda o logotipo de qualquer filial", envio.status === 200, String(envio.status));

    const resultado = await envio.json();
    conferir("e o arquivo vai para a pasta DELA, não a de quem está autenticado",
        /\/arquivos\/farma-centro\/marca\/logo-/.test(resultado.logo || ""), resultado.logo);
    conferir("o arquivo está mesmo no balde",
        [...balde.conteudo.keys()].some((k) => k.startsWith("farma-centro/marca/")),
        [...balde.conteudo.keys()].join(","));

    /* Trocar o logotipo apaga o anterior: senão o balde acumula um
       arquivo por troca, para sempre, e ninguém sabe qual está em uso. */
    /* Dois envios seguidos, sem espera nenhuma entre eles — de propósito.

       Na primeira versão o nome era só logo-<hora-em-ms>, e este teste
       falhava uma vez a cada seis: quando as duas gravações caíam no
       mesmo milissegundo, o endereço saía idêntico. Pessoa nenhuma
       clica duas vezes no mesmo milissegundo, mas um script subindo o
       logotipo de trinta filiais, sim — e aí o cache de um ano
       continuaria servindo a imagem velha. */
    const antigo = resultado.logo.split("/arquivos/")[1];
    limparTentativas();
    const troca = await comoDono("/lojas/farma-centro/logo", { tipo: "image/png", corpo: png });
    const novoLogo = (await troca.json()).logo;
    conferir("trocar gera endereço novo, mesmo no mesmo milissegundo",
        novoLogo !== resultado.logo, novoLogo);
    conferir("e apaga o anterior do balde",
        balde.apagados.includes(antigo), balde.apagados.join(","));

    /* SVG fica de fora de propósito: é XML, aceita <script> dentro, e
       seria servido do nosso domínio dentro de um <img> em todas as
       páginas da loja. */
    limparTentativas();
    const svg = await comoDono("/lojas/farma-centro/logo",
        { tipo: "image/svg+xml", corpo: new TextEncoder().encode("<svg/>") });
    conferir("recusa SVG", svg.status === 415, String(svg.status));

    /* ---- a cor ---- */
    limparTentativas();
    const cor = await comoDono("/lojas/farma-centro/cor",
        { tipo: "application/json", corpo: JSON.stringify({ cor: "#0a7d4b" }) });
    conferir("grava a cor", cor.status === 200, String(cor.status));

    for (const ruim of ["vermelho", "#fff", "red; } body { display:none", "#12345g"]) {
        limparTentativas();
        const r = await comoDono("/lojas/farma-centro/cor",
            { tipo: "application/json", corpo: JSON.stringify({ cor: ruim }) });
        conferir(`recusa cor fora do formato: ${JSON.stringify(ruim)}`, r.status === 400, String(r.status));
    }

    /* A rota pública devolve a marca para o site desenhar. */
    const publico = await (await worker.fetch(
        new Request("https://exemplo.workers.dev/loja?slug=farma-centro"), env)).json();
    conferir("a rota pública entrega logotipo e cor",
        publico.visual && publico.visual.cor === "#0a7d4b" && !!publico.visual.logo,
        JSON.stringify(publico.visual));

    const semMarca = await (await worker.fetch(
        new Request("https://exemplo.workers.dev/loja?slug=mais-barato"), env)).json();
    conferir("e devolve nulo para quem usa a marca padrão",
        semMarca.visual === null, JSON.stringify(semMarca.visual));

    /* ---- quem não é dono só mexe na própria ---- */
    limparTentativas();
    const alheia = await worker.fetch(new Request(
        "https://exemplo.workers.dev/lojas/farma-centro/cor",
        {
            method: "POST",
            headers: { "X-Painel-Key": SENHA_WORKER, "Content-Type": "application/json",
                       "CF-Connecting-IP": "13.1.0.1" },
            body: JSON.stringify({ cor: "#000000" })
        }), env);
    conferir("uma farmácia não troca a cor da outra", alheia.status === 403, String(alheia.status));
}

/* ---- 18. tirar o logotipo -------------------------------------------- */
console.log("\n18. tirar o logotipo faz a filial voltar à marca da casa");
{
    const comChave = (caminho, metodo, chave, loja) => worker.fetch(new Request(
        "https://exemplo.workers.dev" + caminho,
        {
            method: metodo,
            headers: {
                "X-Painel-Key": chave,
                "CF-Connecting-IP": "14.0.0." + Math.floor(Math.random() * 200 + 10),
                ...(loja ? { "X-Painel-Loja": loja } : {})
            }
        }
    ), env);

    /* A farma-centro ficou com logotipo na seção 17. */
    const antes = await (await worker.fetch(
        new Request("https://exemplo.workers.dev/loja?slug=farma-centro"), env)).json();
    const chaveDoArquivo = (antes.visual.logo || "").split("/arquivos/")[1];
    conferir("ela tem logotipo antes", !!chaveDoArquivo, antes.visual.logo);
    conferir("e o arquivo está no balde", balde.conteudo.has(chaveDoArquivo));

    limparTentativas();
    const apagou = await comChave("/lojas/farma-centro/logo", "DELETE", SENHA_DONO);
    conferir("o dono tira o logotipo", apagou.status === 200, String(apagou.status));

    const depois = await (await worker.fetch(
        new Request("https://exemplo.workers.dev/loja?slug=farma-centro"), env)).json();
    conferir("a rota pública passa a devolver logotipo nulo",
        !depois.visual.logo, JSON.stringify(depois.visual));

    /* O arquivo some do balde junto. Deixá-lo lá acumularia logotipo de
       cliente antigo para sempre — e logotipo de ex-cliente guardado é
       coisa que ninguém quer ter de explicar depois. */
    conferir("e o arquivo sai do balde", !balde.conteudo.has(chaveDoArquivo),
        [...balde.conteudo.keys()].join(","));

    /* A cor continua: são duas coisas, e tirar uma não tira a outra. */
    conferir("mas a cor continua", depois.visual.cor === "#0a7d4b", JSON.stringify(depois.visual));

    /* Tirar duas vezes não quebra: quem clica de novo não leva erro. */
    limparTentativas();
    const outraVez = await comChave("/lojas/farma-centro/logo", "DELETE", SENHA_DONO);
    conferir("tirar de novo é inofensivo", outraVez.status === 200, String(outraVez.status));

    limparTentativas();
    const alheia = await comChave("/lojas/farma-centro/logo", "DELETE", SENHA_WORKER);
    conferir("uma farmácia não tira o logotipo da outra", alheia.status === 403, String(alheia.status));

    limparTentativas();
    const inexistente = await comChave("/lojas/nao-existe-essa/logo", "DELETE", SENHA_DONO);
    conferir("filial que não existe dá 404", inexistente.status === 404, String(inexistente.status));
}

/* ---- 19. a listagem mostra a marca de cada uma ---------------------- */
console.log("\n19. a listagem traz logotipo e cor");
{
    limparTentativas();
    const lista = await (await worker.fetch(new Request("https://exemplo.workers.dev/lojas", {
        headers: { "X-Painel-Key": SENHA_DONO, "CF-Connecting-IP": "14.1.0.1" }
    }), env)).json();

    const centro = (lista.lojas || []).find((l) => l.slug === "farma-centro");
    conferir("a filial com cor própria aparece com ela",
        centro && centro.cor === "#0a7d4b", JSON.stringify(centro && centro.cor));

    const primeira = (lista.lojas || []).find((l) => l.slug === "mais-barato");
    conferir("e quem usa a marca da casa vem com os campos nulos",
        primeira && !primeira.logo && !primeira.cor,
        JSON.stringify(primeira && { logo: primeira.logo, cor: primeira.cor }));
}

/* ---- 20. um catálogo por farmácia ------------------------------------ */
console.log("\n20. cada farmácia publica no catálogo dela");
{
    /* O problema: até aqui o produtos.json era um só. A filial nova
       mostraria o preço e o estoque da primeira — e publicar pela segunda
       apagaria o catálogo da primeira. É o que impedia vender a plataforma
       para farmácia de outro dono. */

    const primeira = await (await worker.fetch(
        new Request("https://exemplo.workers.dev/loja?slug=mais-barato"), env)).json();
    conferir("a farmácia original continua em produtos.json",
        /\/produtos\.json$/.test(primeira.catalogo || ""), primeira.catalogo);

    const filial = await (await worker.fetch(
        new Request("https://exemplo.workers.dev/loja?slug=farma-centro"), env)).json();
    conferir("a filial tem o arquivo dela",
        /\/produtos-farma-centro\.json$/.test(filial.catalogo || ""), filial.catalogo);

    conferir("e os dois endereços são diferentes",
        primeira.catalogo !== filial.catalogo);

    /* O porteiro diz ao publish-proxy qual farmácia está publicando. O
       padronizador não mudou uma linha: ele chama /catalogo/publicar como
       sempre, e quem sabe de que loja se trata é o worker. */
    const chamadas = [];
    const servicoDePublicacao = {
        async fetch(pedido) {
            chamadas.push(pedido.url);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200, headers: { "Content-Type": "application/json" }
            });
        }
    };

    const envPublica = {
        ...env,
        PUBLISH_SERVICE: servicoDePublicacao,
        PUBLISH_WORKER_URL: "https://publicar.exemplo.dev",
        PUBLISH_KEY: "chave-de-publicar"
    };

    const publicar = (senha, loja) => worker.fetch(new Request(
        "https://exemplo.workers.dev/catalogo/publicar",
        {
            method: "POST",
            headers: {
                "X-Painel-Key": senha,
                "Content-Type": "application/json",
                "CF-Connecting-IP": "15.0.0." + Math.floor(Math.random() * 200 + 10),
                ...(loja ? { "X-Painel-Loja": loja } : {})
            },
            body: JSON.stringify({ produtos: [{ ean: "789", descricao: "x" }] })
        }
    ), envPublica);

    limparTentativas();
    await publicar(SENHA_WORKER, "mais-barato");
    conferir("publicando pela original, NÃO manda loja nenhuma",
        chamadas.length === 1 && !/[?&]loja=/.test(chamadas[0]), chamadas[0]);

    chamadas.length = 0;
    limparTentativas();
    await publicar(SENHA_DONO, "farma-centro");
    conferir("publicando pela filial, manda o slug dela",
        chamadas.length === 1 && /[?&]loja=farma-centro/.test(chamadas[0]), chamadas[0]);

    /* O slug vai de quem PROVOU A SENHA. Mandar o slug de outra farmácia
       sem a senha dela não publica no catálogo dela — para antes, no
       portão. */
    chamadas.length = 0;
    limparTentativas();
    const atravessar = await publicar(SENHA_WORKER, "farma-centro");
    conferir("não dá para publicar no catálogo alheio", atravessar.status === 401, String(atravessar.status));
    conferir("e nada foi encaminhado", chamadas.length === 0, chamadas.join(","));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
