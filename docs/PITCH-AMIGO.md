# OBOL — pitch hablado (versión "explicáselo a un amigo")

Respuesta natural a *"¿qué es OBOL?"*, con las objeciones más comunes
("para eso uso Claude" / "nadie va a pagar 3 centavos") ya desactivadas adentro,
sin que se note que las estás respondiendo. Pensada para soltar en una charla.

---

Es un asistente de IA para investigación, tipo Claude, pero con dos diferencias que son justo el motivo por el que lo hice.

Arranco por el problema: cuando publicás un paper, la revista cobra 40 dólares por dejarlo leer y a vos, que lo escribiste, no te llega un centavo. Sci-Hub eso lo "arregló" pirateando. Y la IA, fijate, hace lo mismo pero peor: Claude te contesta de filosofía con conocimiento que sacó de papers que escribió alguien que nunca cobró ni cobra. Es el mismo modelo extractivo de la editorial, solo que ahora el que se queda con todo es la plataforma de IA. Entonces OBOL es la versión donde **cada vez que la IA usa un paper para responderte, el autor de ese paper cobra una moneda, automática, en el momento.** Se llama así por el óbolo, la moneda mínima que se le ponía al muerto para pagarle el cruce a Caronte.

Y la segunda diferencia es que **no te miente las citas.** Vos sabés que si a Claude le pedís "citame textual", a veces te inventa una frase que suena perfecta y no existe —y para nosotros eso es veneno, lo metés en la tesis y quedás expuesto. OBOL no te da la cita hasta que un control abrió el paper y verificó que la frase está ahí, palabra por palabra. Recién ahí, además, libera el pago al autor. O sea: desconfía de la IA a propósito y la obliga a probar lo que dice. Y todo sobre material legal, solo acceso abierto —si le pedís un paper bajo candado no lo rompe, se planta.

Ya sé lo que estás pensando: "¿y quién va a pagar por eso?". Y ojo, tenés razón en que un humano nunca va a pagar 3 centavos por pregunta —pensar si vale 3 centavos cuesta más que los 3 centavos. Pero el que paga no es una persona, es **otra máquina**: un agente de IA que ya hace miles de consultas y para el que 3 centavos es una línea de costo más, como la luz. Esa es la apuesta —el micropago nunca funcionó entre humanos, pero entre máquinas sí, y el mundo va justo para ahí, IAs pagándole a otras IAs solas.

Te soy honesto con lo que falta: lo que está probado es que el caño funciona, la plata fluye máquina → sistema → autor, verificada y en centésimos, algo que antes era imposible. Que se llene de autores reales cobrando es el trabajo lento que viene. Pero la pregunta de fondo, que te la dejo a vos que sabés de justicia distributiva, es: cuando las IAs se paguen entre sí por usar ciencia —y se van a pagar igual—, ¿querés que algo vuelva al que la escribió, o que se lo quede entero la plataforma?

---

## Versión de bolsillo (3-4 líneas, por si lo pregunta de pasada)

Es un asistente de IA para papers que, cada vez que usa un paper para responderte, **le paga al autor** una moneda directo a su billetera —con un control que verifica que la cita sea **textual y real, no inventada**, y usando **solo** material legal. Ataca la causa de Sci-Hub (que al autor nunca le llega nada) sin usar su método (piratear). El que paga el micropago no sos vos: es la otra IA que ya te reemplazó en buscar el paper.

---

## Munición extra para objeciones puntuales

**"Para eso uso Claude y listo."**
Cuando usás Claude pasan las dos cosas que esto arregla: (1) usó el trabajo de esos autores y no les pagó nada —mismo modelo extractivo que la editorial; (2) te inventa las citas y nadie lo verifica. OBOL es Claude obligado a citar de verdad, sobre material legal, y a pagarle al autor que usó.

**"Nadie va a pagar 3 centavos por pregunta."**
Cierto para un humano (costo mental de la transacción > los 3 centavos; por eso fracasaron todos los micropagos de los '90). Falso para una máquina: un agente sin fricción psicológica, que ya gasta en cómputo, para el que 3 centavos es una línea de costo más. El micropago no funciona entre humanos pero sí entre máquinas.

**Límite honesto (decirlo antes de que lo encuentren).**
Prueba **atribución, no necesidad**: demuestra que la respuesta está anclada a spans literales del paper, no que el paper fuera imprescindible (el modelo quizás ya lo sabía). Es trust-minimized, no trustless. Nombrar el límite es parte del diseño.

---

## Norte / visión (cuando te tiran "¿y esto a dónde escala?")

La analogía: **Bitcoin para investigadores.** Bitcoin no fue "plata digital", fue
*sacar al banco del medio* —un protocolo reemplazó a la institución que cobraba peaje por
mover valor. Esto es lo mismo aplicado a la ciencia: **un protocolo reemplaza a la editorial**
como el que decide quién accede, quién cobra y cuánto vale tu trabajo.

Lo lindo es que en OBOL la **reputación ya es endógena al sistema**: cada cita verificada es un
pago, y la suma de pagos a un autor *es* una métrica de cuánto se usó realmente su trabajo —no
un índice-H inflable con autocitas, sino un registro on-chain de "tu conocimiento se usó y
alguien pagó por usarlo". Eso ya existe embrionario: el corpus tiene un *most-cited
leaderboard*. La reputación-por-uso es un subproducto del caño, no ciencia ficción.

El salto fuerte es la **investigación agéntica**: el día que los agentes no solo *consultan*
papers sino que *producen* resultados que otros agentes citan y pagan, la reputación deja de
ser de revistas y pasa a ser un grafo de citas-con-plata entre agentes y autores. El norte no es
"una revista mejor", es **que la unidad de valor científico deje de ser el paper en una revista
y pase a ser la contribución citada y pagada, peer-to-peer, sin editorial.**

**Decirlo en capas (para no sobreprometer y que no te coman):**

> **Hoy:** el caño funciona —cita verificada dispara pago real al autor, on-chain.
> **El norte:** que esa cita-pagada se vuelva la unidad de reputación científica, y que la
> ciencia se organice peer-to-peer entre agentes y autores, sin editorial en el medio. Bitcoin
> no reemplazó al banco de un día para otro; sacó la necesidad de pedirle permiso. Esto saca la
> necesidad de pedirle permiso a la revista.

La frase llave es **"sacar la necesidad de pedir permiso"**: une el hoy y el norte sin tener
que prometer que las revistas mueren mañana. Cuidado con el "matamos a Elsevier" —el escéptico
te pide los autores y no están todavía. "Construimos el riel y acá está funcionando con plata
de verdad" es imbatible, porque eso sí lo tenés.
