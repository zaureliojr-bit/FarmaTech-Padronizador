/* Editar uma filial já cadastrada.

   Faltava desde o começo, e a falta aparecia no pior momento: a farmácia
   troca de WhatsApp, muda de endereço, o farmacêutico responsável sai —
   e o único caminho era mexer no banco pelo console do D1, à mão, numa
   tabela com trinta colunas.

   O que este teste protege, em ordem de estrago:

   1. O APELIDO NÃO MUDA. Ele é o endereço do site, o prefixo das
      imagens no R2, o nome do binding do banco e o carimbo já colado em
      anúncio pago. Renomeá-lo deixaria tudo isso apontando para o lugar
      antigo, em silêncio — e o pior é que a loja continuaria abrindo,
      vazia.

   2. QUEM NÃO É DONO NÃO EDITA. Nem a própria loja: CNPJ, CRF e
      responsável técnico são o que a vigilância confere, e quem os
      cadastra é quem instala.

   3. CAMPO AUSENTE NÃO VIRA CAMPO APAGADO. É o que permite mandar só o
      que mudou, e o que impede um formulário antigo de limpar uma
      coluna nova sem querer.

   4. LIGAR LOJA NÃO PASSA POR AQUI. Ativar tem conferência própria
      (banco, schema, horário); deixar `ativo` entrar na edição daria um
      caminho para ligar filial sem conferir nada.

   Uso: node teste-editar-filial.mjs
*/

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript," + encodeURIComponent(fonte))).default;

const ler = (nome) => readFileSync(new URL("./" + nome, import.meta.url), "utf8");

let falhas = 0;
const conferir = (d, c, det = "") => {
    if (c) console.log(`  ok   ${d}`);
    else { console.log(`  FALHA ${d}${det ? "  → " + det : ""}`); falhas++; }
};

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
            const stmt = {
                _sql: sql,
                get _ligados() { return ligados; },
                bind(...a) { ligados = a; return stmt; },
                async first() { const [s, a] = traduzir(sql, ligados); return db.prepare(s).get(...a) ?? null; },
                async all() { const [s, a] = traduzir(sql, ligados); return { results: db.prepare(s).all(...a) }; },
                async run() {
                    const [s, a] = traduzir(sql, ligados);
                    const r = db.prepare(s).run(...a);
                    return { success: true, meta: { changes: r.changes } };
                }
            };
            return stmt;
        },
        async batch(comandos) {
            const saidas = [];
            for (const c of comandos) {
                const [s, a] = traduzir(c._sql, c._ligados);
                if (/^\s*(select|with)\b/i.test(c._sql)) {
                    saidas.push({ results: db.prepare(s).all(...a), success: true });
                } else {
                    const r = db.prepare(s).run(...a);
                    saidas.push({ results: [], success: true, meta: { changes: r.changes } });
                }
            }
            return saidas;
        }
    };
}

const CHAVE_DONO = "chave-de-dono";
const SENHA_DA_LOJA = "senha-so-da-loja";

const banco = new DatabaseSync(":memory:");
banco.exec(ler("schema-lojas-colar.sql"));
banco.exec(ler("schema-acesso-colar.sql"));
banco.exec(ler("schema-colar.sql"));
banco.exec(ler("schema-visual-colar.sql"));

/* O banco PRÓPRIO da filial, ligado como DB_FARMA_CENTRO — é assim em
   produção: cada farmácia tem o seu, e o cadastro de lojas fica no
   principal. É nele que o bloco 9 põe um pedido, para provar que uma
   filial com histórico não é apagada. */
const bancoDaFilial = new DatabaseSync(":memory:");
bancoDaFilial.exec(ler("schema-colar.sql"));

/* Duas chaves diferentes, como em produção: a DONO_KEY abre qualquer
   farmácia e é a única que administra a plataforma; a PAINEL_KEY é a
   senha de balcão. É exatamente essa distinção que o bloco 6 prova. */
const env = {
    DB: fingirD1(banco),
    DB_FARMA_CENTRO: fingirD1(bancoDaFilial),
    PAINEL_KEY: SENHA_DA_LOJA,
    DONO_KEY: CHAVE_DONO
};

function pedir(caminho, { metodo = "GET", corpo, chave = CHAVE_DONO, loja } = {}) {
    const cabecalhos = { "CF-Connecting-IP": "1.2.3.4" };
    if (chave) cabecalhos["X-Painel-Key"] = chave;
    if (loja) cabecalhos["X-Painel-Loja"] = loja;
    if (corpo !== undefined) cabecalhos["Content-Type"] = "application/json";
    return worker.fetch(new Request("https://exemplo.workers.dev" + caminho, {
        method: metodo, headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }), env);
}

const lerFilial = async (slug) => (await (await pedir("/lojas/" + slug)).json());
const noBanco = (slug) => banco.prepare("SELECT * FROM lojas WHERE slug = ?").get(slug);

/* ---- 0. uma filial para editar -------------------------------------- */
console.log("\n0. cadastrando a filial de teste");
{
    const r = await pedir("/lojas", {
        metodo: "POST",
        corpo: {
            slug: "farma-centro", nome: "Farmácia do Centro",
            cnpj: "00.000.000/0001-00", logradouro: "Rua Antiga",
            numeroEndereco: "100", bairro: "Centro",
            cidade: "São Bernardo do Campo", uf: "SP", cep: "09700-000",
            whatsapp: "11900000000", farmaceutico: "Dra. Maria Silva",
            crf: "CRF-SP 12345", raioEntregaKm: 8, freteGratisAcima: 0
        }
    });

    conferir("a filial nasce", r.status === 200, String(r.status));

    const { loja } = await lerFilial("farma-centro");
    conferir("e dá para lê-la de volta", loja && loja.nome === "Farmácia do Centro",
        JSON.stringify(loja && loja.nome));

    /* A tela precisa do que já está gravado para preencher o formulário:
       editar às cegas é reescrever o que estava certo. */
    conferir("com o endereço de hoje", loja.logradouro === "Rua Antiga", loja.logradouro);
    conferir("e o banco e o prefixo, que a tela mostra nos passos",
        loja.banco === "DB_FARMA_CENTRO" && loja.prefixo_r2 === "farma-centro",
        JSON.stringify({ b: loja.banco, p: loja.prefixo_r2 }));
}

/* ---- 1. mudar o que muda na vida real -------------------------------- */
console.log("\n1. a farmácia mudou de rua e de WhatsApp");
{
    const r = await pedir("/lojas/farma-centro", {
        metodo: "POST",
        corpo: {
            logradouro: "Avenida Nova", numeroEndereco: "250",
            complemento: "Loja 2", whatsapp: "(11) 98888-7777",
            farmaceutico: "Dr. João Souza", crf: "CRF-SP 98765"
        }
    });

    conferir("a alteração entra", r.status === 200, String(r.status));

    const l = noBanco("farma-centro");

    conferir("o endereço novo está lá",
        l.logradouro === "Avenida Nova" && l.numero === "250", JSON.stringify(l.logradouro));

    /* O WhatsApp é guardado só com dígitos: é com ele que o link wa.me é
       montado, e parêntese no meio quebra o link. */
    conferir("o WhatsApp entra só com dígitos", l.whatsapp === "11988887777", l.whatsapp);

    conferir("e o responsável técnico também muda",
        l.farmaceutico === "Dr. João Souza" && l.crf === "CRF-SP 98765",
        JSON.stringify({ f: l.farmaceutico, c: l.crf }));
}

/* ---- 2. campo ausente não é campo apagado ---------------------------- */
console.log("\n2. mandar só o que mudou");
{
    await pedir("/lojas/farma-centro", {
        metodo: "POST", corpo: { freteGratisAcima: 120 }
    });

    const l = noBanco("farma-centro");

    conferir("o frete grátis mudou", l.frete_gratis_acima === 120,
        String(l.frete_gratis_acima));

    /* O que não veio no corpo tem de continuar lá. Sem isto, salvar uma
       alteração pequena apagaria o CNPJ e o CRF da farmácia — e isso é o
       que a vigilância confere na porta. */
    conferir("o CNPJ continua", l.cnpj === "00.000.000/0001-00", l.cnpj);
    conferir("o endereço continua", l.logradouro === "Avenida Nova", l.logradouro);
    conferir("e o responsável continua", l.farmaceutico === "Dr. João Souza",
        l.farmaceutico);
}

/* ---- 3. o apelido não muda -------------------------------------------- */
console.log("\n3. renomear a filial");
{
    const r = await pedir("/lojas/farma-centro", {
        metodo: "POST", corpo: { slug: "farma-centro-novo", nome: "Outro nome" }
    });

    /* Recusa com explicação, e não em silêncio: quem tentou precisa
       saber que não aconteceu, senão sai achando que mudou. */
    conferir("é recusado", r.status === 400, String(r.status));

    const erro = (await r.json()).erro || "";
    conferir("dizendo por quê", /endereço do site|prefixo|banco/i.test(erro), erro);

    /* E o pedido inteiro não passa: o nome que ia junto também não
       entrou. Meio formulário aplicado é pior que nenhum. */
    const l = noBanco("farma-centro");
    conferir("e nada do pedido entra", l.nome === "Farmácia do Centro", l.nome);

    const renomeada = banco.prepare(
        "SELECT COUNT(*) AS n FROM lojas WHERE slug = 'farma-centro-novo'").get().n;
    conferir("a filial renomeada não existe", renomeada === 0, String(renomeada));
}

/* ---- 4. ligar a loja não passa pela edição ---------------------------- */
console.log("\n4. 'ativo' não entra por esta porta");
{
    const antes = noBanco("farma-centro").ativo;
    conferir("a filial está desligada, como nasceu", antes === 0, String(antes));

    await pedir("/lojas/farma-centro", {
        metodo: "POST", corpo: { ativo: 1, nome: "Farmácia do Centro" }
    });

    /* Ativar tem conferência própria — banco, schema e horário. Se
       `ativo` passasse por aqui, haveria um caminho para pôr no ar uma
       loja cujo banco nem existe: o cliente entraria num site que
       aceita pedido e grava em lugar nenhum. */
    conferir("continua desligada", noBanco("farma-centro").ativo === 0,
        String(noBanco("farma-centro").ativo));
}

/* ---- 5. o horário ------------------------------------------------------ */
console.log("\n5. mudou o horário de domingo");
{
    const antes = (await lerFilial("farma-centro")).horario;
    conferir("a filial nasceu com os sete dias", antes.length === 7,
        String(antes.length));

    await pedir("/lojas/farma-centro", {
        metodo: "POST",
        corpo: {
            horario: [
                { dia: 1, abre: "08:00", fecha: "20:00" },
                { dia: 2, abre: "08:00", fecha: "20:00" },
                { dia: 3, abre: "08:00", fecha: "20:00" },
                { dia: 4, abre: "08:00", fecha: "20:00" },
                { dia: 5, abre: "08:00", fecha: "20:00" },
                { dia: 6, abre: "08:00", fecha: "18:00" }
                /* domingo fora: a loja passou a fechar */
            ]
        }
    });

    const depois = (await lerFilial("farma-centro")).horario;

    conferir("agora são seis dias", depois.length === 6, String(depois.length));

    /* Dia ausente é dia FECHADO, e isso é informação: o site lê a
       ausência como fechado, e é assim que "não abrimos domingo" chega
       ao cliente. */
    conferir("domingo sumiu", !depois.some((h) => h.dia === 0),
        JSON.stringify(depois.map((h) => h.dia)));

    conferir("e o sábado fecha mais cedo",
        depois.find((h) => h.dia === 6).fecha === "18:00",
        JSON.stringify(depois.find((h) => h.dia === 6)));

    /* Horário mal escrito não derruba o resto: entra o que dá para ler. */
    await pedir("/lojas/farma-centro", {
        metodo: "POST",
        corpo: { horario: [{ dia: 1, abre: "8h", fecha: "20:00" },
                           { dia: 2, abre: "09:00", fecha: "19:00" }] }
    });

    const limpo = (await lerFilial("farma-centro")).horario;
    conferir("a faixa ilegível é descartada, a boa fica",
        limpo.length === 1 && limpo[0].dia === 2, JSON.stringify(limpo));
}

/* ---- 6. quem não é dono não edita -------------------------------------- */
console.log("\n6. a senha da própria loja não serve");
{
    /* Quem tenta é a Mais Barato, que é uma loja de verdade, ligada e
       entrando com a senha de balcão dela. O caso real: a farmácia
       está dentro do próprio painel e mesmo assim não mexe em cadastro
       — nem no seu, nem no da vizinha. */
    const comSenhaDaLoja = await pedir("/lojas/farma-centro", {
        metodo: "POST", chave: SENHA_DA_LOJA, loja: "mais-barato",
        corpo: { nome: "Nome que a loja escolheu" }
    });

    /* O 403 é a prova de que a chave PASSOU pelo portão e foi recusada
       por não ser de dono. Um 401 diria apenas que a senha estava
       errada, e o teste não provaria nada sobre permissão. */
    conferir("o portão aceita a chave, e a rota é que recusa",
        comSenhaDaLoja.status === 403, String(comSenhaDaLoja.status));

    /* CNPJ, CRF e responsável técnico são o que a vigilância confere na
       porta, e quem os cadastra é quem instala. */
    conferir("a loja não edita o próprio cadastro",
        comSenhaDaLoja.status === 403, String(comSenhaDaLoja.status));

    conferir("e o nome não mudou", noBanco("farma-centro").nome === "Farmácia do Centro",
        noBanco("farma-centro").nome);

    const semChave = await pedir("/lojas/farma-centro", {
        metodo: "POST", chave: null, corpo: { nome: "Qualquer um" }
    });
    conferir("sem chave nenhuma, 401", semChave.status === 401, String(semChave.status));

    const leitura = await pedir("/lojas/farma-centro", { chave: null });
    conferir("e nem ler é público", leitura.status === 401, String(leitura.status));

    /* Nem a própria: a loja não lê o cadastro de ninguém, inclusive o
       dela. Quem precisa desses campos é quem instala. */
    const lerComSenhaDaLoja = await pedir("/lojas/mais-barato", {
        chave: SENHA_DA_LOJA, loja: "mais-barato"
    });
    conferir("a loja também não lê o próprio cadastro por aqui",
        lerComSenhaDaLoja.status === 403, String(lerComSenhaDaLoja.status));
}

/* ---- 7. filial que não existe ------------------------------------------ */
console.log("\n7. apelido errado");
{
    const r = await pedir("/lojas/nao-existe", { metodo: "POST", corpo: { nome: "X" } });
    conferir("editar o que não existe dá 404", r.status === 404, String(r.status));

    const g = await pedir("/lojas/nao-existe");
    conferir("ler também", g.status === 404, String(g.status));

    const vazio = await pedir("/lojas/farma-centro", { metodo: "POST", corpo: {} });
    conferir("corpo sem nada para mudar dá recado", vazio.status === 400,
        String(vazio.status));
}


/* ---- 8. apagar a filial criada por engano ----------------------------- */
console.log("\n8. apagar");
{
    /* O caso real: a filial cadastrada com o apelido errado, antes de
       entrar qualquer pedido. Sem apagar, ela fica na lista para
       sempre, cinza, e mais cedo ou mais tarde alguém clica nela. */

    await pedir("/lojas", {
        metodo: "POST",
        corpo: { slug: "engano-01", nome: "Filial criada por engano" }
    });

    conferir("a filial de engano existe",
        !!noBanco("engano-01"), JSON.stringify(noBanco("engano-01")));

    const r = await pedir("/lojas/engano-01", { metodo: "DELETE" });
    conferir("apagar responde ok", r.status === 200, String(r.status));

    conferir("e ela some da tabela de lojas", !noBanco("engano-01"));

    /* As quatro linhas que o cadastro espalha. Meio cadastro apagado
       deixaria a filial fora da lista e a senha dela ainda valendo. */
    const sobras = ["lojas_horario", "lojas_visual", "lojas_acesso"].map((t) => ({
        t, n: banco.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE slug='engano-01'`).get().n
    }));

    conferir("sem sobras em horário, marca e acesso",
        sobras.every((x) => x.n === 0), JSON.stringify(sobras));

    /* E diz o que ficou para a pessoa limpar na mão: o banco D1 e os
       arquivos no R2 são da Cloudflare. */
    const corpo = await r.json();
    conferir("avisa o que sobrou na Cloudflare",
        corpo.sobrou && /engano-01/.test(corpo.sobrou.arquivos || ""),
        JSON.stringify(corpo.sobrou));
}

/* ---- 9. o que apagar NÃO pode alcançar -------------------------------- */
console.log("\n9. as travas");
{
    /* Ligada, não. Apagar uma loja no ar é tirar o site dela do ar sem
       aviso; desligar primeiro obriga a olhar o que quebra enquanto
       ainda dá para voltar. E é o que impede apagar a farmácia
       principal, que é a que atende quando ninguém mandou ?loja=. */
    const ligada = await pedir("/lojas/mais-barato", { metodo: "DELETE" });
    conferir("filial ligada não é apagada", ligada.status === 409,
        String(ligada.status));

    const recado = (await ligada.json()).erro || "";
    conferir("e o recado manda desligar antes", /desligue/i.test(recado), recado);

    conferir("a principal continua lá", !!noBanco("mais-barato"));

    /* Com pedido, não. O pedido é o registro de uma venda, e o cadastro
       da loja é o que dá nome a ele. */
    bancoDaFilial.exec(`
        INSERT INTO pedidos (ref, criado_em, cliente, telefone, entrega,
                             pagamento, subtotal, frete, total, status)
        VALUES ('VENDA-1', ${Date.now()}, 'Maria', '11999990000', 'Entrega',
                'Pix', 50, 0, 50, 'novo')
    `);

    const comVenda = await pedir("/lojas/farma-centro", { metodo: "DELETE" });
    conferir("filial com pedido não é apagada", comVenda.status === 409,
        String(comVenda.status));

    const porQue = (await comVenda.json()).erro || "";
    conferir("dizendo quantos pedidos tem", /1 pedido/.test(porQue), porQue);

    conferir("e ela continua cadastrada", !!noBanco("farma-centro"));

    /* Quem não é dono, não. */
    const comSenhaDaLoja = await pedir("/lojas/farma-centro", {
        metodo: "DELETE", chave: SENHA_DA_LOJA, loja: "mais-barato"
    });
    conferir("e a loja não apaga filial nenhuma", comSenhaDaLoja.status === 403,
        String(comSenhaDaLoja.status));
}

/* ---- a coordenada negativa, que virava zero ------------------------- */
console.log("\nlatitude e longitude não passam pelo numero()");
{
    /* O numero() devolve 0 para qualquer negativo — nasceu para
       dinheiro, onde negativo não existe. Coordenada no Brasil é
       negativa nos dois eixos.

       Visto no ar: a filial de Diadema salva em latitude 0, longitude
       0 (o Golfo da Guiné), e o site dizendo ao cliente "endereço fora
       da área de entrega (5672,1 km)". Nenhum erro na tela: só uma
       farmácia no meio do oceano. */
    const editar = (campos) => pedir("/lojas/farma-centro",
        { metodo: "POST", corpo: campos });

    await editar({ latitude: "-23.697469", longitude: "-46.597316" });

    const l = noBanco("farma-centro");

    conferir("a latitude negativa é guardada como negativa",
        l.latitude === -23.697469, String(l.latitude));

    conferir("e a longitude também",
        l.longitude === -46.597316, String(l.longitude));

    /* Quem copia do Google Maps em português às vezes traz vírgula. */
    await editar({ latitude: "-23,5", longitude: "-46,6" });
    const comVirgula = noBanco("farma-centro");
    conferir("vírgula decimal também entra certo",
        comVirgula.latitude === -23.5 && comVirgula.longitude === -46.6,
        JSON.stringify([comVirgula.latitude, comVirgula.longitude]));

    /* Fora da faixa vira nulo, e nulo o site reconhece como "não dá
       para calcular" — em vez de medir a partir de um ponto inventado. */
    await editar({ latitude: "999", longitude: "-46.6" });
    const fora = noBanco("farma-centro");
    conferir("valor fora da faixa vira nulo, não zero",
        fora.latitude === null, String(fora.latitude));
}

console.log(falhas === 0 ? "\nTudo certo.\n" : `\n${falhas} falha(s).\n`);
process.exit(falhas === 0 ? 0 : 1);
