/* Fase 3 da plataforma multiloja: isolamento.

   Uma tabela só, com tudo que é privado de uma farmácia: como ela entra
   no painel e em qual banco ficam os dados dela.

   SENHA POR LOJA, COM HASH E SAL

   Hoje existe uma PAINEL_KEY só, em variável de ambiente, comparada com
   "===". Isso não estica para N farmácias: ou todas usam a mesma senha —
   e aí a dona da loja A entra no painel da B —, ou guardaríamos N senhas
   em texto no banco, que é trocar um problema por outro pior.

   O sal é por loja, e não um só para todas. Sem ele, duas farmácias que
   escolhessem a mesma senha teriam o mesmo hash: quem olhasse o banco
   descobriria quais repetiram senha e quebraria todas de uma vez.

   SHA-256 porque o Workers tem Web Crypto nativo e não entra dependência
   nova. Não é bcrypt nem Argon2 — mas o que protege aqui não é a força
   do hash, é o limite de cinco tentativas por IP que já está no ar. Não
   existe "o atacante baixou o banco e quebra offline" sem que antes ele
   tenha acesso ao D1 — e aí a senha é o menor dos problemas.

   QUAL BANCO É O DA LOJA

   A coluna `banco` guarda o nome do binding de D1 daquela farmácia.

   Um banco por loja, e não uma coluna loja_id em oito tabelas, porque
   consulta que esquece o WHERE não dá erro: devolve o dado de todas as
   lojas e parece certa. Com banco separado, o dado da farmácia A não
   está ao alcance do código que atende a B — não por disciplina de
   escrita, mas porque a conexão é outra. E a resposta para quem compra
   deixa de ser "sim, por coluna" e passa a ser "sim, banco separado",
   que é verificável sem confiar no nosso código.

   O nome do binding é escrito à mão, e não derivado do slug: derivar
   faria uma loja renomeada apontar silenciosamente para outro banco.

   LOJA SEM LINHA AQUI

   É a loja que já existia. Ela entra com a PAINEL_KEY de sempre e usa o
   banco que o worker já usa. É isso que permite esta fase subir sem
   mover um byte de dado em produção e sem ninguém ficar de fora do
   painel no meio do expediente.

   Nenhuma coluna é obrigatória além do slug, de propósito: dá para
   cadastrar só o banco de uma loja nova e deixar a senha para depois, ou
   o contrário.

   COMO RODAR

   Cole o schema-acesso-colar.sql no console do D1 — este arquivo tem
   comentário, e o console não aceita comentário de tipo nenhum.

   A senha NÃO se cadastra por aqui. Hash e sal entram pela rota
   POST /loja/senha do worker, que calcula os dois: senha digitada em
   console de banco fica no histórico do navegador e no log de quem
   administra. */

CREATE TABLE IF NOT EXISTS lojas_acesso (
    slug       TEXT PRIMARY KEY,
    hash       TEXT,
    sal        TEXT,
    banco      TEXT,
    trocada_em TEXT
);
