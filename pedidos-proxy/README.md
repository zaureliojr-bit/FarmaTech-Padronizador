# Pedidos Proxy

Worker do Cloudflare que guarda o histórico de pedidos do site num
banco D1, e serve os relatórios para o painel da loja.

Até aqui o pedido ia só para uma planilha, com todos os itens numa
célula de texto — algo como `2x Dipirona [789...] | 1x Novalgina [789...]`.
Dá para ler um pedido assim, mas não dá para somar: "quantas dipironas
eu vendi esse mês" exige quebrar string. Aqui **cada item é uma linha**,
e daí saem os relatórios de produtos vendidos, faturamento por dia e
clientes que voltaram.

O envio para a planilha continua acontecendo em paralelo. Os dois
caminhos convivem até você confiar no painel.

## Deploy (painel do Cloudflare, sem linha de comando)

### 1. Criar o banco D1

1. **Armazenamento e Bancos de Dados** → **D1 SQL Database** → **Criar**.
2. Nome: `farmatech-pedidos-db`.
3. Aberto o banco, vá em **Console**, cole o conteúdo de `schema.sql`
   deste diretório e **Executar**. Cria as três tabelas; rodar de novo
   não estraga nada.

> Pode usar o mesmo banco do `imagens-proxy` se preferir um só — os
> nomes de tabela não conflitam. Bancos separados só deixam mais fácil
> apagar um sem mexer no outro.

### 2. Criar o worker

1. **Workers e Páginas** → **Criar** → **Criar Worker**, nome
   `farmatech-pedidos-proxy` → **Implantar**.
2. **Editar código** → apaga o conteúdo padrão, cola o `worker.js`
   deste diretório → **Implantar**.

### 3. Ligar o worker ao D1

Na página do worker → **Configurações** → **Bindings** → **Adicionar**:

- Tipo **D1 Database** → nome da variável `DB` → banco
  `farmatech-pedidos-db` (o do passo 1).

### 4. Criar a senha do painel

Ainda em **Configurações** → **Variáveis e Secrets** → **Adicionar**:

- Tipo **Secret**, nome `PAINEL_KEY`, valor: uma senha que você inventa.

É ela que abre o painel. Sem ela, os relatórios respondem 401.

### 5. Apontar o site para o worker

Copie a URL do worker (algo como
`https://farmatech-pedidos-proxy.SEU-SUBDOMINIO.workers.dev`) e coloque
no topo do `script.js` do site, em `API_PEDIDOS_D1`.

## Rotas

| Método | Rota | Precisa de senha | Para quê |
|---|---|---|---|
| POST | `/pedidos` | não | o site grava um pedido |
| POST | `/busca` | não | o site grava um termo buscado |
| POST | `/funil` | não | o site conta uma etapa (visita, busca, carrinho) |
| POST | `/campanha` | não | o site conta uma visita vinda de um anúncio |
| GET | `/resumo?dias=30` | sim | números do painel |
| GET | `/pedidos/{ref}` | sim | um pedido com os itens |
| GET | `/clientes?limite=100` | sim | quem já comprou |
| POST | `/status` | sim | muda o status de um pedido |
| GET | `/campanhas?dias=30` | sim | as campanhas e o que cada uma vendeu |
| POST | `/campanhas` | sim | cria ou atualiza uma campanha |
| POST | `/campanhas/excluir` | sim | desliga uma campanha (sem apagar o histórico) |
| POST | `/promocoes/quantidade` | sim | cria "leve 3 pague 2" ou "3 por R$ 10" |
| POST | `/promocoes/quantidade/excluir` | sim | tira a oferta de um produto, de vários ou de um lote |
| GET | `/lojas/{slug}` | chave de **dono** | o cadastro completo de uma filial, para preencher o formulário |
| POST | `/lojas/{slug}` | chave de **dono** | altera o cadastro e o horário dessa filial |

Status aceitos: `novo`, `separando`, `receita-ok`, `entregue`, `cancelado`.

O `/resumo` traz, junto dos números de venda, `maisProcurados` (o que foi
digitado na busca do site) e `naoEncontrados` (o que foi procurado e não
devolveu produto nenhum). O segundo é o relatório que mostra o que falta
no catálogo — vendas que não aconteceram e que o histórico de pedidos,
por definição, nunca mostraria.

## O apelido da filial não muda

A edição de uma filial (`POST /lojas/{slug}`) alcança tudo menos duas
coisas, e as duas recusas são deliberadas.

O **slug** não muda. Ele não é um nome: é o endereço do site
(`mais-barato.drogalink.com.br`), o prefixo das imagens no R2, o nome do
binding do banco e o carimbo já colado em anúncio pago. Trocá-lo
renomearia a etiqueta e deixaria tudo o que ela identifica apontando
para o lugar antigo — e o pior é que a loja continuaria abrindo, vazia.
Para mudar de endereço, cadastra-se outra filial e desliga-se esta. A
tentativa é recusada com essa explicação, e não ignorada em silêncio.

O **ativo** também não, por outro motivo: ligar uma filial tem
conferência própria (banco, schema, horário) e rota própria. Deixá-lo
passar pela edição daria um caminho para pôr no ar uma loja cujo banco
nem existe — e o cliente entraria num site que aceita pedido e grava em
lugar nenhum.

Só o que vem no corpo é alterado; campo ausente fica como está. É o que
permite à tela mandar só o que mudou, e o que impede um formulário que
não conhece uma coluna nova de apagá-la sem querer. O horário é a
exceção: vem inteiro ou não vem, porque "segunda sumiu porque a tela não
a mandou" aparece como loja fechada numa terça de manhã.

## As duas promoções convivem

A rota pública `/promocoes` devolve duas listas: `promocoes`, que troca
o preço de uma unidade, e `quantidade`, com as ofertas de "leve 3 pague
2" e "3 por R$ 10". Não são alternativas — "R$ 5,90 cada, ou 3 por R$
15" é como a farmácia anuncia de verdade.

A aritmética não mora aqui. Quem calcula é o `promoQtd.js`, no site,
que roda sem navegador e tem teste: dois lugares calculando dinheiro é
como um deles fica errado. O worker guarda o que a loja prometeu e
recusa o que não faz sentido ("pague 4 levando 3"), porque a validação
da tela é do lado de fora e qualquer um a reescreve.

A consulta das ofertas vem fora do mesmo `prepare` das promoções
comuns, de propósito: a tabela é nova, e farmácia que ainda não colou o
`schema-promo-quantidade.sql` derrubaria TODAS as promoções se a
consulta pudesse falhar junto — a loja voltaria ao preço de tabela sem
ninguém ligar uma coisa à outra.

## O funil e as campanhas não identificam ninguém

As duas contagens públicas (`/funil` e `/campanha`) recebem uma palavra e
nada mais: `{"etapa":"busca"}`, `{"campanha":"instagram-outubro"}`. Quem
garante que cada etapa conte uma vez por visita é o próprio navegador,
com um registro que fica no `sessionStorage` e nunca sai de lá.

É por isso que não há cookie, não há identificador e não há banner de
consentimento. Numa farmácia o que a pessoa procura é informação de
saúde, e a forma mais segura de guardar isso é não ter como ligar a
ninguém — as tabelas foram feitas para não poderem responder "quem".

Duas regras que o worker impõe, e que não são detalhe:

- **a etapa `pedido` não vem do site.** Quem a grava é o `/pedidos`,
  quando o pedido entra de verdade. Aceitá-la na rota pública deixaria
  qualquer um mandar dez, e o painel mostraria dez vendas que não
  existem;
- **campanha que não existe é ignorada.** Sem isso, qualquer
  `?c=qualquer-coisa` viraria linha no relatório, e o número que decide
  onde a loja põe o dinheiro do mês estaria sendo escrito de fora.

## O que a tabela de buscas NÃO guarda

Termo e contagem, nada mais. Sem telefone, sem IP, sem identificador de
sessão. Não dá para ligar uma busca a uma pessoa, nem cruzar com a tabela
de clientes — é estatística da loja, não histórico de ninguém. Isso é
escolha de projeto, não descuido: busca em farmácia entrega doença, e
esse tipo de dado não deveria existir num banco que não precisa dele.

## Por que gravar pedido não tem senha

Quem grava é o site, que é público. Qualquer chave colocada ali estaria
visível no código-fonte da página, protegendo nada. No lugar disso o
worker valida o formato com rigor, limita tamanho de texto e número de
itens, e recalcula o total de cada linha em vez de confiar no que
chegou. É a mesma exposição que a planilha já tinha — a diferença é que
aqui o dado chega limpo e um pedido repetido não duplica itens.

Se um dia isso incomodar, o caminho é o Turnstile do próprio Cloudflare
na finalização do pedido, não uma chave no JavaScript.

## Sobre os dados dos clientes

A tabela `clientes` é o resumo do que os pedidos já dizem: nome,
telefone, último endereço e totais. Serve para o balcão reconhecer quem
está ligando e para ver quem voltou a comprar.

Isso é dado pessoal e vale tratar como tal. O aviso no site diz que os
dados são usados "apenas para preparar e entregar este pedido" — se um
dia a loja quiser usar essa lista para promoção ou mensagem em massa,
o texto do site precisa mudar antes, e o cliente precisa consentir.

Para apagar os dados de alguém que pedir (é direito dele pela LGPD),
no Console do D1:

```sql
DELETE FROM clientes WHERE telefone = '11987654321';
UPDATE pedidos SET cliente = '(removido)', telefone = '', endereco = ''
 WHERE telefone = '11987654321';
```

O pedido em si fica — a farmácia precisa dele para a escrituração — mas
sem os dados que identificam a pessoa.

## Limites do plano gratuito

D1 no free tier: 5 GB de armazenamento e 5 milhões de linhas lidas por
dia. Um pedido com 5 itens ocupa por volta de 1 KB. Não é o tipo de
coisa que essa loja vai estourar.


## Porteiro do catálogo: os bindings de serviço

As rotas `/catalogo/*` repassam a chamada para o `imagens-proxy` e o
`publish-proxy`, carimbando a chave de cada um — é o que tira essas
chaves do navegador.

O repasse **tem de ser por binding de serviço**, não por `fetch()` no
endereço do outro worker. A Cloudflare recusa um Worker chamar outro
Worker da mesma zona por HTTP e devolve **404 com `error code: 1042`**,
que é indistinguível de rota inexistente — já custou uma hora de caça no
lugar errado aqui.

No painel: worker `farmatech-pedidos-proxy` → **Configurações** →
**Bindings** → **Adicionar** → tipo **Service**:

| Nome da variável | Worker de destino |
|---|---|
| `IMAGENS_SERVICE` | `farmatech-imagens-proxy` |
| `PUBLISH_SERVICE` | `farmatech-publish-proxy` |

As variáveis de endereço (`IMAGENS_PROXY_URL`, `PUBLISH_WORKER_URL`)
continuam necessárias: elas montam o caminho da chamada. O host é
ignorado quando o binding existe.

Sem os bindings o código cai num `fetch()` comum — que serve para destino
fora da conta e para os testes, mas em produção leva 1042.
