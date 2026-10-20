# Agente de envio (n8n) — reativação de clientes

O painel prepara a campanha; o agente envia. A ponte entre os dois é
uma fila no banco **daquela farmácia**, com quatro rotas.

## Antes de tudo: qual WhatsApp

Esta é a decisão que define se a ferramenta dura.

**Biblioteca não oficial** (Baileys, whatsapp-web.js, e os nós de n8n
que as embrulham): lê o QR Code do WhatsApp comum e manda em nome dele.
Funciona, é barato, e **funciona até o dia em que a Meta banir o
número**. Quando banir, a farmácia perde o canal que mais vende e o
histórico de conversa com os clientes junto. Não é "se", é "quando" —
o padrão de muitas mensagens iguais para contatos que nunca
responderam é exatamente o que o sistema procura.

**API oficial (WhatsApp Business Cloud API)**: custa por conversa e
exige duas coisas que a não oficial não exige — **modelo de mensagem
aprovado pela Meta** e **aceite prévio do cliente** para mensagem de
marketing. É mais trabalho e é o caminho que não derruba o número.

Este worker não escolhe por você: a fila é a mesma nos dois casos. Mas
se for pela não oficial, use o número de um chip separado, e não o
número principal da farmácia.

## As rotas

Todas pedem o mesmo cabeçalho do painel — a senha **daquela** farmácia:

```
X-Painel-Key:  <senha do painel da loja>
X-Painel-Loja: <apelido da filial; omita para a farmácia original>
```

É assim que a fila de uma farmácia não é alcançável com a senha de
outra: o agente entra pelo mesmo portão do painel.

### 1. Pegar o próximo lote

```
GET /reativacao/proximos?limite=10
```

```json
{
  "contatos": [
    { "telefone": "5519975172840", "nome": "Maria Silva", "dias": 183,
      "mensagem": "Oi Maria! ..." }
  ],
  "restam": 42,
  "resumo": { "espera": 42, "enviado": 8 },
  "ritmoSugerido": { "segundosEntreMensagens": 20, "porHora": 150 }
}
```

A mensagem **já vem pronta**, com nome e dias trocados. O agente não
monta texto — se montasse, haveria dois lugares decidindo o que o
cliente lê, e um dia eles discordariam.

Pegar um contato o marca como `enviando`. **Uma chamada nunca devolve o
que outra já devolveu**, que é o que impede o cliente de receber a mesma
mensagem duas vezes.

Teto de 50 por chamada, de propósito.

### 2. Dizer o que aconteceu

```
POST /reativacao/resultado
{ "resultados": [
    { "telefone": "5519975172840", "enviado": true },
    { "telefone": "5511989024152", "enviado": false, "erro": "sem WhatsApp" }
] }
```

**Confirme sempre, inclusive as falhas.** Sem confirmação a linha fica
presa em `enviando`; ela volta para a fila depois de 15 minutos, mas
isso é a rede de segurança para o agente que caiu — não o caminho
normal. Depois de três voltas sem notícia, o worker desiste dela para
não girar no mesmo item enquanto o resto da campanha espera.

### 3. Quem pediu para parar

```
POST /reativacao/parar
{ "telefone": "5519975172840", "motivo": "respondeu-stop" }
```

**Esta é a rota mais importante do conjunto.** Ligue o fluxo que lê as
respostas e chame-a sempre que o cliente escrever "sair", "parar",
"não quero", "descadastrar" — e também quando xingar, que também é um
não.

O bloqueio vale **para sempre**: a campanha seguinte, carregada da
mesma planilha, não traz a pessoa de volta. Sem isso não é descuido, é
insistir depois de um não.

### 4. Carregar a campanha

```
POST /reativacao/fila
```

Quem chama é o painel, no botão **Mandar para o agente**. A fila
anterior é substituída — campanha é de um momento, e sobra de outubro
mandaria "faz 183 dias" em novembro, quando já não é verdade.

## O fluxo no n8n, em cinco nós

1. **Schedule** — de hora em hora, no horário comercial. Mensagem de
   farmácia às 23h não reativa ninguém; irrita.
2. **HTTP Request** — `GET /reativacao/proximos?limite=10`
3. **Split In Batches** + **Wait** de 20 segundos entre um e outro.
   É o nó que mais importa para o número sobreviver: rajada é o que
   queima.
4. **Enviar** pelo nó do WhatsApp que você escolheu.
5. **HTTP Request** — `POST /reativacao/resultado` com o que saiu e o
   que falhou.

E, em paralelo, um fluxo de **entrada**: webhook das respostas →
procura "sair/parar/não quero" → `POST /reativacao/parar`.

## O que eu faria antes de ligar na farmácia inteira

- Rode numa lista de **dez contatos** conhecidos, de gente que vai te
  dizer se a mensagem chegou estranha.
- Confira o horário: nada antes das 9h nem depois das 19h.
- Tenha a resposta pronta para quem responder — mandar mensagem e não
  atender quem responde é pior do que não mandar.

## Uma coisa que não é detalhe técnico

O "dias sem comprar" de uma farmácia diz mais do que parece: quem
comprava o mesmo remédio todo mês e parou é informação sobre a saúde
daquela pessoa. Isso não impede a campanha — reativação é varejo
normal —, mas vale lembrar na hora de escrever o texto. Mensagem
genérica ("temos ofertas, precisando é só chamar") é segura. Mensagem
que cita o produto que a pessoa comprava revela, para quem estiver
olhando a tela do celular dela, algo que ela não escolheu contar.
