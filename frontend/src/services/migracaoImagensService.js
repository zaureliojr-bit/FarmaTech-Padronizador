// Migração única das imagens resolvidas antes da hospedagem no R2
// existir. Fonte dos links antigos: o produtos.json já publicado (é o
// registro mais completo que existe - cobre tudo que já foi salvo em
// qualquer sessão/computador, não só o navegador atual).
import { buscarImagensHospedadas, salvarImagemHospedada, ehImagemHospedada } from "./imagemHostingService";

const PRODUTOS_JSON_URL = import.meta.env.VITE_PRODUTOS_JSON_URL;

// Processa em paralelo limitado - dispara tudo de uma vez sobrecarrega
// o worker (cada imagem é um download inteiro do lado dele) e os sites
// de origem, que nem sempre aguentam bem uma rajada.
const CONCORRENCIA = 5;

async function executarComConcorrenciaLimitada(itens, tarefa, limite) {

    const fila = [...itens];

    async function trabalhador() {
        while (fila.length) {
            const item = fila.shift();
            await tarefa(item);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limite, itens.length) }, trabalhador)
    );

}

/**
 * @param {(progresso: {total: number, concluidos: number, sucesso: number, falha: number}) => void} onProgresso
 */
export async function migrarImagensAntigas(onProgresso) {

    if (!PRODUTOS_JSON_URL) {
        throw new Error("Falta VITE_PRODUTOS_JSON_URL no .env (URL do produtos.json publicado).");
    }

    // cache-bust: raw.githubusercontent.com guarda cache por alguns
    // minutos, e aqui a gente sempre quer o catálogo mais recente.
    const resposta = await fetch(`${PRODUTOS_JSON_URL}?migracao=${Date.now()}`);

    if (!resposta.ok) {
        throw new Error(`Não consegui ler o catálogo publicado (HTTP ${resposta.status}).`);
    }

    const dados = await resposta.json();
    const produtos = Array.isArray(dados.produtos) ? dados.produtos : [];

    // só quem tem EAN, tem imagem, e essa imagem ainda não é a nossa.
    const candidatos = produtos.filter(
        (produto) => produto.ean && produto.imagem && !ehImagemHospedada(produto.imagem)
    );

    // dos candidatos, tira quem já está indexado no D1 - o link em
    // produtos.json pode estar desatualizado mesmo a imagem já tendo
    // sido hospedada de novo por outro caminho (ex: salva manualmente
    // no padronizador depois da migração para R2 já estar no ar).
    const jaHospedadas = await buscarImagensHospedadas(candidatos.map((produto) => produto.ean));

    const pendentes = candidatos.filter((produto) => !jaHospedadas.has(produto.ean));

    const total = pendentes.length;
    let concluidos = 0;
    let sucesso = 0;
    let falha = 0;
    const erros = [];

    onProgresso?.({ total, concluidos, sucesso, falha });

    await executarComConcorrenciaLimitada(pendentes, async (produto) => {

        try {

            await salvarImagemHospedada(produto.ean, produto.imagem, "migração");
            sucesso++;

        } catch (erro) {

            falha++;
            erros.push({ ean: produto.ean, descricao: produto.descricao, erro: erro.message });

        } finally {

            concluidos++;
            onProgresso?.({ total, concluidos, sucesso, falha });

        }

    }, CONCORRENCIA);

    return {
        totalNoCatalogo: produtos.length,
        jaHospedadasAntes: candidatos.length - pendentes.length,
        migrados: total,
        sucesso,
        falha,
        erros: erros.slice(0, 20)
    };

}
