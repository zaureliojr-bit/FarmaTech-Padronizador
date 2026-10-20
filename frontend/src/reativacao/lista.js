/* A lista de quem vai receber a mensagem.

   Três coisas que o ativador antigo não fazia, e que custam caro quando
   a lista tem mil linhas em vez das seis do exemplo:

   DUPLICADO. O relatório do PDV traz uma linha por cadastro, não por
   pessoa. Quem tem duas fichas — marido e esposa no mesmo celular, ou o
   mesmo cliente recadastrado — recebia a mensagem duas vezes. Duas
   mensagens iguais, do mesmo número, com o nome trocado, é o que faz
   alguém bloquear a farmácia.

   NÃO PERTURBE. Quem responde "não quero mais receber" precisa nunca
   mais aparecer. Sem uma lista disso, na campanha seguinte a pessoa é
   reimportada e recebe de novo — e aí não é descuido, é insistência
   depois de um não.

   O "dias sem comprar" de uma farmácia diz mais do que parece: alguém
   que compra o mesmo remédio todo mês e parou é informação sobre a
   saúde daquela pessoa. Isso não muda o que a ferramenta faz, mas muda
   o cuidado — e é por isso que o não perturbe vem antes de tudo na hora
   de montar a lista, e não como um filtro na tela.
*/

import { normalizarTelefone } from "./telefone.js";

export function tituloDeNome(texto) {

    const minusculas = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);

    return String(texto || "")
        .trim()
        .replace(/\s+/g, " ")
        .split(" ")
        .map((palavra, indice) => {
            const baixa = palavra.toLowerCase();
            if (indice > 0 && minusculas.has(baixa)) return baixa;
            /* d'Ávila, Sant'Ana: a letra depois do apóstrofo também é
               começo de palavra. */
            return baixa.replace(/(^|[^a-záàâãéêíóôõúüç])([a-záàâãéêíóôõúüç])/gi,
                (_, antes, letra) => antes + letra.toUpperCase());
        })
        .join(" ");

}

function paraInteiro(valor) {
    const n = parseInt(String(valor ?? "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

/* Uma pessoa é o TELEFONE, e não o nome: nome repete (três "Maria
   Silva" numa cidade) e muda de grafia entre dois cadastros do mesmo
   cliente. O telefone normalizado é o que identifica quem vai receber a
   mensagem — que é, afinal, a pergunta que esta tela faz. */
function chaveDaPessoa(registro) {
    if (registro.telefone.e164) return registro.telefone.e164;
    if (registro.telefone.numero) return "sem-ddd:" + registro.telefone.numero;
    return "linha:" + registro.id;
}

export function montarRegistros(linhas, { naoPerturbe = [] } = {}) {

    const bloqueados = new Set(naoPerturbe);
    const porPessoa = new Map();
    let descartadosNaoPerturbe = 0;

    linhas.forEach((linha, indice) => {

        const nome = tituloDeNome(linha.nome);
        const bruto = String(linha.telefone || "").trim();

        if (!nome && !bruto) return;

        const telefone = normalizarTelefone(bruto);

        if (telefone.e164 && bloqueados.has(telefone.e164)) {
            descartadosNaoPerturbe++;
            return;
        }

        const registro = {
            id: `r${indice}`,
            nome,
            bruto,
            dias: paraInteiro(linha.dias),
            telefone,
            contato: "Não enviado"
        };

        const chave = chaveDaPessoa(registro);
        const jaTinha = porPessoa.get(chave);

        if (!jaTinha) {
            porPessoa.set(chave, { ...registro, fichas: 1 });
            return;
        }

        /* Mesma pessoa em duas fichas: vale o MENOR "dias sem comprar".

           É o número verdadeiro — ela comprou na data mais recente das
           duas, mesmo que o cadastro usado naquela compra tenha sido o
           outro. Ficar com o maior faria a tela dizer que um cliente
           ativo está sumido há seis meses. */
        jaTinha.fichas++;
        if (registro.dias < jaTinha.dias) {
            jaTinha.dias = registro.dias;
            jaTinha.nome = registro.nome || jaTinha.nome;
        }

    });

    const registros = [...porPessoa.values()];

    return {
        registros,
        duplicadosUnidos: registros.reduce((soma, r) => soma + (r.fichas - 1), 0),
        descartadosNaoPerturbe
    };

}

export function contarPorSituacao(registros) {

    const conta = { total: registros.length, ok: 0, semDDD: 0, fixo: 0, invalido: 0 };

    for (const r of registros) conta[r.telefone.situacao]++;

    return conta;

}

/* A mensagem. {nome} e {dias} continuam como estavam — é o que a loja
   já conhece —, e {primeiro} entra porque "Oi Maria Aparecida da Silva
   Santos!" não é como gente escreve no WhatsApp. */
export function montarMensagem(modelo, registro) {

    const primeiro = (registro.nome || "").split(" ")[0] || "";

    return String(modelo || "")
        .replace(/\{nome\}/g, registro.nome || "")
        .replace(/\{primeiro\}/g, primeiro)
        .replace(/\{dias\}/g, String(registro.dias));

}

export function linkWhatsApp(registro, mensagem) {

    if (!registro.telefone.e164) return null;

    return `https://wa.me/${registro.telefone.e164}?text=${encodeURIComponent(mensagem)}`;

}
