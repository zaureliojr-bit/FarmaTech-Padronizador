/* Reativação de clientes — a lista de quem parou de comprar, pronta
   para mandar mensagem no WhatsApp.

   Veio de uma página solta que a loja usava por fora. O que mudou ao
   entrar aqui, além do visual:

     - telefone FIXO deixou de virar celular de estranho (ver
       reativacao/telefone.js — era o defeito que mais custava);
     - a mesma pessoa em duas fichas do PDV vira uma linha só;
     - quem pede para não receber entra num "não perturbe" que vale para
       as próximas campanhas, e não só para esta tela.

   O que ela NÃO faz, de propósito: disparar sozinha. Cada mensagem sai
   de um clique, no WhatsApp da pessoa que está operando. Automatizar
   envio em massa pelo WhatsApp é o caminho mais curto para o número da
   farmácia ser bloqueado — e aí ela perde o canal que mais vende. */

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import { montarRegistros, contarPorSituacao, montarMensagem, linkWhatsApp }
    from "../../reativacao/lista";
import { comDDD, formatarTelefone, soDigitos } from "../../reativacao/telefone";

import "./ReativacaoBox.css";

const CHAVE_GUARDADA = "drogalink_reativacao_v2";
const CHAVE_NAO_PERTURBE = "drogalink_nao_perturbe_v1";
const MAX_IMAGENS = 2;

const MODELO_PADRAO =
    "Oi {primeiro}! Aqui é da sua farmácia. Vi que faz {dias} dias desde " +
    "a sua última compra e queria saber se está tudo bem. Temos ofertas " +
    "da semana, se precisar de alguma coisa é só chamar.";

const SITUACOES = [
    { chave: "todos", rotulo: "Todos" },
    { chave: "ok", rotulo: "Prontos" },
    { chave: "semDDD", rotulo: "Falta DDD" },
    { chave: "fixo", rotulo: "Fixo" },
    { chave: "invalido", rotulo: "Inválidos" }
];

const CONTATOS = ["Não enviado", "Enviado", "Respondeu", "Voltou a comprar", "Não respondeu"];

function lerGuardado(chave, padrao) {
    try {
        const cru = localStorage.getItem(chave);
        return cru ? JSON.parse(cru) : padrao;
    } catch {
        return padrao;
    }
}

function gravar(chave, valor) {
    try {
        localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
        /* navegação privada, ou armazenamento cheio: a tela continua
           funcionando, só não lembra na próxima vez. */
    }
}

function semAcento(texto) {
    return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/* Lê a planilha procurando as colunas pelo NOME, em qualquer aba e em
   qualquer posição — o relatório do PDV muda de lugar entre versões, e
   exigir "coluna A, B e C" quebraria a cada atualização do Farmax. */
function lerPlanilha(arquivo) {

    return new Promise((resolver, rejeitar) => {

        const leitor = new FileReader();

        leitor.onerror = () => rejeitar(new Error("Não consegui ler o arquivo."));

        leitor.onload = (evento) => {
            try {
                const livro = XLSX.read(new Uint8Array(evento.target.result), { type: "array" });
                const linhas = [];
                let abasUsadas = 0;

                for (const nomeAba of livro.SheetNames) {

                    const grade = XLSX.utils.sheet_to_json(livro.Sheets[nomeAba], {
                        header: 1, defval: null, raw: false
                    });

                    let cabecalho = -1, cNome = -1, cTel = -1, cDias = -1;

                    for (let i = 0; i < Math.min(grade.length, 15); i++) {
                        const linha = grade[i] || [];
                        linha.forEach((celula, coluna) => {
                            if (typeof celula !== "string") return;
                            const texto = semAcento(celula);
                            if (texto.includes("nome")) cNome = coluna;
                            if (texto.includes("telefone") || texto.includes("fone")
                                || texto.includes("celular") || texto.includes("whats")) cTel = coluna;
                            if (texto.includes("dias")) cDias = coluna;
                        });
                        if (cNome >= 0 && cTel >= 0) { cabecalho = i; break; }
                    }

                    if (cabecalho === -1) continue;
                    abasUsadas++;

                    for (let i = cabecalho + 1; i < grade.length; i++) {
                        const linha = grade[i];
                        if (!linha) continue;
                        const nome = linha[cNome], tel = linha[cTel];
                        if ((nome == null || String(nome).trim() === "")
                            && (tel == null || String(tel).trim() === "")) continue;
                        linhas.push({
                            nome: nome == null ? "" : String(nome),
                            telefone: tel == null ? "" : String(tel),
                            dias: cDias >= 0 && linha[cDias] != null ? String(linha[cDias]) : "0"
                        });
                    }

                }

                resolver({ linhas, abasUsadas });

            } catch (erro) {
                rejeitar(erro);
            }
        };

        leitor.readAsArrayBuffer(arquivo);

    });

}

function lerTextoColado(texto) {

    return String(texto || "")
        .split("\n")
        .map((linha) => linha.trim())
        .filter(Boolean)
        .map((linha) => {
            const partes = linha.includes("\t") ? linha.split("\t") : linha.split(";").length > 1
                ? linha.split(";")
                : linha.split(",");
            return {
                nome: (partes[0] || "").trim(),
                telefone: (partes[1] || "").trim(),
                dias: (partes[2] || "").trim()
            };
        });

}

function ReativacaoBox({ mostrarToast }) {

    const guardado = lerGuardado(CHAVE_GUARDADA, {});

    const [registros, setRegistros] = useState(guardado.registros || []);
    const [modelo, setModelo] = useState(guardado.modelo || MODELO_PADRAO);
    const [dddPadrao, setDddPadrao] = useState(guardado.dddPadrao || "");
    const [resumoImportacao, setResumoImportacao] = useState(null);

    const [naoPerturbe, setNaoPerturbe] = useState(lerGuardado(CHAVE_NAO_PERTURBE, []));

    const [colado, setColado] = useState("");
    const [situacao, setSituacao] = useState("todos");
    const [busca, setBusca] = useState("");
    const [imagens, setImagens] = useState([]);

    const entradaArquivo = useRef(null);
    const entradaImagem = useRef(null);

    useEffect(() => {
        gravar(CHAVE_GUARDADA, { registros, modelo, dddPadrao });
    }, [registros, modelo, dddPadrao]);

    useEffect(() => {
        gravar(CHAVE_NAO_PERTURBE, naoPerturbe);
    }, [naoPerturbe]);

    const conta = useMemo(() => contarPorSituacao(registros), [registros]);

    const visiveis = useMemo(() => {

        const procurado = semAcento(busca);

        return registros
            .filter((r) => situacao === "todos" || r.telefone.situacao === situacao)
            .filter((r) => !procurado || semAcento(r.nome).includes(procurado))
            .sort((a, b) => b.dias - a.dias);

    }, [registros, situacao, busca]);

    function carregar(linhas, origem) {

        const { registros: novos, duplicadosUnidos, descartadosNaoPerturbe } =
            montarRegistros(linhas, { naoPerturbe });

        if (!novos.length) {
            setResumoImportacao({
                erro: true,
                texto: "Não achei nenhuma linha com nome e telefone."
            });
            return;
        }

        setRegistros(novos);
        setResumoImportacao({
            erro: false,
            texto: `${novos.length} cliente(s) de ${origem}.`
                + (duplicadosUnidos ? ` ${duplicadosUnidos} ficha(s) repetida(s) uniram-se.` : "")
                + (descartadosNaoPerturbe ? ` ${descartadosNaoPerturbe} do "não perturbe" ficaram de fora.` : "")
        });

    }

    async function aoEscolherArquivo(evento) {

        const arquivo = evento.target.files?.[0];
        evento.target.value = "";
        if (!arquivo) return;

        try {
            const { linhas, abasUsadas } = await lerPlanilha(arquivo);
            carregar(linhas, `${abasUsadas} aba(s) de "${arquivo.name}"`);
        } catch {
            setResumoImportacao({
                erro: true,
                texto: "Não consegui ler esse arquivo. Confira se é .xlsx, .xls ou .csv."
            });
        }

    }

    function aplicarDDD(id) {

        setRegistros((lista) => lista.map((r) => {
            if (r.id !== id) return r;
            const completo = comDDD(r.telefone, dddPadrao);
            if (completo.situacao !== "ok") {
                mostrarToast?.("Informe um DDD válido no campo acima.", "erro");
                return r;
            }
            return { ...r, telefone: completo };
        }));

    }

    function mudarContato(id, valor) {
        setRegistros((lista) => lista.map((r) => (r.id === id ? { ...r, contato: valor } : r)));
    }

    function pararDeMandar(registro) {

        const numero = registro.telefone.e164;

        if (!numero) {
            setRegistros((lista) => lista.filter((r) => r.id !== registro.id));
            return;
        }

        setNaoPerturbe((lista) => (lista.includes(numero) ? lista : [...lista, numero]));
        setRegistros((lista) => lista.filter((r) => r.id !== registro.id));
        mostrarToast?.(`${registro.nome || "Contato"} não receberá mais mensagens.`, "sucesso");

    }

    function aoEscolherImagens(evento) {

        const escolhidas = Array.from(evento.target.files || []);
        evento.target.value = "";
        if (!escolhidas.length) return;

        const juntas = [...imagens, ...escolhidas].slice(0, MAX_IMAGENS);

        if (imagens.length + escolhidas.length > MAX_IMAGENS) {
            mostrarToast?.(`Dá para anexar até ${MAX_IMAGENS} imagens; usei as primeiras.`, "erro");
        }

        setImagens(juntas);

    }

    async function compartilharComImagem(registro, mensagem) {

        if (!imagens.length) {
            mostrarToast?.("Escolha o encarte antes, logo acima da lista.", "erro");
            return;
        }

        if (navigator.canShare?.({ files: imagens })) {
            try {
                await navigator.share({ files: imagens, text: mensagem });
            } catch {
                /* a pessoa fechou o menu de compartilhar */
            }
            return;
        }

        mostrarToast?.("Este navegador não anexa imagem sozinho — abri o WhatsApp só com o texto.", "erro");
        const link = linkWhatsApp(registro, mensagem);
        if (link) window.open(link, "_blank", "noopener");

    }

    function exportarCSV() {

        if (!registros.length) return;

        const cabecalho = ["Nome", "Dias sem comprar", "Telefone original",
            "Telefone padronizado", "Situação", "Fichas unidas", "Contato", "Mensagem"];

        const situacoes = { ok: "Pronto", semDDD: "Falta DDD", fixo: "Fixo", invalido: "Inválido" };

        const linhas = [cabecalho.join(";")];

        for (const r of registros) {
            linhas.push([
                r.nome, r.dias, r.bruto,
                r.telefone.e164 ? "+" + r.telefone.e164 : formatarTelefone(r.telefone),
                situacoes[r.telefone.situacao], r.fichas, r.contato,
                montarMensagem(modelo, r).replace(/;/g, ",")
            ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
        }

        /* O ﻿ é o que faz o Excel brasileiro abrir o arquivo com
           acento certo. Sem ele, "José" vira "JosÃ©" e a loja acha que
           o sistema corrompeu o cadastro. */
        const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "reativacao-clientes.csv";
        a.click();
        URL.revokeObjectURL(url);

    }

    return (

        <div className="reativacao">

            <section className="rea-box">

                <h2>1. De onde vem a lista</h2>

                <p className="rea-dica">
                    Cole as colunas <b>Nome</b>, <b>Telefone</b> e <b>Dias sem comprar</b> —
                    copiando direto do Excel — ou escolha a planilha do relatório.
                </p>

                <textarea
                    className="rea-area"
                    value={colado}
                    onChange={(e) => setColado(e.target.value)}
                    placeholder={"Maria Silva\t(19) 97517-2840\t183\nJoão Lima\t11 98902-4152\t182"}
                />

                <div className="rea-botoes">

                    <button
                        className="rea-principal"
                        onClick={() => carregar(lerTextoColado(colado), "texto colado")}
                        disabled={!colado.trim()}
                    >
                        Processar lista
                    </button>

                    <button className="rea-secundario" onClick={() => entradaArquivo.current?.click()}>
                        Importar planilha
                    </button>

                    <input
                        ref={entradaArquivo} type="file" accept=".xlsx,.xls,.csv"
                        hidden onChange={aoEscolherArquivo}
                    />

                    {
                        registros.length > 0 && (
                            <button className="rea-secundario" onClick={exportarCSV}>
                                Exportar CSV
                            </button>
                        )
                    }

                </div>

                {
                    resumoImportacao && (
                        <p className={resumoImportacao.erro ? "rea-aviso rea-erro" : "rea-aviso"}>
                            {resumoImportacao.texto}
                        </p>
                    )
                }

            </section>

            {
                registros.length > 0 && (
                    <>

                        <section className="rea-box">

                            <h2>2. A mensagem</h2>

                            <div className="rea-linha">

                                <div className="rea-coluna">
                                    <label className="rea-rotulo">Texto</label>
                                    <textarea
                                        className="rea-area rea-area-curta"
                                        value={modelo}
                                        onChange={(e) => setModelo(e.target.value)}
                                    />
                                    <p className="rea-dica">
                                        <code>{"{primeiro}"}</code> só o primeiro nome,{" "}
                                        <code>{"{nome}"}</code> o nome inteiro,{" "}
                                        <code>{"{dias}"}</code> os dias sem comprar.
                                    </p>
                                </div>

                                <div className="rea-coluna rea-coluna-estreita">
                                    <label className="rea-rotulo">DDD da região</label>
                                    <input
                                        type="text" maxLength={2} inputMode="numeric"
                                        value={dddPadrao}
                                        onChange={(e) => setDddPadrao(soDigitos(e.target.value).slice(0, 2))}
                                        placeholder="19"
                                    />
                                    <p className="rea-dica">
                                        Usado só quando você clica em <b>Usar DDD</b> numa linha —
                                        nunca sozinho, porque chutar o DDD manda a mensagem para
                                        outra pessoa.
                                    </p>
                                </div>

                            </div>

                        </section>

                        <section className="rea-box">

                            <h2>3. Encarte (opcional)</h2>

                            <p className="rea-dica">
                                O WhatsApp não aceita imagem por link. Com o encarte escolhido, o
                                botão <b>Com imagem</b> abre o menu de compartilhar do celular com
                                a foto e o texto juntos — funciona no celular, não no computador.
                            </p>

                            <div className="rea-botoes">
                                <button className="rea-secundario" onClick={() => entradaImagem.current?.click()}>
                                    Escolher imagem
                                </button>
                                <input
                                    ref={entradaImagem} type="file" accept="image/*" multiple
                                    hidden onChange={aoEscolherImagens}
                                />
                                {
                                    imagens.length > 0 && (
                                        <button className="rea-secundario" onClick={() => setImagens([])}>
                                            Remover {imagens.length > 1 ? "todas" : "imagem"}
                                        </button>
                                    )
                                }
                            </div>

                            {
                                imagens.length > 0 && (
                                    <div className="rea-miniaturas">
                                        {imagens.map((arquivo, i) => (
                                            <figure key={i}>
                                                <img src={URL.createObjectURL(arquivo)} alt={`Encarte ${i + 1}`} />
                                                <figcaption>{arquivo.name}</figcaption>
                                            </figure>
                                        ))}
                                    </div>
                                )
                            }

                        </section>

                        <section className="rea-box">

                            <div className="rea-contagem">
                                <span><b>{conta.total}</b> na lista</span>
                                <span className="rea-ok"><b>{conta.ok}</b> prontos</span>
                                <span className="rea-aten"><b>{conta.semDDD}</b> sem DDD</span>
                                <span className="rea-aten"><b>{conta.fixo}</b> fixos</span>
                                <span className="rea-ruim"><b>{conta.invalido}</b> inválidos</span>
                                {
                                    naoPerturbe.length > 0 && (
                                        <span className="rea-bloqueados">
                                            <b>{naoPerturbe.length}</b> no não perturbe
                                        </span>
                                    )
                                }
                            </div>

                            <div className="rea-filtros">

                                <input
                                    className="rea-busca" type="search" placeholder="Buscar por nome…"
                                    value={busca} onChange={(e) => setBusca(e.target.value)}
                                />

                                {
                                    SITUACOES.map((s) => (
                                        <button
                                            key={s.chave}
                                            className={situacao === s.chave ? "rea-chip rea-chip-ativo" : "rea-chip"}
                                            onClick={() => setSituacao(s.chave)}
                                        >
                                            {s.rotulo}
                                        </button>
                                    ))
                                }

                            </div>

                            <div className="rea-tabela-caixa">

                                <table className="rea-tabela">

                                    <thead>
                                        <tr>
                                            <th>Cliente</th>
                                            <th>Dias</th>
                                            <th>Telefone</th>
                                            <th>WhatsApp</th>
                                            <th>Contato</th>
                                            <th></th>
                                        </tr>
                                    </thead>

                                    <tbody>

                                        {
                                            visiveis.map((r) => {

                                                const mensagem = montarMensagem(modelo, r);
                                                const link = linkWhatsApp(r, mensagem);

                                                return (

                                                    <tr key={r.id}>

                                                        <td>
                                                            <b>{r.nome || "(sem nome)"}</b>
                                                            <span className="rea-sub">{r.bruto}</span>
                                                            {
                                                                r.fichas > 1 && (
                                                                    <span className="rea-marca">
                                                                        {r.fichas} fichas unidas
                                                                    </span>
                                                                )
                                                            }
                                                        </td>

                                                        <td className="rea-num">{r.dias}</td>

                                                        <td>
                                                            {
                                                                r.telefone.situacao === "ok"
                                                                    ? formatarTelefone(r.telefone)
                                                                    : (
                                                                        <span className={
                                                                            r.telefone.situacao === "invalido"
                                                                                ? "rea-marca rea-marca-ruim"
                                                                                : "rea-marca rea-marca-aten"
                                                                        }>
                                                                            {
                                                                                r.telefone.situacao === "fixo" ? "fixo — ligue"
                                                                                    : r.telefone.situacao === "semDDD" ? "falta o DDD"
                                                                                        : r.telefone.motivo
                                                                            }
                                                                        </span>
                                                                    )
                                                            }
                                                            {
                                                                r.telefone.situacao === "semDDD" && (
                                                                    <button
                                                                        className="rea-mini"
                                                                        onClick={() => aplicarDDD(r.id)}
                                                                    >
                                                                        Usar DDD {dddPadrao || "—"}
                                                                    </button>
                                                                )
                                                            }
                                                        </td>

                                                        <td>
                                                            {
                                                                link ? (
                                                                    <div className="rea-envio">
                                                                        <a
                                                                            className="rea-whats" href={link}
                                                                            target="_blank" rel="noopener noreferrer"
                                                                            onClick={() => mudarContato(r.id, "Enviado")}
                                                                        >
                                                                            Abrir
                                                                        </a>
                                                                        {
                                                                            imagens.length > 0 && (
                                                                                <button
                                                                                    className="rea-mini"
                                                                                    onClick={() => compartilharComImagem(r, mensagem)}
                                                                                >
                                                                                    Com imagem
                                                                                </button>
                                                                            )
                                                                        }
                                                                    </div>
                                                                ) : <span className="rea-sub">—</span>
                                                            }
                                                        </td>

                                                        <td>
                                                            <select
                                                                value={r.contato}
                                                                onChange={(e) => mudarContato(r.id, e.target.value)}
                                                            >
                                                                {CONTATOS.map((c) => <option key={c} value={c}>{c}</option>)}
                                                            </select>
                                                        </td>

                                                        <td>
                                                            <button
                                                                className="rea-mini rea-mini-ruim"
                                                                title="Nunca mais mandar mensagem para este número"
                                                                onClick={() => pararDeMandar(r)}
                                                            >
                                                                Não perturbe
                                                            </button>
                                                        </td>

                                                    </tr>

                                                );

                                            })
                                        }

                                    </tbody>

                                </table>

                                {
                                    visiveis.length === 0 && (
                                        <p className="rea-vazio">Nenhum cliente com esse filtro.</p>
                                    )
                                }

                            </div>

                            <p className="rea-rodape">
                                A lista fica só neste navegador. Cada mensagem sai de um clique
                                seu, no seu WhatsApp — nada é disparado em massa, que é o que faz
                                o número da farmácia ser bloqueado.
                            </p>

                        </section>

                    </>
                )
            }

        </div>

    );

}

export default ReativacaoBox;
