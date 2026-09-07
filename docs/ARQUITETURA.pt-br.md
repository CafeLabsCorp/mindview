**[Read in English](ARQUITETURA.md)**

# Arquitetura — MindView

O MindView é um visualizador somente-leitura sobre o vault Mind: um server
HTTP local (`server`) expõe um parser/index puro (`domain`) pra uma SPA React
(`web`). Não há banco de dados, não há contas de usuário, não há dependência
de nuvem — os próprios arquivos Markdown do vault são a única fonte de
verdade, e os dados do próprio MindView (tema, cadernos, nós fixados) vivem
num único diretório local fora do vault, nunca misturado nele.

## 1. Os três pacotes, e por que essa divisão

```
domain  (puro, sem fs)  →  server  (toda a IO + HTTP)  →  web  (UI React)
```

- **`domain`** — `(path, bytes) -> ParsedNode`, mais um index builder e um
  punhado de selectors (search, board, staleness, links quebrados/fora,
  órfãos, tree). Nunca toca `node:fs` nem rede — ver o comentário no topo de
  `domain/src/types.ts`. Isso é deliberado, não incidental: significa que
  toda a lógica de parsing/indexação pode ser testada unitariamente com
  strings puras (sem fixtures em disco), e pode ser reaproveitada sem
  alteração se o MindView algum dia ganhar um segundo frontend (uma CLI, uma
  casca Electron com renderer diferente) — nada disso tocaria uma linha de
  `domain`.
- **`server`** — o composition root. Tudo que lê um arquivo de verdade,
  observa o filesystem, faz bind de socket, ou escreve estado do app vive
  aqui, sob `server/src/io/` e `server/src/app/`. `server/src/index.ts` é o
  único lugar que conecta as funções puras do `domain` a IO de disco real e
  transforma o resultado em respostas HTTP.
- **`web`** — uma SPA Vite + React 19 que conversa com o `server` só via
  `/api/*` e nada mais (sem acesso direto a filesystem, nunca — mesmo em
  dev, passa pelo proxy do próprio Vite pro processo do server, ver §7).

Isso foi escrito no ciclo `frontend-web` depois que `domain` e um mockup de
design já existiam mas nenhum processo de verdade servia o vault por HTTP —
o `server` era o composition root que faltava, não uma nova camada
arquitetural inventada em cima de decisões já acordadas.

## 2. Um único lar local pros dados do próprio MindView, fora do vault

O MindView precisa persistir o próprio estado — tema, cadernos, nós
fixados, token de autenticação por execução — mas **nada disso vai dentro
da árvore de pastas do vault**. Uma ideia anterior (uma pasta `.mind-app/`
dentro do vault) foi derrubada durante o ciclo `backend`:

- sujaria permanentemente a saída do `scripts/status-all.sh`;
- ficaria num padrão de diretório patrulhado pelo próprio agente
  `maintenance` do vault (que tem acesso de escrita e mandato de cortar
  cruft);
- vazaria pro `mind-template` (o espelho genérico e clonável do vault) e sua
  checagem semanal de divergência;
- criaria conflitos de merge em `git merge upstream/main` pra quem clonar o
  template.

`.md`/YAML era o **formato** certo pros cadernos; dentro do vault era o
**lugar** errado. O estado do próprio MindView vive num único diretório —
`server/src/app/paths.ts`: `~/.local/share/mindview` (override:
`MINDVIEW_DATA_DIR` / `MINDVIEW_STATE_DIR`, os dois apontam pra cá por
padrão). O código ainda mantém dois agrupamentos lógicos, `houseA.ts` e
`stateB.ts`, porque são escritos de formas diferentes (`atomicWriteFile` com
`.bak` num, escrita simples no outro) — mas existe só um diretório físico.

Um design anterior (2026-09-04) dividia isso em dois diretórios — "Casa A",
um *repositório git separado* (`mindview-data`, sob uma conta GitHub
dedicada) pra guardar a metade durável (settings, cadernos), versus "Casa B",
a metade descartável e local à máquina. **Derrubado em 2026-09-05**: a
proposta de valor inteira do MindView é "abrir e usar" — ninguém quer dar
`git init`/clonar um repositório só pra guardar 4 preferências. Ver §2b pro
que substituiu isso.

- **`config.yaml`** — pra qual caminho de vault esta instância aponta.
- **`settings.yaml`** — cor de destaque, tema, tipografia de leitura, mapa
  tag→cor, o conjunto fixo de toggles (`server/src/app/houseA.ts`,
  `DEFAULT_SETTINGS`).
- **`cadernos/*.md`** — um arquivo por caderno. Frontmatter (`titulo`,
  `simbolo`, `cor`, `criado`) mais uma lista de linhas
  `- [título](mind://<caminho-relativo-ao-vault>) <!-- t: título -->`. O
  comentário `<!-- t: -->` é um **snapshot desnormalizado do título** — ver
  §2a abaixo pra entender por que isso importa.
- **`session.json`** — token + porta desta execução, lido pelo plugin de
  dev-mode do Vite pra injetar o token automaticamente (ver §7).
- **`state.json`** — nós recentes, nós fixados, caminhos de vault recentes.
- **`usage.jsonl`** — log de aberturas, append-only.

Nada aqui é versionado, e nada aqui é lido pelo próprio agente `maintenance`
do vault.

### 2a. O risco de referenciar um vault que o MindView não controla

Entradas de caderno são chaves estrangeiras pra um vault cujo conteúdo muda
concorrentemente — o próprio engine do vault reorganiza arquivos (o §5 do
seu `docs/ARQUITETURA.md` promove uma coleção crescente de nós relacionados
pra pasta própria, movendo arquivos), e uma rodada de manutenção do Mind
pode reescrever vários arquivos de uma vez. Se um caderno só guardasse um
caminho puro, um nó renomeado ou movido desapareceria silenciosamente de
todo caderno que o referenciasse, sem jeito de distinguir "este nó se
moveu" de "este nó foi apagado."

A mitigação, nomeada pelo ciclo `backend` e implementada em
`server/src/app/houseA.ts`, é pequena (~20 linhas): cada entrada de caderno
guarda `titleAtIndex`, o título do nó **como visto pela última vez na
indexação**, junto do caminho. Quando um caminho referenciado não resolve
mais no índice ao vivo (ver a checagem `pathSet` de `Shelf.tsx`, renderizada
como `.is-missing`), o MindView marca o card como ausente e mostra o
último título conhecido em vez de simplesmente derrubar a referência — ele
nunca remove sozinho uma referência pendente. Relinkar pra onde quer que o
nó tenha ido é um passo manual, de propósito: adivinhar por correspondência
de título arrisca reconectar no arquivo errado.

### 2b. Durabilidade via export/import, não um segundo repositório

Já que não existe mais repo por trás de settings/cadernos, `server/src/app/
backup.ts` é toda a história de durabilidade: `GET /api/backup/export`
retorna um único arquivo JSON indentado (`{version, exportedAt, settings,
notebooks, pinnedNodes, recentNodes}`, servido como download via header
`Content-Disposition`) e `POST /api/backup/import` substitui settings,
cadernos (um wipe-then-rewrite completo de `cadernos/` — nunca um merge —
via `replaceAllNotebooks` do `houseA.ts`) e nós fixados/recentes a partir de
um arquivo enviado. Mesmo formato do backup do app Dindin (`lib/services/
import_export_service.dart`: "Exportar backup" / "Importar backup",
substituição completa no import, confirmada pelo usuário antes).
`vaultPath`/`recentVaultPaths` ficam de fora do payload de propósito — um
backup feito numa máquina nunca deve repontar silenciosamente a instância
rodando em outra máquina pra um caminho que pode nem existir lá.
`session.json` e `usage.jsonl` também ficam de fora: um é segredo por
execução, o outro é um log — nenhum dos dois é estado que vale a pena
restaurar. A seção "Backup" da tela de Ajustes
(`web/src/screens/SettingsScreen.tsx`) é a única UI disso — não existe
export automático/agendado.

## 3. Reindex é completo, não incremental — de propósito

`domain/src/buildIndex.ts` reconstrói o `VaultIndex` inteiro (nós,
backlinks, tag set) do zero a cada mudança, sem caminho de atualização
parcial. Medido em **~4,1ms pra 68 arquivos / 356KB** (comentário em
`buildIndex.ts`). Indexação incremental foi considerada e rejeitada:
economizaria uma quantidade imensurável de tempo (4ms) enquanto introduziria
uma classe inteira de bugs de estado obsoleto (um nó que muda quais outros
nós apontam pra ele, uma renomeação que precisa atualizar backlinks em todo
nó que referencia, uma checagem de staleness de índice de pasta que depende
de todo descendente). O `VaultService`
(`server/src/app/vaultService.ts`) trata o índice como um slot mutável único
que é trocado por inteiro — nunca existe um estado "parcialmente
atualizado" pra raciocinar sobre, por construção. Isso só vale porque o
vault fica na faixa de dezenas de arquivos, parse em sub-segundo; se o
vault crescesse duas ordens de grandeza, esse trade-off precisaria ser
revisto.

## 4. Por que `remark`, não CodeMirror

O renderer é `unified` + `remark-parse` + `remark-frontmatter` +
`remark-gfm` — exatamente o mesmo pipeline tanto no `domain` (parsing, pro
índice) quanto no `web` (renderização, via `react-markdown` com os mesmos
plugins remark). É um parser usado duas vezes, nunca dois independentes que
poderiam divergir.

CodeMirror 6 (o próprio engine de editor do Obsidian) foi considerado e
rejeitado nesta versão: o próprio Obsidian ainda mantém dois modos de
renderização separados (live-preview/CM6 pra editar, reading-view pra
exibir) anos depois de adotar CM6 — domar seu sistema de decorations é
trabalho real, de várias semanas, e o MindView é somente-leitura nesta
versão, então não há superfície de edição que justificasse esse custo. O
`remark` produz um mdast (AST de Markdown) com posições de origem de
graça, que é exatamente o que é necessário tanto pra indexação (extração de
link/tarefa/heading com posições — ver §5) quanto pra renderizar em
componentes React. Adotar CM6 agora teria gasto as primeiras duas ou três
semanas do projeto domando um editor pra uma feature (edição) que está
explicitamente fora de escopo até uma fase futura — ver §8.

## 5. Write-shaped, não write-capable

O brief de produto pede que a edição volte numa fase futura, mas nada
nesta versão escreve em conteúdo `.md`, e a posição explícita do ciclo
`backend` foi: não escrever código de escrita não usado ("passivo e não
testado dá falsa confiança"). O que de fato blinda um futuro editor, em vez
disso:

- **Posições de origem em toda estrutura parseada.** `HeadingInfo`,
  `LinkInfo` e `TaskInfo` (`domain/src/types.ts`) carregam todos uma
  `Position` (linha, coluna, offset de byte). Sem isso, uma futura feature
  de "renomear este nó e corrigir seus ~424 links de entrada" teria que
  reparsear-e-adivinhar onde injetar texto; com isso, vira um replace exato
  por offset de byte.
- **`mtime` + texto bruto guardados no índice** (`IndexedNode` estende
  `ParsedNode` com `mtimeMs`/`size`; `ParsedNode.raw` guarda os bytes
  originais) — um futuro escritor faria diff contra os bytes exatos lidos
  por último, não uma reconstrução.
- **O parsing é puro, com um único portão de IO.** Todo acesso a disco
  passa por `server/src/io/`; não existe um segundo caminho informal que uma
  futura feature pudesse contornar.
- **O modelo nunca é re-serializado de volta pra Markdown.**
  `ParsedNode.raw` é guardado verbatim exatamente pra que nada nunca precise
  transformar um AST de volta em texto — a única representação de um
  arquivo `.md` em toda essa base de código é seus próprios bytes originais
  mais uma view derivada, somente leitura. (Os arquivos de caderno, na Casa
  A, são o único lugar onde o MindView de fato serializa — ver
  `serializeNotebook` em `houseA.ts` — mas isso é o formato de arquivo
  *próprio* do MindView, nunca o do vault.)

## 6. Hardening de rede

`server/src/index.ts` roda um server `node:http` puro, sem framework. Faz
bind só em `127.0.0.1` (nunca `0.0.0.0`) e reforça, em **toda** request
dentro de `dispatch()`:

1. **Allow-list do header Host** (`server/src/io/security.ts`,
   `isHostAllowed`) — só `127.0.0.1`/`localhost` na porta exata em uso é
   aceito; qualquer outra coisa é rejeitada com 403. Isso derrota DNS
   rebinding (uma página maliciosa resolvendo um hostname pra `127.0.0.1`
   depois que seu navegador já confia nele). É aplicado em **toda**
   request, incluindo o shell HTML/SPA estático — não só `/api/*`. Se fosse
   reforçado só em `/api/*`, uma página com DNS rebound ainda poderia fazer
   fetch same-origin de `/` (o shell HTML) e ler o token embutido nele (ver
   próximo ponto) antes mesmo da checagem de Host rodar na chamada de API em
   si.
2. **Token por processo**, exigido como `?token=` em toda request `/api/*`
   (`generateToken`, `randomBytes(24)`, regenerado toda vez que o server
   inicia — nunca persistido além do `session.json` na Casa B). Comparado
   com `tokenFromRequest` vindo da query string; divergências levam a 403.
3. **Nunca envia headers de CORS** (`server/src/http/respond.ts`). Acesso
   cross-origin durante `npm run dev` passa pelo proxy do *próprio* dev
   server do Vite — um salto HTTP Node→Node no mesmo processo, não uma
   exceção de CORS concedida pelo navegador — então o navegador só conversa
   com uma origem (a do Vite), e o server de verdade nunca precisa confiar
   em origem nenhuma.
4. **`confine()`** (`server/src/io/confine.ts`) — todo caminho derivado de
   entrada de usuário ou de link é resolvido via `realpathSync` (seguindo
   symlinks) e checado contra a raiz do vault antes de qualquer
   leitura/construção de URI. Isso existe porque não é hipotético: **o
   vault ao vivo tem 7 links que apontam pra fora da própria raiz** —
   alvos reais de path traversal, não uma superfície de ataque teórica
   inventada pra este doc.

O próprio mecanismo de injeção de token (como o navegador recebe o token
sem copiar/colar à mão) está coberto no §7.

## 6a. Por que o `node` roda dentro do WSL

O vault vive no próprio filesystem ext4 da distro WSL. Um processo nativo
do Windows lendo por meio do caminho UNC `\\wsl$\<distro>\...` funcionaria
pra leituras, mas **não recebe eventos `inotify`** — o file-watching teria
que cair pra polling (`usePolling`, a válvula de escape `MINDVIEW_POLL=1`
ainda existe em `server/src/io/watcher.ts` exatamente pra esse caso, mas
não é o default). Rodar `node` nativamente dentro do WSL ganha `inotify`
real de graça. Essa decisão também destrava de graça um item de fase
futura: um terminal embutido (Fase 2, xterm.js + node-pty) pode abrir um
shell WSL e rodar o CLI do Claude Code nativamente, sem uma ponte de
spawn de processo via `wsl.exe` — ver §8.

## 7. Ponte do token de autenticação entre os dois processos de dev

Em modo dev, `server` e `web` são dois processos separados em duas portas
separadas (4317 e 5173). O server gera um token novo a cada início (`TOKEN`
em `server/src/index.ts`) e escreve pro `session.json` da Casa B
(`writeSession`). O próprio plugin do Vite
(`injectTokenPlugin` em `web/vite.config.ts`) lê esse mesmo arquivo a cada
request de `index.html` e carimba
`<script>window.__MV_TOKEN__=...;window.__MV_PORT__=...;</script>` no
`<head>` antes de servir — então o navegador tem o token da execução atual
sem passo manual nenhum. No `npm run start` (processo único), o server faz
o mesmo carimbo sozinho quando serve o `index.html` buildado
(`injectToken` em `server/src/index.ts`) — mesmo mecanismo, dois lugares
diferentes emitindo o HTML dependendo de qual modo está rodando.

O Vite também faz proxy de `/api/*` pro server (`server.proxy` em
`web/vite.config.ts`), que é por isso que o modo dev nunca precisa de CORS:
do ponto de vista do navegador só existe uma origem (a do Vite), e o salto
Vite→server é uma request HTTP Node no mesmo processo, não um fetch
cross-origin do navegador.

## 8. O teste de fence: um caso de regressão permanente e obrigatório

`domain/test/fence.test.ts` existe porque **o mesmo falso positivo já
enganou três pessoas/agentes diferentes trabalhando neste projeto,
independentemente** — cada um, olhando pro `docs/ARQUITETURA.md` no vault,
viu um bloco `tags: [tag1, tag2]` / `criado: AAAA-MM-DD` e concluiu que o
parser estava inventando tags/datas de lixo. Em todos os casos a explicação
real foi a mesma: aquele bloco é um **exemplo de documentação do formato de
frontmatter, escrito dentro de um bloco de código com fence ` ```yaml `**,
não frontmatter de verdade. A linha 1 de verdade do arquivo é um heading
`# `, não `---`.

Por que isso continua se repetindo: o `remark-frontmatter` só reconhece um
bloco `---` quando ele é a primeiríssima coisa no documento — nunca no meio
do documento, e nunca dentro de uma fence (fences são tokenizadas como seu
próprio tipo de bloco antes mesmo de frontmatter ser considerado). Isso está
exatamente certo, mas significa que qualquer extrator ingênuo no estilo
`grep ^tags:`, ou um humano lendo o texto bruto de cima pra baixo, vai achar
o exemplo em fence primeiro e interpretar errado como frontmatter.
`domain/src/parse.ts` acerta isso (só conta se `tree.children[0]` for um nó
mdast do tipo `yaml`), e o `fence.test.ts` trava esse comportamento
permanentemente contra exatamente essa forma de exemplo em fence, mais um
segundo caso relacionado: `claude-user/skills/mind/SKILL.md`, que tem
frontmatter **de verdade** (`name`/`description`) mas sem chave `tags`,
então precisa classificar como `claude-asset`, não `mind-node`, e precisa
contribuir zero tags pro tag set do vault.

**Quem for mexer em `parse.ts`, `buildIndex.ts`, ou na lógica de detecção
de frontmatter precisa rodar o `fence.test.ts` e entender por que cada
assertion existe antes de mudar comportamento em torno de fences ou
detecção de frontmatter.**

## 9. Falhas de teste conhecidas (débito técnico)

Rodar `npm run test -w domain` já mostrou **4 testes falhando, todos drift
de conteúdo no vault, não bugs de parser** — confirmado reparseando à mão os
arquivos atuais do vault e inspecionando a divergência manualmente, não
assumido. **As quatro estão resolvidas em 2026-09-05** (`domain` está
36/36). Esta seção registra o que eram e como cada uma foi corrigida,
porque o formato do bug (um teste acoplado demais ao conteúdo do vault ao
vivo) vale não repetir.

### 9a. `claude-user/skills/mind/SKILL.md` classificado errado como `engine-doc` — CORRIGIDO em 2026-09-05

O frontmatter do `SKILL.md` do vault tinha, dentro do campo `description:`,
um trecho no formato `no Mind: decidir...` — um dois-pontos-espaço dentro
de um scalar YAML **sem aspas**. O YAML lê `chave: valor` dentro daquele
scalar como uma tentativa de mapeamento aninhado e falhava com `mapping
values are not allowed here`. O `parseYaml(yamlNode.value)` de `parse.ts`
lançava, `problems` ganhava uma entrada `frontmatter-parse-error`, e
`frontmatter` caía pra `null` — o que fazia `detectKind` classificar o
arquivo como `engine-doc` (sem frontmatter) em vez de `claude-asset`
(frontmatter presente, sem chave `tags`). Duas assertions em
`fence.test.ts` falhavam por causa dessa única causa raiz. Não era bug do
MindView, e estava fora do escopo deste projeto corrigir diretamente — mas
foi corrigido mesmo assim: o valor de `description:` agora está entre
aspas tanto em `mind/claude-user/skills/mind/SKILL.md` quanto no espelho no
`mind-template`, achado e corrigido enquanto trabalhava o backlog do
MindView (ver `mind/tarefas/empresa/mindview.md`). O `npm run test -w
domain` reflete isso: 27/31 → 29/31.

### 9b. Número de linha hardcoded na assertion sobre `docs/ARQUITETURA.md` — CORRIGIDO em 2026-09-05

`fence.test.ts` afirmava `bytes.split('\n')[77] === '---'` (linha 78) pra
checar que um `---` no meio do documento nunca é confundido com frontmatter.
O `docs/ARQUITETURA.md` do vault cresceu linhas acima desse ponto (uma regra
de "crescimento orgânico" ficou mais longa), então o `---` se moveu. O teste
agora acha o primeiro `---` depois da linha 1 varrendo (`lines.findIndex((l,
i) => i > 0 && l.trim() === '---')`) e afirma que ele existe e que
`frontmatter` continua `null` — sem posição absoluta.

### 9c. O parser contava todo bullet como tarefa — CORRIGIDO em 2026-09-05

O `collectTasks` de `domain/src/parse.ts` empurrava **todo** `listItem` como
tarefa, então um documento de prosa como o `docs/ARQUITETURA.md` produzia
dezenas de "tarefas abertas" fantasma — inofensivo na UI (o `buildBoard` só
lê arquivos `mind-node`) mas suficiente pra inflar os totais do board do
Console e pra fazer uma assertion de "esta fixture tem zero tarefas" falhar.
O `collectTasks` agora filtra por `isTaskItem`: um item de lista só conta se
for checkbox GFM (`li.checked` é booleano) ou seu texto começa com `[~]` (a
convenção de pausado do vault, que o remark-gfm deixa como item comum). O
`parseTask` ficou mais simples — o ramo "bullet comum → tarefa aberta"
sumiu. O `parse.test.ts` tem um caso de regressão ("does not count a plain
bullet as a task").

### Ainda aberto: expor `frontmatter-parse-error` em vez de engoli-lo

O `parse.ts` popula `ParsedNode.problems` com um `frontmatter-parse-error`
quando o frontmatter YAML de um nó falha o parse, e então cai pra
`frontmatter: null` — o que silenciosamente reclassifica o nó como
`engine-doc` (foi a causa raiz do 9a). Nada em `server` ou `web` lê
`problems` hoje. Um `console.warn` no server quando um nó tem `problems`
não-vazio, e/ou um indicador "N problemas de parse" no Console, tornaria
isso visível em vez de uma troca de `kind` silenciosa. Ainda não agendado.

## 10. A tela do grafo

Feita por último de propósito, e entregue como placeholder "Graph — em
breve" até 2026-09-05. Não foi adiamento de agenda: o stress-test do
`orchestrator` achou que o vault tem relativamente pouca estrutura de grafo
— ~70 arquivos `.md`, zero wikilinks (o próprio `ARQUITETURA.md` do vault
proíbe), e links relativos que são quase todos pares índice↔nó (formato de
árvore). O grafo real hoje tem ~69 nós / ~236 arestas deduplicadas, com os
índices de pasta como hubs naturais.

**Dados — `domain/buildGraph(index)` → `GET /api/graph`.** Um `GraphNode`
por arquivo indexado (`path`, `title`, `tags`, `kind`, `isIndex`,
`backlinkCount`). Arestas são links internos resolvidos entre dois nós
indexados; links externos, links fora do vault, âncoras puras e self-links
são descartados, e A→B / B→A / links duplicados colapsam pra **uma aresta
não-direcionada**. `backlinkCount` é o número de *outros nós distintos* que
apontam pra ele (não `index.backlinks.get(path).length`, que conta cada
ocorrência de link, incluindo repetidos e self-links) — é por isso que a
tela dimensiona os nós, deliberadamente não por contagem de links de saída
(um nó de índice aponta pra tudo e dominaria).

**Modelo de render — `web/src/lib/graphModel.ts`.** O grafo do servidor é só
de arquivos; o modelo *renderizável* é derivado na camada web (mantido fora
do `domain` pro selector e seus testes continuarem sendo sobre o vault, não
sobre como ele é desenhado). Opcionalmente adiciona um nó por tag distinta
com uma aresta pra cada arquivo que a carrega, aí aplica os Filtros (busca,
órfãos on/off, tags on/off) e resolve a cor final de cada nó (uma query de
**grupo** que casa ganha da paleta de tag) e o raio.

**Simulação — `web/src/lib/graphSim.ts`.** Uma simulação [`d3-force`][d3f]
viva, avançada na mão pelo loop de `requestAnimationFrame` da tela
(`sim.stop()` na construção, `sim.tick()` por quadro) pra o React ser dono
do quadro e o loop poder ficar ocioso assim que o `alpha` cai abaixo de
`alphaMin` e nada mais está animando. Isso **reverte a decisão anterior** de
escrever à mão um layout estático de uma passada só (`graphLayout.ts`,
deletado): o grafo agora é uma coisa que você agarra, e "reiniciar" o
re-aquece — isso exige uma simulação de verdade rodando, e o `d3-force`
(~11 KB gzipado) é o motor que o grafo do Obsidian essencialmente replica.
O `GraphSim` também é dono do **estado de entrada/saída** de nós e arestas:
um valor linear `p ∈ [0,1]` de presença por item que o render transforma em
opacidade + escala com easing, pra mudança de filtro dar fade em vez de
pop. As forças são fixas (sem painel "Forces"): repulsão many-body escalada
pelo raio do nó, distância/força de link por tipo (arquivo↔arquivo vs.
arquivo↔tag), `forceX/Y` de centralização suave, `forceCollide`.

**Tela — `web/src/screens/GraphScreen.tsx`.** SVG sob um `<g transform>` pro
pan / zoom (scroll em direção ao cursor). Arrastar o fundo dá pan; arrastar
um **nó** move ele (fixado via `fx/fy` enquanto segurado, `alphaTarget`
elevado pros vizinhos acompanharem, solto no pointer-up). Clicar num nó (sem
arrastar) → abre no Leitor. Hover → destaca o nó + vizinhos diretos, esmaece
o resto (com transição CSS). A view **enquadra sozinha** o grafo enquanto
ele assenta, até o primeiro pan/zoom/drag manual; o botão ⊙ faz tween de
volta pra esse enquadre, o ↻ reinicia a simulação — não um simples bump de
alpha, e sim um **re-crescimento encenado**: as posições são re-semeadas, o
grafo esvazia (nós de tag inclusive — o Obsidian mantém os dele na tela, aqui
não) e volta um nó de cada vez. A ordem é órfãos primeiro, depois busca em
largura a partir do nó mais conectado de cada componente, vizinho mais
movimentado primeiro; uma aresta espera as duas pontas. O intervalo por nó é
a pref `revealStepMs` (0–150 ms, default 20; `0` pula o escalonamento e o
grafo volta inteiro de uma vez) — antes era derivado da contagem de nós e
virou um slider, já que o ritmo certo é questão de gosto, não de aritmética.
A ordem é determinística (empate resolve por grau, depois por id), então o
mesmo grafo sempre se monta igual.
Rótulos seguem o "text
fade threshold" do Obsidian: escondidos com zoom afastado, surgindo passado
um zoom que o slider controla, e sempre visíveis **só pro nó sob o mouse** —
estender isso pros vizinhos (o que a tela pré-rework fazia) é inviável com
tags como nós, já que passar o mouse numa tag hub gritaria o nome de todo
arquivo que a carrega. A vizinhança continua destacada, por não ser
esmaecida em vez de por ser rotulada.
Controles (`web/src/screens/GraphControls.tsx`), salvos por
navegador em `localStorage` (`mindview.graphPrefs.v2`, ver
`web/src/lib/graphPrefs.ts`):

- **Aparência** — *cor por tag* é um liga/desliga só. **Ligado**, o nó pega a
  cor da **primeira** tag dele, do mapa `settings.tagColors` do Ajustes,
  senão de um hash estável numa paleta ANSI de terminal **sem verde**
  (`web/src/lib/tagPalette.ts`). **Desligado**, o grafo cai na identidade do
  mind-landing — verde + branco: nós de arquivo em `var(--accent)`, nós de
  tag em `var(--fg)`. (Havia um par de chips "mais específica / primeira";
  cortado porque a distinção nunca se explicava na tela, e a primeira tag —
  nome da pasta em ~93% dos nós — é o que faz o grafo ler como regiões de
  cor em vez de confete.) Também: tamanho por backlinks on/off; tamanho
  chapado pro nó de tag; setas on/off (desenhadas na direção armazenada do
  link — aproximado, já que a aresta do domain é deduplicada/não-direcionada);
  sliders de tamanho de nó, tamanho de tag, espessura de linha e limiar de
  rótulo.
- **Filtros** — busca (prefixos `tag:` / `path:` ou substring), *tags como
  nós* on/off, *órfãos* on/off. "Existing files only" e "attachments" do
  painel do Obsidian não se aplicam: o vault é read-only, não tem anexo, e o
  engine dele proíbe link não-resolvido.
- **Grupos** — colore um subconjunto por uma query de busca, estilo
  Obsidian; um match ganha da paleta de tag pra aquele nó.
- **Restaurar padrão** no rodapé do painel devolve toda pref pro
  `DEFAULT_GRAPH_PREFS` e reativa o auto-enquadre.

Um **nó de tag** é desenhado como um ponto preenchido na cor da própria tag
mais um anel de halo — o anel, não um centro vazado, é o que distingue ele
de um nó de arquivo. O mesmo mapa `tagColors` (com o mesmo fallback de hash
`autoColorForTag`) também alimenta as pills de tag do Leitor, então uma tag
tem uma cor só em todo lugar; as pills caíam num `var(--blue)` chapado pra
qualquer tag que o usuário não tivesse colorido, o que deixava todas iguais
ao lado de um grafo que dava um tom pra cada.

[d3f]: https://github.com/d3/d3-force

## 11. Fora de escopo nesta versão, e por quê

Listado pra ninguém reabrir isso como "isso foi só esquecido?" — cada item
foi uma decisão deliberada, não um descuido:

- **Empacotamento em Electron.** Ainda fora de escopo *nesta versão*, mas a
  decisão mudou em 2026-09-06: o Electron **vai** acontecer, só como
  janela — o server Node e o PTY ficam no próprio processo e o Electron só
  emoldura `http://127.0.0.1:<porta>`, subindo o backend ao abrir e matando
  ao fechar. Esse formato dissolve a objeção registrada abaixo: o Electron
  nunca carrega o `node-pty`, então não há `electron-rebuild` contra o ABI
  do Electron. Também mantém um app só pra dois modos de partida — subir
  `node` nativo (o caso ordinário: alguém no Windows com o vault em
  `Documentos`, `claude` instalado nativo e PowerShell como shell) ou subir
  dentro do WSL (o caso incomum, que é o deste vault). Nota original,
  mantida como registro: o MindView é um app web local (Vite + um
  server Node) hoje; Electron foi adiado até que se queira de fato um
  ícone/janela de app, já que nem o seletor de caminho do vault nem o
  terminal da Fase 2 precisam dele de verdade — um diálogo nativo do
  Explorer é a única coisa que Electron adicionaria de graça agora, e
  digitar/colar um caminho mais uma lista de "recentes" (espelhando como o
  próprio trocador de vault do Obsidian funciona) cobre a mesma necessidade
  sem o custo de empacotamento.
- ~~**Um terminal embutido.**~~ **Entregue em 2026-09-06 — ver §12 abaixo.**
  A fronteira de transporte mantida em aberto pra isso era exatamente o que
  faltava: o `/api/events` seguiu SSE e o terminal ganhou o próprio
  WebSocket. Nota original mantida como registro: planejado pra uma fase
  posterior (xterm.js +
  node-pty, rodando o CLI do Claude Code dentro do app) — deliberadamente
  mais fácil nesse setup web-local + WSL do que seria em Electron
  (`node-pty` precisa de `electron-rebuild` contra o ABI do Electron; aqui
  ele só compila normal, e o PTY pode abrir um shell WSL diretamente em vez
  de atravessar uma ponte `wsl.exe` a partir de um processo Electron nativo
  do Windows). Ainda não iniciado; a única coisa mantida em aberto pra isso
  é uma fronteira de módulo de transporte abstrata, já que o `/api/events`
  de hoje é SSE (só server→client) e um terminal precisa de um canal
  bidirecional (provavelmente WebSocket) depois.
- **Um editor de conteúdo de verdade.** O brief de produto quer um editor
  estilo Obsidian/VS Code eventualmente, mas esta versão é deliberadamente
  somente-leitura — ver §5 pro que já está no lugar pra tornar isso mais
  seguro de adicionar depois, e por que nada aqui está meio construído
  agora.
- **Upload de imagem de capa pros cadernos.** Cadernos do MVP usam um
  conjunto curado de glifos monocromáticos (sem emoji, sem upload de
  imagem) — uma superfície menor e controlada do que "qualquer imagem",
  adiada em vez de cortada.
- **CSS arbitrário/snippets/temas de terceiros.** Ajustes expõe um
  conjunto fixo e curado de controles de aparência (destaque, cor de link,
  tema, tipografia de leitura, cores de tag, alguns toggles) —
  explicitamente não uma superfície estilo Obsidian de "instale qualquer
  snippet de CSS". Isso evita que a identidade visual do app (ver
  `docs/DESIGN.md`) se corroa por customização.
- **Sincronização em nuvem, mobile, contas, API paga.** Desktop-only,
  local-only, single-user por construção — não há estado do lado servidor
  que assuma mais de uma pessoa usando uma máquina.

## 12. O terminal embutido

Entregue na Fase 2 (2026-09-06). O objetivo é estreito e concreto: rodar o
CLI do Claude Code *dentro* do MindView, no vault, sem pagar por uma
integração de IA por API pay-as-you-go — reaproveita o CLI e o plano que já
existem.

**Por que um PTY e não um cano comum.** Um pseudo-terminal é o que faz um
programa interativo acreditar que tem uma pessoa digitando numa tela de
verdade. Programas perguntam ao sistema "estou falando com um terminal ou
com um cano?" e se comportam diferente: o `ls` desliga as cores quando a
saída vai pra um arquivo. Uma TUI de tela cheia como o `claude` precisa de
muito mais que cor — as linhas/colunas da janela (e um aviso quando elas
mudam), cada tecla entregue na hora em vez de uma linha inteira no Enter,
códigos de escape pra mover o cursor, e o Ctrl+C chegando como *sinal* em
vez de caractere literal. Nada disso existe num stdio comum, então sem PTY
o `claude` simplesmente não consegue desenhar a interface. O `node-pty`
(`server/src/app/terminalService.ts`) é a mesma biblioteca do terminal do
VS Code; ela carrega código nativo porque criar um PTY é uma chamada direta
do sistema operacional, não algo que o JavaScript faça sozinho.

**Por que WebSocket, e uma correção honesta.** Um terminal precisa de um
canal bidirecional de baixa latência; o `/api/events` é SSE, que só empurra
server→cliente. As alternativas pesadas foram: implementar o RFC6455 à mão
(~150 linhas de framing binário, masking, fragmentação e ping/pong — peça
plausível de portfólio, mas onde bug sutil se esconde) e SSE mais um POST
por tecla (sem dependência nova, mas cada tecla vira uma requisição HTTP, e
uma TUI de tela cheia sentiria). O `ws` ganhou: zero dependências próprias,
~100 KB, JS puro. O trade-off foi originalmente argumentado como "o server
perde a pureza de zero dependências de runtime" — **essa moldura estava
errada**: `chokidar` e `yaml` já eram dependências de runtime. Não havia
pureza a proteger, só a pergunta ordinária de se a dependência se paga.

**O portão do upgrade** (`server/src/http/terminalSocket.ts`). Um `upgrade`
HTTP nunca chega no handler normal de requisição, então toda guarda do
`server/src/index.ts` precisa ser reaplicada à mão. Quatro checagens, em
ordem: caminho, `Host` (anti DNS-rebinding, §6), `Origin` e o token da
execução — mais o terminal estar habilitado nos ajustes. **A checagem de
`Origin` não é redundante com o token.** A same-origin policy *não* cobre
WebSockets: qualquer página da internet pode abrir um pra `127.0.0.1` (isso
é Cross-Site WebSocket Hijacking), e aqui o que está do outro lado é um
shell. Em dev ela é, na verdade, a *única* tranca cross-origin que sobra,
porque o proxy do Vite reescreve o `Host` (`changeOrigin`) e a checagem
anti-rebinding passa por construção.

A allowlist é um **conjunto exato** de origens — a do próprio server, mais
a origem de dev do Vite fixada (`MINDVIEW_DEV_ORIGIN`, padrão
`http://localhost:5173`, que é por isso que o `web/vite.config.ts` usa
`strictPort: true`). Uma versão anterior aceitava *qualquer* porta de
loopback, e a revisão de segurança mostrou que isso era explorável ponta a
ponta: a política de CORS padrão do Vite responde a qualquer origem de
loopback, o HTML que ele serve carrega o token da execução, então uma
página em qualquer outra porta local podia ler o token e abrir um shell com
ele. Daí também o `cors: false` na config do Vite — a SPA só faz fetch
same-origin, então não custa nada. Um `Origin` ausente é permitido:
navegadores sempre mandam um no handshake de WebSocket, então isso só
admite clientes não-navegador, que ainda precisam do token.

**`terminalEnabled` é um interruptor de usabilidade, não uma fronteira de
segurança.** Quem tem o token pode religá-lo por `PUT /api/settings` e
conectar. A fronteira é o token — e é por isso que ele não é mais impresso
no console e que Casa A/B são criadas `0700` com arquivos escritos `0600`:
esses dois fatos decidem o tamanho do estrago quando ele vaza. Os ajustes
de terminal que chegam no `spawn` são coagidos de tipo a cada leitura
(`sanitizeTerminal` no `houseA.ts`), porque o `settings.yaml` é escrito por
um endpoint HTTP e editável em disco — não é um arquivo confiável.

**Protocolo de fio, deliberadamente assimétrico.** Server→cliente: frames
binários são saída crua do terminal (volume alto, sem motivo pra escapar
cada pedaço em JSON), frames de texto são controle JSON (`ready` / `exit` /
`error`). Cliente→server: só JSON em texto (`input` / `resize`) — teclas
são minúsculas, então clareza ganha de bytes. O navegador decodifica a
saída com um `TextDecoder` em modo streaming, porque um caractere UTF-8
pode ser partido entre dois frames.

**Desligado por padrão.** Um app web local capaz de abrir um shell
arbitrário é uma superfície bem diferente de um leitor read-only, então o
`terminalEnabled` sai `false` e o endpoint recusa o upgrade até ser ligado
— o socket não está apenas escondido na UI, ele não existe.

**Nada é chumbado em bash.** O dono do vault usa WSL, mas quem clonar este
repositório pode estar em PowerShell, cmd, zsh ou fish, então o
`server/src/app/shells.ts` detecta o que existe de verdade *nesta* máquina
e o `GET /api/terminal/shells` reporta tanto essa lista quanto o que os
ajustes atuais resolvem. Três ajustes governam uma sessão: o shell (em
branco = o padrão da máquina), o diretório inicial (em branco = **a raiz do
vault ativo**, pro terminal sempre abrir no Mind e não onde o server foi
iniciado) e o comando digitado ao abrir (padrão `claude`, em branco = shell
puro). É essa a diferença entre um app que funciona pro autor e um que
funciona pra quem clonar.

**Descoberta, e por que a barra existe.** A primeira versão saiu como um
opt-in mudo: desligada por padrão, sem nenhuma affordance em lugar nenhum e
com um atalho de teclado que deliberadamente não faz nada enquanto a
feature está desligada. Isso é indescobrível — o único jeito de saber que o
terminal existia era ler a tela de ajustes de ponta a ponta. Então agora
existe uma barra permanente no rodapé da janela. Quando o terminal está
desligado, ela diz isso e leva pro interruptor; mostrar esse link não
concede capacidade nenhuma, já que o socket continua recusando toda
conexão. A lição generaliza: *desligado por padrão* e *invisível* são
decisões diferentes, e só a primeira era a intenção.

**A barra é o painel recolhido, não um segundo controle pra ele.** Ter uma
barra *e* um cabeçalho de painel que alternavam a mesma coisa lia como
confusão, e deixava o botão de recolher sozinho na direita. Agora são uma
coisa só em dois estados: recolhida, a barra carrega a lista de sessões
(com os pontinhos de estado, então um shell que morreu em segundo plano
aparece sem precisar expandir) e clicar numa sessão expande dentro dela;
expandida, a barra sai de cena e as abas ficam no cabeçalho do painel, com
`+` / `›` / `✕` como um grupo. Só um dos dois está em tela por vez.

**Uma nota sobre `[hidden]`.** Recolher originalmente deixava pra trás um
painel escuro e vazio, porque `.terminal-panel` define `display: flex` e
*qualquer* regra do autor supera o `[hidden] { display: none }` do próprio
navegador, que vive na UA stylesheet. As views filhas escondiam certo só
porque não tinham regra de `display` própria. É o mesmo formato do bug do
rótulo do grafo (uma regra CSS ganhando de um atributo de apresentação
SVG): dois mecanismos disputando uma propriedade, e o mais silencioso
perde. Corrigido globalmente em vez de naquele seletor — o `global.css`
agora declara `[hidden] { display: none !important }`, então o atributo
sempre ganha.

**Minimizar não é encerrar.** O shell de uma sessão morre quando o
`TerminalView` dela desmonta — o cleanup fecha o socket e o server mata o
PTY no `close`. Esse fato sozinho define o painel inteiro: minimizar mantém
toda aba montada e só as esconde, enquanto o `✕` de uma aba desmonta e é,
portanto, a única coisa que encerra um shell. Sessões são abas, cada uma
com seu próprio xterm e seu próprio socket, limitadas a 8 no server. Um
painel escondido e sem abas não abre nenhuma: subir o `claude` atrás de
algo que ninguém vê seria desperdício e surpresa.

**Tempo de vida da sessão.** Um PTY por socket; ele morre com o socket. O
painel sobrevive a trocas de *tela* porque a SPA nunca recarrega enquanto
você navega, mas um reload do navegador começa um shell novo. Reatar a uma
sessão sobrevivente (buffer de scrollback mais um período de carência após
a desconexão) foi considerado e deixado de fora desta rodada de propósito —
adiciona ciclo de vida de processo órfão a uma feature cuja primeira versão
é melhor pequena.

**Controle de custo no cliente.** O `@xterm/xterm` tem ~250 KB e o terminal
sai desligado, então o `TerminalPanel` é `React.lazy()`-ado pro próprio
chunk: uma sessão que nunca abre o painel nunca baixa isso.

## 13. Duas línguas, sem next-intl

A interface sai em inglês e português. Os outros repositórios daqui
(mind-landing, dindin-landing, domo-landing, cafelabs-portifolio) são apps
Next.js com next-intl, catálogos `messages/en.json` + `messages/pt.json` e
um segmento de rota `[locale]`. O MindView é uma SPA em Vite atrás de um
hash router: não existe segmento de rota onde pendurar o locale, e o
next-intl é acoplado ao Next.

Então isto mantém a metade que carrega a consistência — os arquivos de
catálogo, no mesmo lugar, com a mesma forma de namespaces — e substitui a
metade que não transplanta por ~90 linhas em `web/src/i18n/`: busca por
chave pontuada, interpolação de `{nome}` e entradas de plural
`{one, other}`. Nenhuma dependência nova, o que combina com a forma como o
resto deste código trata problemas pequenos e bem entendidos (`hashRoute`,
`graphPanelState`, `tagPalette`).

- **Inglês é a língua-base**, como em todo repositório daqui. O `en.json` é
  o arquivo que precisa ter todas as chaves; o que faltar no `pt.json` cai
  nele em vez de mostrar uma chave crua pro usuário. Um teste garante que
  os dois catálogos têm as mesmas chaves *e* os mesmos placeholders, então
  um `{count}` presente numa língua e ausente na outra quebra antes de
  alguém ver.
- **A preferência mora no `settings.yaml`**, ao lado do `theme`, não no
  `localStorage`. É preferência de verdade, não estado de UI por navegador
  — passa no mesmo teste que o `theme` — e tem os mesmos três estados:
  `en`, `pt` ou `auto`, que lê o `navigator.languages`. Só a subtag
  primária importa, então pt-BR e pt-PT são ambos `pt`.
- **O vault nunca é traduzido.** Títulos de nós, tags, headings e caminhos
  são as palavras do próprio usuário; só a moldura em volta muda. Datas
  seguem o locale resolvido (`toLocaleDateString`), porque data é
  formatação, não conteúdo.
- **Os testes selecionam pelo catálogo**, nunca por um rótulo literal
  (`t('terminal.collapse')`, não `"Recolher o terminal"`), pra reescrever
  um texto continuar sendo mudança de tradução em vez de teste quebrado.
