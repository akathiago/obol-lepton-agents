# DISTANCIAL — qué nos separa del resto

> Lo que hace a OBOL distinto de las otras submissions del Lepton Agents Hackathon.
> Una sola idea, dicha fuerte: **otros agentes pagan por output que el LLM inventó;
> OBOL solo paga por spans verificados en código.**

---

## La frase para el pitch

> "La mayoría de los agentes de pago confían en que el LLM hizo bien su trabajo y
> mueven plata sobre esa confianza. OBOL no confía en el LLM: **verifica en código
> local que cada cita es un substring literal del paper antes de que se mueva un
> centavo.** La verificación es determinística, no probabilística."

---

## El contraste, concreto

| | Patrón típico de la competencia | OBOL |
|---|---|---|
| **Qué dispara el pago** | El LLM *afirma* algo (un finding, un score de confianza) | Un span que **pasó el substring guard** (`agent/verify.ts`) |
| **Quién decide que es válido** | El propio LLM (juez y parte) | Código determinístico, fuera del LLM |
| **Confianza requerida** | Hay que creerle al modelo | Verificable: el span está, o no está, en el paper |
| **Modo de falla** | Alucina un resultado y igual cobra | Si no matchea, no se paga. Punto. |

### Caso testigo: BugBountyAI

Submission real y completa (Next.js + Circle user-controlled wallets + Supabase).
Pero su agente **fabrica los findings**: el system prompt le pide al LLM que
"varíe severity y confidence de forma realista". O sea, los bugs y sus scores de
confianza son **alucinados** — no hay ninguna verificación de que el bug exista.
Pagan por output no verificado.

Ese es exactamente el problema que OBOL resuelve. No es una crítica al equipo —
es la línea divisoria de la categoría entera.

---

## Por qué importa (la tesis)

El hackathon es sobre **agentes que pagan**. La pregunta que define al ganador no
es "¿el agente paga?" — casi todos lo hacen. Es:

> **¿Por qué deberíamos confiar en el pago que el agente hizo?**

OBOL es el único que responde eso con **código, no con confianza**:

1. **Retrieve** — BM25, determinístico.
2. **Decide** — el LLM prioriza bajo un presupuesto duro (acá razona el agente).
3. **Ask** — Anthropic Citations API: cada span citado es un substring literal de la fuente *a nivel de API*.
4. **Guard** — `agent/verify.ts` **re-verifica en código local** que el span está en el paper. Solo los que sobreviven pueden disparar pago.
5. **Pay** — nanopago al autor, con la atestación firmada de la decisión que lo justificó.

**Todo lo verificable es código** — el cap del presupuesto, el substring guard, la
firma. El LLM razona y prioriza; el código verifica y paga.

---

## El límite honesto (que también nos distancia)

OBOL prueba **atribución verificable** (la respuesta está anclada a spans literales
del paper), **no necesidad verificada** (que el paper haya sido indispensable; el
modelo podría haberlo sabido igual). Es trust-minimized, no trustless.

Decir esto en voz alta es parte del diseño — y es otra cosa que la competencia no
hace. Mientras otros inflan claims, nosotros nombramos el límite. Eso construye
más confianza que cualquier demo pulido.

---

## Cómo usar esto en el demo (30 segundos)

1. Mostrá una respuesta con una cita anclada a su span literal.
2. Decí: *"esto no es el LLM diciéndome que confíe — el guard verificó que este
   texto exacto está en el paper. Si no estuviera, el autor no cobra."*
3. Señalá el ledger: *"y por eso, este USDC que está cayendo en el wallet del autor
   está respaldado por una verificación de código, no por la palabra de un modelo."*

La distancia con el resto no es el rail de pago (Circle lo da hecho). Es **qué tiene
que ser verdad antes de que el rail se active.**
