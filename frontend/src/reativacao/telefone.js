/* Telefone brasileiro, para mandar mensagem em WhatsApp.
   =====================================================

   O ativador anterior tratava "10 dígitos" como celular antigo e punha
   um 9 na frente. Isso está certo para o celular de antes de 2016 e
   ERRADO para telefone fixo — e fixo é metade do cadastro de farmácia,
   porque o cliente mais antigo deu o número de casa.

       (11) 3251-4000   fixo da loja
       → virava 11 93251-4000, um celular que existe e é de OUTRA pessoa

   Quem levava a mensagem "você não compra há 183 dias" era um estranho,
   com o nome de um cliente da farmácia junto. É vazamento de dado de
   cliente, não é só um disparo perdido — e a tela mostrava "Pronto".

   A diferença está no primeiro dígito depois do DDD:

       2 a 5   fixo       não dá para mandar WhatsApp
       6 a 9   celular    é aqui que o nono dígito entra

   O DDD também é conferido contra a lista real. "00", "99" e "40" não
   existem, e um deles aparece sempre que alguém digita o número errado
   no cadastro. */

const DDDS = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99
].map(String));

export function soDigitos(texto) {
    return String(texto ?? "").replace(/\D/g, "");
}

export function dddValido(ddd) {
    return DDDS.has(String(ddd));
}

/* Resultado possível, em `situacao`:

     ok        dá para mandar
     semDDD    é celular, mas não sabemos de onde — falta o DDD
     fixo      é telefone fixo; WhatsApp não vai
     invalido  não é telefone

   `fixo` é uma situação própria, e não "inválido", porque a farmácia
   PODE ligar para esse cliente. Jogar os dois no mesmo balde esconderia
   uma lista de gente que vale a pena telefonar. */
export function normalizarTelefone(bruto) {

    let digitos = soDigitos(bruto);

    if (!digitos) return { situacao: "invalido", motivo: "sem número" };

    /* +55 do país, quando o cadastro já guarda assim. Só quando o que
       sobra tem tamanho de telefone: um número de 13 dígitos que começa
       com 55 por coincidência não vira telefone de 11. */
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
        digitos = digitos.slice(2);
    }

    /* 11111111111, 00000000000: campo preenchido para passar da
       validação do PDV. Não é telefone de ninguém. */
    if (/^(\d)\1+$/.test(digitos)) {
        return { situacao: "invalido", motivo: "dígito repetido", digitos };
    }

    const ehFixo = (d) => d >= "2" && d <= "5";

    if (digitos.length === 11) {
        const ddd = digitos.slice(0, 2);
        const numero = digitos.slice(2);

        if (!dddValido(ddd)) return { situacao: "invalido", motivo: `DDD ${ddd} não existe`, digitos };
        if (numero[0] !== "9") {
            return { situacao: "invalido", motivo: "11 dígitos e não começa com 9", digitos };
        }
        return { situacao: "ok", ddd, numero, e164: "55" + ddd + numero };
    }

    if (digitos.length === 10) {
        const ddd = digitos.slice(0, 2);
        const local = digitos.slice(2);

        if (!dddValido(ddd)) return { situacao: "invalido", motivo: `DDD ${ddd} não existe`, digitos };

        if (ehFixo(local[0])) {
            return { situacao: "fixo", ddd, numero: local, motivo: "telefone fixo" };
        }

        /* Celular de antes do nono dígito. É aqui, e SÓ aqui, que
           acrescentar o 9 é a coisa certa. */
        return { situacao: "ok", ddd, numero: "9" + local, e164: "55" + ddd + "9" + local };
    }

    if (digitos.length === 9) {
        if (digitos[0] !== "9") {
            return { situacao: "invalido", motivo: "9 dígitos e não começa com 9", digitos };
        }
        return { situacao: "semDDD", numero: digitos };
    }

    if (digitos.length === 8) {
        if (ehFixo(digitos[0])) {
            return { situacao: "fixo", numero: digitos, motivo: "fixo, e sem DDD" };
        }
        return { situacao: "semDDD", numero: "9" + digitos };
    }

    return { situacao: "invalido", motivo: `${digitos.length} dígitos`, digitos };

}

/* Completa um `semDDD` com o DDD que a loja escolheu como padrão.

   Devolve um registro NOVO em vez de alterar o que chegou: é o que
   permite a tela mostrar o resultado antes de a pessoa confirmar, sem
   já ter mudado o cadastro por baixo. */
export function comDDD(resultado, ddd) {

    const limpo = soDigitos(ddd).slice(0, 2);

    if (resultado.situacao !== "semDDD" || !dddValido(limpo)) return resultado;

    return {
        situacao: "ok",
        ddd: limpo,
        numero: resultado.numero,
        e164: "55" + limpo + resultado.numero
    };

}

export function formatarTelefone(resultado) {

    if (!resultado || !resultado.numero) return "";

    const n = resultado.numero;
    const local = n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : `${n.slice(0, 4)}-${n.slice(4)}`;

    return resultado.ddd ? `(${resultado.ddd}) ${local}` : local;

}
