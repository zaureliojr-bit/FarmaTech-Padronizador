// Credencial do painel, no navegador.
//
// Até aqui o padronizador escrevia direto no imagens-proxy e no
// publish-proxy, carregando a chave de cada um. Essas chaves vinham em
// VITE_IMAGENS_KEY e VITE_PUBLISH_KEY, e o Vite embute toda variável
// VITE_ no pacote em tempo de build - ou seja, elas ficavam legíveis em
// texto no JavaScript que qualquer um baixa. Quem lesse podia trocar a
// imagem de qualquer produto e, com a de publicação, reescrever o
// catálogo inteiro do site.
//
// Agora o navegador não tem mais chave de worker nenhuma: ele manda a
// SENHA DO PAINEL para o pedidos-proxy, que confere e carimba a chave
// de verdade. A senha do painel é a mesma que a loja já digita para ver
// a fila de pedidos, e ela tem limite de tentativas.
//
// A senha fica só nesta aba (sessionStorage), igual ao painel: fechou,
// sai. Não é "lembrar de mim" de propósito - é a chave do faturamento.

const CHAVE_GUARDADA = "painelKey";

/* O padronizador roda dentro de um quadro no painel (aba Catálogo), e
   o painel já tem a senha digitada. Em vez de pedir de novo, ele manda
   por postMessage e nós aceitamos - mas SÓ de uma origem conhecida.
   Sem essa conferência, qualquer página que abrisse o padronizador num
   quadro poderia injetar uma senha, ou pior, ficar ouvindo a nossa. */
const ORIGENS_CONFIAVEIS = (import.meta.env.VITE_ORIGENS_PAINEL
    || "https://drogaria-site.pages.dev")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);

let senhaEmMemoria = "";

function lerGuardada() {

    try {
        return sessionStorage.getItem(CHAVE_GUARDADA) || "";
    } catch {
        // navegação privada ou armazenamento bloqueado: segue em memória
        return "";
    }

}

export function definirSenhaPainel(senha) {

    senhaEmMemoria = String(senha || "").trim();

    try {
        if (senhaEmMemoria) sessionStorage.setItem(CHAVE_GUARDADA, senhaEmMemoria);
        else sessionStorage.removeItem(CHAVE_GUARDADA);
    } catch {
        /* sem armazenamento, a senha vale só enquanto a página viver */
    }

    return senhaEmMemoria;

}

export function esquecerSenhaPainel() {

    return definirSenhaPainel("");

}

export function temSenhaPainel() {

    return !!(senhaEmMemoria || lerGuardada());

}

/* Devolve a senha, pedindo ao usuário se ainda não tiver.

   O prompt do navegador é feio, e de propósito: a alternativa seria uma
   tela de login dentro do padronizador, que é mais trabalho e mais
   superfície para pouca diferença numa ferramenta que só a loja abre.
   Quando o padronizador roda dentro do painel, nem aparece - a senha
   chega pelo postMessage antes. */
export function obterSenhaPainel({ pedir = true } = {}) {

    const guardada = senhaEmMemoria || lerGuardada();

    if (guardada) {
        senhaEmMemoria = guardada;
        return guardada;
    }

    if (!pedir) return "";

    const digitada = typeof window !== "undefined" && window.prompt
        ? window.prompt("Senha do painel (a mesma da tela de pedidos):")
        : "";

    return definirSenhaPainel(digitada || "");

}

/* Chamado uma vez, na subida do app. */
export function ouvirSenhaDoPainel() {

    if (typeof window === "undefined") return;

    window.addEventListener("message", (evento) => {

        const origem = String(evento.origin || "").replace(/\/+$/, "");

        if (!ORIGENS_CONFIAVEIS.includes(origem)) return;

        const dado = evento.data;

        if (dado && dado.tipo === "senha-painel" && dado.senha) {
            definirSenhaPainel(dado.senha);
        }

    });

    /* Avisa o painel que já estamos de pé e podemos receber a senha. O
       painel pode ter mandado antes de nós existirmos. */
    try {
        if (window.parent && window.parent !== window) {
            for (const origem of ORIGENS_CONFIAVEIS) {
                window.parent.postMessage({ tipo: "padronizador-pronto" }, origem);
            }
        }
    } catch {
        /* sem quadro pai, ou bloqueado: segue pelo prompt */
    }

}

/* Cabeçalhos para falar com o porteiro do catálogo. Devolve vazio
   quando não há senha, para quem chama decidir se avisa ou desiste. */
export function cabecalhoPainel({ pedir = true } = {}) {

    const senha = obterSenhaPainel({ pedir });

    return senha ? { "X-Painel-Key": senha } : null;

}

/* A URL do porteiro: o pedidos-proxy, o mesmo worker que o painel usa
   para a fila. */
export const PORTEIRO_URL = (import.meta.env.VITE_PEDIDOS_PROXY_URL || "")
    .replace(/\/+$/, "");
