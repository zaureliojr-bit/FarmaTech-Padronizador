// Planilha que o extrator do Firebird (firebird-extrator/) gerou no PC
// da loja e já enviou pro worker - ver imagens-proxy/worker.js.
//
// As três rotas passam pelo PORTEIRO (pedidos-proxy), e não direto no
// imagens-proxy, por um motivo concreto: a planilha traz a coluna
// "Preço Custo" de cada produto. Baixá-la sem credencial entrega a
// margem da loja inteira a quem souber o endereço - e foi exatamente o
// que aconteceu enquanto a rota ficou aberta.
//
// Antes, marcar como importada usava a VITE_IMAGENS_KEY, que o Vite
// embutia no pacote e qualquer um lia. Agora vai a senha do painel, e
// quem carimba a chave de verdade é o worker, no servidor.
import { PORTEIRO_URL, cabecalhoPainel } from "./credencialPainel";

/** null se não tem nada esperando (ou o porteiro não está configurado). */
export async function buscarExtracaoPendente() {

    if (!PORTEIRO_URL) return null;

    /* pedir: false de propósito. Isto roda sozinho, de tempos em tempos,
       só para saber se há coisa nova - abrir um pedido de senha sem
       ninguém ter clicado em nada seria assustador. Sem senha, apenas
       não avisa; quem for importar de fato é que vai ser perguntado. */
    const credencial = cabecalhoPainel({ pedir: false });

    if (!credencial) return null;

    const resposta = await fetch(`${PORTEIRO_URL}/catalogo/extracao`, {
        headers: credencial
    });

    if (!resposta.ok) return null;

    const dados = await resposta.json().catch(() => null);

    return dados?.pendente ? dados : null;

}

export async function baixarArquivoExtracao() {

    if (!PORTEIRO_URL) {
        throw new Error("Importação não configurada (falta VITE_PEDIDOS_PROXY_URL no .env).");
    }

    const credencial = cabecalhoPainel();

    if (!credencial) {
        throw new Error("Preciso da senha do painel para baixar a extração.");
    }

    const resposta = await fetch(`${PORTEIRO_URL}/catalogo/extracao/arquivo`, {
        headers: credencial
    });

    if (!resposta.ok) {
        throw new Error(`Falha ao baixar a extração (HTTP ${resposta.status}).`);
    }

    return resposta.blob();

}

/** Some com o aviso - chamar só depois de importar com sucesso. */
export async function marcarExtracaoImportada() {

    if (!PORTEIRO_URL) return;

    const credencial = cabecalhoPainel({ pedir: false });

    if (!credencial) return;

    await fetch(`${PORTEIRO_URL}/catalogo/extracao/importado`, {
        method: "POST",
        headers: credencial
    });

}
