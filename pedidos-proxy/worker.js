// Histórico de pedidos (Cloudflare Worker + D1)
//
// O pedido do site ia só para uma planilha, com todos os itens numa
// célula de texto. Servia para ler um pedido, não para somar: nenhum
// relatório de "produtos mais vendidos" sai de uma string.
//
// Aqui cada item vira uma linha, e o painel da loja lê disto.
//
// Bindings necessários (Configurações -> Bindings, no painel):
//   D1 database -> nome da variável: DB (rode schema.sql nela antes)
// Secret necessário (Configurações -> Variáveis e Secrets):
//   PAINEL_KEY  -> senha inventada; só quem tem ela lê os relatórios
//
// Sobre gravar pedido: NÃO tem chave, e é de propósito. Quem grava é o
// site, que é público — qualquer chave colocada ali estaria visível no
// código-fonte da página, protegendo nada. No lugar disso o worker
// valida o formato com rigor e limita tamanho. É a mesma exposição que
// a planilha já tinha; a diferença é que aqui o dado chega limpo.

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Painel-Key"
};

const MAX_ITENS = 100;          // carrinho de farmácia não passa disso
const MAX_TEXTO = 200;          // nome, endereço, descrição de item
const MAX_DIAS_RELATORIO = 366;
const MAX_TERMO = 60;           // ninguém busca remédio com mais que isso

function json(dados, status = 200) {

    return new Response(JSON.stringify(dados), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS }
    });

}

function texto(valor, limite = MAX_TEXTO) {

    return String(valor ?? "").trim().slice(0, limite);

}

function numero(valor) {

    const n = Number(valor);

    return Number.isFinite(n) && n >= 0 ? n : 0;

}

/* Só dígitos, para o telefone virar identidade estável do cliente:
   quem digita "(11) 98765-4321" hoje e "11987654321" amanhã é a mesma
   pessoa, e sem isto viraria dois cadastros. */
function soDigitos(valor) {

    return String(valor ?? "").replace(/\D/g, "").slice(0, 15);

}

function autorizado(request, env) {

    return !!env.PAINEL_KEY && request.headers.get("X-Painel-Key") === env.PAINEL_KEY;

}

/* ========================= GRAVAR ========================= */

/* Registra o que foi digitado na busca do site.

   Aberto, sem chave, pelo mesmo motivo do /pedidos: quem chama é a
   página pública, e chave no código-fonte não protege nada. A diferença
   é que aqui o estrago possível é menor — o pior caso é alguém sujar a
   estatística, não forjar um pedido.

   Guarda o termo e nada mais. Sem telefone, sem IP, sem sessão: o que
   entra aqui não volta a ser ligado a uma pessoa. */
async function tratarNovaBusca(request, env) {

    const corpo = await request.json().catch(() => null);

    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const termo = texto(corpo.termo, MAX_TERMO).toLowerCase();

    // 2 letras não dizem nada sobre intenção de compra e enchem a tabela
    if (termo.length < 3) return json({ erro: "Termo curto demais." }, 400);

    const resultados = Math.round(numero(corpo.resultados));

    await env.DB.prepare(
        `INSERT INTO buscas (termo, criado_em, resultados) VALUES (?1, ?2, ?3)`
    ).bind(termo, Date.now(), resultados).run();

    return json({ ok: true });

}

async function tratarNovoPedido(request, env) {

    const corpo = await request.json().catch(() => null);

    if (!corpo) return json({ erro: "Corpo inválido." }, 400);

    const ref = texto(corpo.ref, 40);
    const telefone = soDigitos(corpo.telefone);
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [];

    if (!ref) return json({ erro: "'ref' é obrigatório." }, 400);
    if (!telefone) return json({ erro: "'telefone' é obrigatório." }, 400);
    if (!itens.length) return json({ erro: "Pedido sem itens." }, 400);
    if (itens.length > MAX_ITENS) return json({ erro: "Itens demais." }, 400);

    const criadoEm = Date.now();
    const cliente = texto(corpo.cliente) || "(sem nome)";
    const endereco = texto(corpo.endereco, 300);
    const total = numero(corpo.total);

    // Itens normalizados aqui, e não confiando no que chegou: o total de
    // cada linha é recalculado, para o relatório não herdar conta errada.
    const linhas = itens.map((item) => {
        const qtd = Math.max(1, Math.round(numero(item.qtd) || 1));
        const preco = numero(item.preco);
        return {
            ean: texto(item.ean, 20),
            codigo: texto(item.codigo, 40),
            descricao: texto(item.descricao) || "(sem descrição)",
            qtd,
            preco,
            totalItem: Number((qtd * preco).toFixed(2))
        };
    });

    // Se este número já existe, pode ser duas coisas muito diferentes:
    // o mesmo cliente reenviando (rede oscilou, clicou duas vezes), que é
    // inofensivo, ou uma colisão de número entre pedidos de pessoas
    // diferentes. No segundo caso, seguir em frente apagaria os itens de
    // um pedido e colocaria os do outro por cima, deixando um registro
    // que não é nem um nem outro. É raro, mas silencioso — então recusa.
    const jaExiste = await env.DB.prepare(
        `SELECT telefone FROM pedidos WHERE ref = ?1`
    ).bind(ref).first();

    if (jaExiste && jaExiste.telefone !== telefone) {
        return json({
            erro: "Já existe outro pedido com este número.",
            ref
        }, 409);
    }

    const comandos = [

        env.DB.prepare(
            `INSERT INTO pedidos
                (ref, criado_em, cliente, telefone, entrega, endereco,
                 pagamento, subtotal, frete, total, tem_receita, status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'novo')
             ON CONFLICT(ref) DO NOTHING`
        ).bind(
            ref, criadoEm, cliente, telefone,
            texto(corpo.entrega, 20) || "Retirada",
            endereco,
            texto(corpo.pagamento, 40),
            numero(corpo.subtotal),
            numero(corpo.frete),
            total,
            corpo.temReceita ? 1 : 0
        ),

        // Se o mesmo ref chegar duas vezes (cliente clicou de novo, rede
        // instável), o INSERT do pedido não faz nada — mas os itens
        // entrariam duplicados. Limpar antes deixa a operação repetível.
        env.DB.prepare(`DELETE FROM pedido_itens WHERE ref = ?1`).bind(ref)

    ];

    linhas.forEach((l) => {
        comandos.push(
            env.DB.prepare(
                `INSERT INTO pedido_itens
                    (ref, ean, codigo, descricao, qtd, preco_unit, total_item)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)`
            ).bind(ref, l.ean, l.codigo, l.descricao, l.qtd, l.preco, l.totalItem)
        );
    });

    comandos.push(
        env.DB.prepare(
            `INSERT INTO clientes
                (telefone, nome, ultimo_endereco, primeiro_pedido, ultimo_pedido, pedidos, total_gasto)
             VALUES (?1,?2,?3,?4,?4,1,?5)
             ON CONFLICT(telefone) DO UPDATE SET
                nome = excluded.nome,
                ultimo_endereco = COALESCE(NULLIF(excluded.ultimo_endereco,''), clientes.ultimo_endereco),
                ultimo_pedido = excluded.ultimo_pedido,
                pedidos = clientes.pedidos + 1,
                total_gasto = clientes.total_gasto + excluded.total_gasto`
        ).bind(telefone, cliente, endereco, criadoEm, total)
    );

    // batch roda tudo numa transação: ou o pedido inteiro entra, ou nada
    await env.DB.batch(comandos);

    return json({ sucesso: true, ref, itens: linhas.length });

}

/* ========================= LER ========================= */

function janela(url) {

    const dias = Math.min(
        Math.max(parseInt(url.searchParams.get("dias") || "30", 10) || 30, 1),
        MAX_DIAS_RELATORIO
    );

    return { dias, desde: Date.now() - dias * 86400000 };

}

async function tratarResumo(request, env) {

    const url = new URL(request.url);
    const { dias, desde } = janela(url);

    // "Hoje" é o dia em São Paulo, não em UTC — um pedido das 22h de SP
    // já é o dia seguinte em UTC e sairia da conta do dia.
    const agoraSP = new Date(Date.now() - 3 * 3600000);
    const inicioDoDiaSP = Date.UTC(
        agoraSP.getUTCFullYear(), agoraSP.getUTCMonth(), agoraSP.getUTCDate()
    ) + 3 * 3600000;

    const [hoje, periodo, porDia, topProdutos, recentes, aguardando,
           maisProcurados, naoEncontrados] = await env.DB.batch([

        env.DB.prepare(
            `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento
               FROM pedidos WHERE criado_em >= ?1`
        ).bind(inicioDoDiaSP),

        env.DB.prepare(
            `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento,
                    COALESCE(AVG(total),0) AS ticket
               FROM pedidos WHERE criado_em >= ?1`
        ).bind(desde),

        env.DB.prepare(
            `SELECT date((criado_em - 10800000)/1000, 'unixepoch') AS dia,
                    COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS faturamento
               FROM pedidos WHERE criado_em >= ?1
              GROUP BY dia ORDER BY dia`
        ).bind(desde),

        env.DB.prepare(
            `SELECT i.descricao, i.ean,
                    SUM(i.qtd) AS unidades,
                    SUM(i.total_item) AS faturamento
               FROM pedido_itens i
               JOIN pedidos p ON p.ref = i.ref
              WHERE p.criado_em >= ?1
              GROUP BY COALESCE(NULLIF(i.ean,''), i.descricao)
              ORDER BY unidades DESC
              LIMIT 20`
        ).bind(desde),

        env.DB.prepare(
            `SELECT ref, criado_em, cliente, telefone, entrega, pagamento,
                    total, tem_receita, status
               FROM pedidos ORDER BY criado_em DESC LIMIT 30`
        ),

        env.DB.prepare(
            `SELECT COUNT(*) AS n FROM pedidos
              WHERE tem_receita = 1 AND status = 'novo'`
        ),

        // o que mais procuram, com quantas dessas vezes não acharam nada
        env.DB.prepare(
            `SELECT termo,
                    COUNT(*) AS buscas,
                    SUM(CASE WHEN resultados = 0 THEN 1 ELSE 0 END) AS vazias
               FROM buscas WHERE criado_em >= ?1
              GROUP BY termo ORDER BY buscas DESC, termo
              LIMIT 20`
        ).bind(desde),

        // procuraram e o site não tinha: cada linha é uma venda perdida
        env.DB.prepare(
            `SELECT termo, COUNT(*) AS buscas, MAX(criado_em) AS ultima
               FROM buscas
              WHERE criado_em >= ?1 AND resultados = 0
              GROUP BY termo ORDER BY buscas DESC, ultima DESC
              LIMIT 20`
        ).bind(desde)

    ]);

    return json({
        dias,
        hoje: hoje.results[0] || { pedidos: 0, faturamento: 0 },
        periodo: periodo.results[0] || { pedidos: 0, faturamento: 0, ticket: 0 },
        porDia: porDia.results || [],
        topProdutos: topProdutos.results || [],
        recentes: recentes.results || [],
        aguardandoReceita: (aguardando.results[0] || {}).n || 0,
        maisProcurados: maisProcurados.results || [],
        naoEncontrados: naoEncontrados.results || []
    });

}

async function tratarClientes(request, env) {

    const url = new URL(request.url);
    const limite = Math.min(parseInt(url.searchParams.get("limite") || "100", 10) || 100, 500);

    const { results } = await env.DB.prepare(
        `SELECT telefone, nome, ultimo_endereco, primeiro_pedido,
                ultimo_pedido, pedidos, total_gasto
           FROM clientes ORDER BY ultimo_pedido DESC LIMIT ?1`
    ).bind(limite).all();

    return json({ clientes: results || [] });

}

async function tratarPedido(request, env, ref) {

    const [pedido, itens] = await env.DB.batch([
        env.DB.prepare(`SELECT * FROM pedidos WHERE ref = ?1`).bind(ref),
        env.DB.prepare(
            `SELECT ean, codigo, descricao, qtd, preco_unit, total_item
               FROM pedido_itens WHERE ref = ?1 ORDER BY id`
        ).bind(ref)
    ]);

    if (!pedido.results.length) return json({ erro: "Pedido não encontrado." }, 404);

    return json({ pedido: pedido.results[0], itens: itens.results || [] });

}

/* A fila de trabalho do balcão: os pedidos que ainda não terminaram,
   já com os itens de cada um.

   Existe separada do /resumo porque as duas perguntas são diferentes. O
   resumo responde "como foi o mês" e é consultado quando alguém abre o
   relatório; a fila responde "o que tem para fazer agora" e é consultada
   a cada meio minuto, o dia inteiro. Misturar as duas faria o balcão
   recalcular faturamento e ranking de produtos 2.880 vezes por dia à toa.

   Os itens vêm na mesma resposta, e não um pedido por vez: separar dez
   pedidos custaria onze idas ao servidor em vez de uma. */
async function tratarFila(request, env) {

    const ABERTOS = ["novo", "separando", "receita-ok"];

    const pedidos = await env.DB.prepare(
        `SELECT ref, criado_em, cliente, telefone, entrega, endereco,
                pagamento, subtotal, frete, total, tem_receita, status
           FROM pedidos
          WHERE status IN ('novo','separando','receita-ok')
          ORDER BY criado_em ASC
          LIMIT 60`
    ).all();

    const lista = pedidos.results || [];

    if (!lista.length) return json({ pedidos: [], abertos: ABERTOS });

    /* Um IN com as refs desta página, em vez de um JOIN com a tabela
       inteira: são no máximo 60 pedidos, e assim o índice de pedido_itens
       faz todo o trabalho. */
    const refs = lista.map(p => p.ref);
    const marcadores = refs.map((_, i) => `?${i + 1}`).join(",");

    const itens = await env.DB.prepare(
        `SELECT ref, ean, codigo, descricao, qtd, preco_unit, total_item
           FROM pedido_itens
          WHERE ref IN (${marcadores})
          ORDER BY id`
    ).bind(...refs).all();

    const porRef = new Map(refs.map(r => [r, []]));
    for (const item of (itens.results || [])) {
        porRef.get(item.ref)?.push(item);
    }

    return json({
        pedidos: lista.map(p => ({ ...p, itens: porRef.get(p.ref) || [] })),
        abertos: ABERTOS
    });

}

async function tratarStatus(request, env) {

    const { ref, status } = await request.json().catch(() => ({}));

    const permitidos = ["novo", "separando", "receita-ok", "entregue", "cancelado"];

    if (!ref || !permitidos.includes(status)) {
        return json({ erro: "Informe 'ref' e um 'status' válido." }, 400);
    }

    const r = await env.DB.prepare(
        `UPDATE pedidos SET status = ?2 WHERE ref = ?1`
    ).bind(texto(ref, 40), status).run();

    return json({ sucesso: true, alterados: r.meta?.changes ?? 0 });

}

export default {

    async fetch(request, env) {

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const rota = url.pathname.replace(/\/+$/, "") || "/";

        try {

            // gravar pedido: aberto, porque quem chama é o site público
            if (request.method === "POST" && rota === "/pedidos") {
                return await tratarNovoPedido(request, env);
            }

            // idem: quem grava é o site público
            if (request.method === "POST" && rota === "/busca") {
                return await tratarNovaBusca(request, env);
            }

            // daqui para baixo é a loja olhando os próprios dados
            if (!autorizado(request, env)) {
                return json({ erro: "Não autorizado." }, 401);
            }

            if (request.method === "GET" && rota === "/fila")     return await tratarFila(request, env);
            if (request.method === "GET" && rota === "/resumo")   return await tratarResumo(request, env);
            if (request.method === "GET" && rota === "/clientes") return await tratarClientes(request, env);
            if (request.method === "POST" && rota === "/status")  return await tratarStatus(request, env);

            const umPedido = rota.match(/^\/pedidos\/(.+)$/);
            if (request.method === "GET" && umPedido) {
                return await tratarPedido(request, env, decodeURIComponent(umPedido[1]));
            }

            return json({ erro: "Rota não encontrada." }, 404);

        } catch (erro) {

            // a mensagem crua pode conter trecho de SQL — fica no log do
            // worker, não na resposta
            console.error("pedidos-proxy:", erro);

            return json({ erro: "Erro ao processar." }, 500);

        }

    }

};
