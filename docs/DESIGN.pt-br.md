**[Read in English](DESIGN.md)**

# Design — MindView

Identidade visual herdada 1:1 do [mind-landing](https://github.com/CafeLabsCorp/mind-landing)
— a estética escura e técnica de "terminal/CLI" que já representa o produto
Mind publicamente. Todos os tokens abaixo vivem em
`web/src/styles/tokens.css`, portados diretamente de
`mind-landing/src/app/[locale]/globals.css` (ver o comentário no topo
daquele arquivo).

## Histórico: duas rodadas de design, uma rejeitada

O primeiro ciclo de design produziu um mockup numa direção skeumórfica
"Ateliê" — texturas de madeira, capas de caderno em tecido,
Fraunces/Inter/JetBrains Mono. **O Felipe rejeitou**: pareceu "design bonito
genérico" em vez de uma extensão da marca real do Mind — ele notou
especificamente semelhança com o estilo visual do Dindin (cores, fontes,
estilo de boxes), não com a identidade do próprio Mind. A causa raiz,
nomeada no retro: o brief daquele ciclo pediu algo "ousado/experimental" sem
ancorar na identidade que já existe (`mind-landing`), o que abriu espaço pra
inventar uma direção genérica em vez de aplicar a marca real. (Aquele
mockup rejeitado fica guardado como possível ideia futura de reskin do
Dindin — o Felipe curtiu o estilo, só não pro MindView.)

A segunda rodada corrigiu isso extraindo a fonte de verdade de fato — o
próprio `docs/DESIGN.md` e `globals.css` do `mind-landing` — e produziu a
identidade abaixo, que o Felipe aprovou.

## Paleta

As duas variantes, escura (default) e clara, são declaradas em
`tokens.css` e trocadas por um atributo `[data-theme]` no `<html>` (ver o
`applyThemeToDom` de `context/SettingsContext.tsx`) — diferente do
`mind-landing`, que só segue o `prefers-color-scheme` do sistema sem toggle
manual, o MindView tem uma escolha explícita escuro/claro/sistema em
Ajustes.

| Token | Escuro (default) | Claro | Uso |
| --- | --- | --- | --- |
| `--bg` | `#0d0d0d` | `#f9f9f7` | fundo da página |
| `--surface` | `#161615` | `#fcfcfb` | cards, barra do terminal, painéis |
| `--surface-2` | `#1c1c1a` | `#f1f0ec` | superfícies secundárias, estados de hover |
| `--code-bg` | `#0a0a0a` | `#111110` | blocos de código/terminal — **fixo escuro nos dois temas**, ver abaixo |
| `--fg` | `#f2f1ec` | `#0b0b0b` | texto principal |
| `--muted` | `#c3c2b7` | `#52514e` | texto secundário |
| `--subtle` | `#8a887f` | `#898781` | texto terciário, legendas |
| `--border` | `rgba(255,255,255,.1)` | `rgba(11,11,11,.1)` | bordas |
| `--green` | `#3fb950` | `#1a7f37` | **o accent** — CTAs, estado ativo, prompt, o futuro hub do grafo |
| `--blue` | `#5b9eea` | `#1e5aa8` | accent secundário (ganhou uso real aqui — era um token não usado, `TODO: confirmar`, no `mind-landing`) |
| `--danger` | `#f0655c` | (igual) | links quebrados, o guarda-corpo de contraste |
| `--radius` | `14px` | | raio de canto padrão |

`--on-code` / `--on-code-subtle` / `--on-code-accent` são **fixos, nunca
invertidos pelo tema**, usados só em cima de superfícies `--code-bg`. Esses
existem por causa de um bug real achado *durante* o próprio discovery do
MindView: o `mind-landing` tinha `.term-line`/`.cursor` herdando
`var(--muted)`/`var(--green)`, ambos invertendo pra quase-preto no tema
claro do `mind-landing` — texto ilegível sobre o fundo do terminal falso
(sempre escuro). O ciclo de design do MindView corrigiu a mesma categoria
de bug localmente com tokens dedicados que não invertem, e separadamente
reportou e corrigiu a mesma causa raiz no próprio `mind-landing` (commit
`37b9d49`) — ver `mind/tarefas/empresa/mindview.md`.

### Paleta de cores das tags — deliberadamente sem verde

O `DEFAULT_SETTINGS.tagColors` de `server/src/app/houseA.ts` é um conjunto
curado, inspirado em ANSI de terminal (vermelho, laranja, azul, roxo, rosa,
ciano/teal — nunca verde):

```
cafelabs: #3fb950 (este É verde — ver nota)   projetos:   #e0913a
tarefas:  #5b9eea                              dindin:     #a78bfa
mind:     #45b8c4                              design:     #e685b5
infra:    #e0913a                              legal:      #f0655c
lgpd:     #f0655c                              financeiro: #8a7226
marketing: #e685b5                             distribuicao: #e0913a
```

Verde fica reservado pra cor de destaque/sistema (botões, estados ativos, o
eventual hub do grafo) exatamente pra que uma pill de tag nunca seja
visualmente confundível com "isto é clicável/ativo." (O default de
`cafelabs` reaproveita o hex do verde como valor inicial nos defaults
enviados — toda cor de tag é editável pelo usuário em Ajustes, então isso
não é uma regra rígida imposta em código, só a intenção do conjunto de
defaults curado.)

### Contraste é reforçado, não só escolhido com cuidado

`web/src/lib/contrast.ts` implementa a fórmula real de luminância relativa
do WCAG 2.1 (não um stub) e `checkTagColorContrast` verifica toda cor de tag
contra `--fg` e `--bg` a 4.5:1. Esse guarda-corpo achou uma falha real
durante a revisão de design: a cor default da tag `financeiro`
(`#8a7226`, mostarda escuro) não bate 4.5:1 nem contra `--fg` nem contra
`--bg` em nenhum dos dois temas. A tela de Ajustes exibe uma sinalização
"contraste baixo" ao lado de qualquer cor de tag que falhe a checagem
(`SettingsScreen.tsx`), em vez de simplesmente enviar um default
inacessível silenciosamente.

## Tipografia

O mesmo sistema de três famílias do `mind-landing`, self-hosted via
`@fontsource/*` (sem dependência de CDN do Google Fonts em runtime):

| Papel | Fonte | Variável |
| --- | --- | --- |
| Display (headings) | Space Grotesk | `--font-display` |
| Corpo / UI | Inter | `--font-body` |
| Terminal, código, metadados | JetBrains Mono | `--font-mono` |

**O chrome de terminal e a UI do app (sidebar, navegação) nunca são
afetados pelos ajustes de tipografia de leitura** em Ajustes — eles sempre
renderizam em Inter/JetBrains Mono independente do que o usuário escolhe
pra fonte/tamanho/largura de coluna/espaçamento de linha do *conteúdo*
(`--read-font`, `--read-size`, `--read-col`, `--read-line-height` em
`tokens.css`, setados em runtime pelo `SettingsContext`). Essa separação é
intencional: customização pode mudar como a prosa é lida, nunca pode corroer
a identidade própria do chrome do app.

## O chrome de terminal: a assinatura do app

`web/src/components/TerminalChrome.tsx` — três pontos coloridos
(`#ff5f57`/`#febc2e`/`#28c840`, uma referência literal ao terminal do
macOS) mais uma string de caminho monoespaçada — renderiza no topo de
**todas** as telas (Leitor, Estante, Console, Grafo, Ajustes), não só o
Leitor. Isso foi confirmado na segunda rodada de design especificamente pra
tornar isso a assinatura visual persistente do app em vez de um detalhe do
modo leitura: `~/mind/console`, `~/mind/estante`, `~/mind/ajustes`, etc.,
sempre em `--font-mono`, sempre essas três cores exatas, independente de
tema ou customização do usuário.

## Capas de caderno

Capas de caderno do MVP são **flat, sem textura** — uma reação deliberada
ao skeuomorfismo de madeira/tecido do primeiro mockup rejeitado. Identidade
vem de **cor + glifo monoespaçado grande + lombada de 5px**, não de um
material renderizado. O conjunto curado de glifos (sem emoji) já vai no
MVP; upload de imagem pras capas é um item explícito de fase futura (ver
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#fora-de-escopo-nesta-versão)).

## Movimento

Sem biblioteca de animação dedicada — este app não tem nenhuma das
sequências de reveal/typewriter disparadas por scroll do `mind-landing`
(não há narrativa de marketing com scroll pra animar). Feedback de
interação (estados de hover/ativo, o modal do quick-switcher, arrastar e
soltar num caderno) usa transições CSS simples consistentes com o resto do
sistema de tokens; nada aqui lê `prefers-reduced-motion` ainda, diferente do
tratamento explícito que o `mind-landing` dá a isso — uma lacuna que vale a
pena fechar se alguma animação futura for adicionada, não uma decisão
tomada de propósito.
