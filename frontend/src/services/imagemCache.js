const PREFIXO = "farmatech:imagens:";

export function obterCache(ean) {

    if (!ean) return null;

    try {

        const bruto = localStorage.getItem(PREFIXO + ean);

        return bruto ? JSON.parse(bruto) : null;

    } catch {

        return null;

    }

}

export function salvarCache(ean, dados) {

    if (!ean) return;

    try {

        localStorage.setItem(PREFIXO + ean, JSON.stringify(dados));

    } catch {

        // localStorage indisponível ou cheio — segue sem cache

    }

}
