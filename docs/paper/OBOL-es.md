# OBOL: el óbolo de Caronte para la ciencia

### Micropagos académicos verificables: pagarle al autor cuando una IA usa su trabajo, directo y on-chain en USDC de menos de un centavo

**Thiago**
[Afiliación — a completar]

**Preprint — junio 2026**
Construido para el Lepton Agents Hackathon (Canteen × Circle)

---

## Resumen

Leer un paper bajo candado cuesta alrededor de 40 dólares y el autor recibe cero. Sci-Hub "resolvió" ese problema pirateando: rompió el candado en lugar de arreglar el sistema. El micropago académico legítimo nunca existió, no por falta de voluntad sino porque un piso de comisión de tarjeta de cerca de 30 centavos volvía absurdo un pago de cinco centavos — la comisión era seis veces el pago. Este trabajo presenta **OBOL**, un agente de investigación construido para el Lepton Agents Hackathon (Canteen × Circle) sobre **Arc** de Circle — una Layer-1 anunciada para finanzas en stablecoin (anunciada ago-2025; testnet público oct-2025; mainnet beta planeada 2026) — donde las transferencias de menos de un centavo son viables. OBOL ataca la *causa* de Sci-Hub, no su método: cuando una IA usa un paper para responder, el autor de ese paper cobra un nanopago directo y verificable on-chain.

El sistema corre un loop lineal y determinístico — *retrieve → DECIDE → ask → guard → pay* — en el que un agente LLM, bajo un presupuesto duro por consulta, decide qué papers candidatos vale la pena pagar para citar; código determinístico hace cumplir el presupuesto, verifica cada cita como substring literal de la fuente, y paga. La atribución está anclada a spans literales del paper vía la Anthropic Citations API, re-verificados localmente. Reportamos los números de una demostración real sobre Arc testnet: la selección de pasajes baja los tokens de entrada de 80.6k a 14.1k (−82%) y el costo de inferencia un 78%, sin perder ni una cita verificada; con Haiku 4.5 el costo cae un 94% y el peaje del demo deja margen positivo. Mantenemos explícito el límite honesto del proyecto: OBOL prueba **atribución verificable**, no necesidad verificada — y la parte difícil, el onboarding de autores reales, es trabajo futuro, no un resultado. Todo corre sobre Arc **testnet**; el USDC no tiene valor económico real.

**Palabras clave:** micropagos, acceso abierto, atribución verificable, agentes LLM, generación aumentada por recuperación, x402, stablecoins, Circle Arc, EIP-3009, economía de la ciencia.

---

## 1. Introducción

El acceso a la literatura científica es un peaje. Leer un artículo bajo paywall cuesta del orden de 40 dólares por una sola lectura, y de ese dinero el autor — quien hizo el trabajo — no recibe nada. Sci-Hub se volvió la respuesta de facto de millones de investigadores porque resolvía el síntoma: el acceso, llegando a cubrir casi toda la literatura académica [1]. Pero lo resolvió pirateando. Rompió el candado en vez de reparar el sistema que lo hacía necesario. La pregunta que OBOL se hace no es "¿cómo accedo gratis?" sino "¿por qué el autor nunca cobró?".

La respuesta histórica es económica, no moral. El micropago académico — pagarle al autor cinco o diez centavos cada vez que su trabajo se usa — nunca existió porque la infraestructura de pago lo hacía imposible. Un piso de comisión de tarjeta de aproximadamente 30 centavos por transacción significa que un pago de cinco centavos paga seis veces su valor en comisión. No es solo un problema de tarifa nominal: Szabo [3] mostró que los micropagos cargan además un *costo mental de transacción* que vuelve poco práctica la decisión de pagar montos diminutos. No es que nadie haya querido pagarle al autor: es que el riel de pago volvía absurdo el intento. La desintermediación de pagos peer-to-peer abierta por Bitcoin [4] mostró un precedente: un protocolo puede reemplazar al intermediario que cobra peaje por mover valor. **Arc** de Circle — una Layer-1 anunciada para finanzas en stablecoin (anunciada ago-2025; testnet público oct-2025; mainnet beta planeada 2026) [13] — rompe ese piso. Sobre Arc, una transferencia de menos de un centavo es viable, y por primera vez el micropago académico deja de ser una contradicción técnica. (Aclaración: este trabajo corre sobre el **testnet** público de Arc; el USDC manejado no tiene valor económico real.)

Hay un segundo extractor, más nuevo. Una IA como Claude reproduce exactamente el modelo extractivo de la editorial: responde usando el conocimiento de papers cuyos autores nunca cobraron. La diferencia es solo quién extrae — ahora es la plataforma de IA en lugar de la editorial. OBOL toma esa observación literalmente: si una IA va a responder usando el trabajo de alguien, ese alguien debería cobrar por el uso. El nombre lo dice — el *óbolo* era la moneda mínima que se ponía con el muerto para pagarle a Caronte el cruce. OBOL es la moneda mínima que se le paga al autor por el cruce de su conocimiento a la respuesta de una IA. El proyecto se publica bajo licencia Apache-2.0.

**Contribuciones.** Este trabajo aporta:

- **Un mecanismo de micropago académico legal y verificable**: un loop lineal y auditable *retrieve → DECIDE → ask → guard → pay* que paga al autor on-chain exactamente cuando su texto literal sostuvo una respuesta generada por IA, con legalidad anclada 100% en la licencia y nunca en el pago.
- **Un núcleo agéntico de asignación bajo presupuesto**: el LLM decide, bajo un tope duro por consulta, qué papers vale la pena pagar para citar; código determinístico hace cumplir el presupuesto, verifica cada cita como substring literal y paga — una división estricta "el modelo razona, el código hace cumplir".
- **Una capa de atribución verificable con su límite honesto explícito**: anclaje a spans literales vía Anthropic Citations API, re-verificado localmente, presentado como *atribución, no necesidad* (confianza minimizada, no ausencia de confianza).
- **Ingeniería de costo para solvencia de micropagos**: cinco palancas que reducen los tokens de entrada un 82% y el costo de inferencia hasta un 94% sin degradar una sola cita verificada, con un análisis de economía unitaria de loop cerrado que muestra bajo qué configuraciones el servicio es rentable.

---

## 2. Antecedentes y trabajo relacionado

**Acceso abierto y Sci-Hub.** La prevalencia del acceso abierto (OA) creció hasta volver legalmente accesible una fracción sustancial de la literatura reciente [2], mientras que Sci-Hub demostró que es técnicamente posible cubrir casi toda la literatura — pero por la vía ilegal de romper el candado [1]. OBOL se sitúa del lado legal de esa frontera: usa exclusivamente contenido OA o copias auto-archivadas por el autor, y ataca la *causa económica* que hizo de Sci-Hub la respuesta de facto, no su método.

**El problema del micropago.** El obstáculo nunca fue la voluntad sino el costo. Szabo [3] caracterizó los micropagos no solo por su piso de comisión sino por su *costo mental de transacción*: la carga cognitiva de decidir, una y otra vez, si vale la pena pagar montos diminutos. Bitcoin [4] estableció el precedente de desintermediación —reemplazar por protocolo al intermediario que cobra peaje por mover valor— que hace conceptualmente posible un pago directo autor-a-pagador sin un tercero que imponga un piso de comisión.

**Recuperación y generación aumentada por recuperación.** OBOL recupera candidatos con BM25, el marco probabilístico de relevancia estándar [6], y genera la respuesta condicionada a los documentos recuperados, en la línea de la generación aumentada por recuperación (RAG) [5]. A diferencia de RAG genérico, OBOL exige que cada span citado sea substring literal de la fuente y ata ese span a un pago.

**Identidad de autor y metadata.** El pago necesita resolver de forma inequívoca quién es el autor. OBOL usa ORCID [8] como identificador persistente de investigador y OpenAlex [7] como índice abierto de obras, autores y venues para mapear cada paper a sus autores y, vía ORCID, a una billetera.

**Descubrimiento legal de OA.** Para pedidos fuera del corpus sembrado, OBOL consulta Unpaywall [9] —operado por OurResearch— para localizar una versión legal (OA o auto-archivada por el autor) a partir de un DOI, y se detiene si no existe.

**El riel de pago.** El peaje se cobra sobre x402 [11], un protocolo abierto de pagos sobre el código de estado HTTP 402 "Payment Required" reservado en RFC 9110 (§15.5.3). Las transferencias se autorizan off-chain mediante EIP-3009 *Transfer With Authorization* [10] y se liquidan vía Circle Gateway sobre Arc [13]. La atribución de spans literales se apoya en la Anthropic Citations API [12].

---

## 3. Visión general del sistema

OBOL no usa un framework de agentes. Es un **loop lineal** de cinco etapas, deliberadamente legible y auditable:

**retrieve → DECIDE → ask → guard → pay.**

1. **Pregunta.** Un investigador (o un agente cliente) hace una pregunta.
2. **retrieve.** Recuperación determinística BM25 [6] sobre un corpus de papers de **acceso abierto** devuelve cerca de 8 papers candidatos. Una compuerta de relevancia filtra antes de gastar: las preguntas fuera de tema, que dispersan términos comunes entre muchos papers sin concentrarse en ninguno, se responden con "el corpus no cubre esto" — cero tokens, cero gasto.
3. **DECIDE.** El núcleo agéntico (`agent/decide.ts`). Dado un presupuesto duro por consulta y el precio de citar a cada autor, el LLM razona sobre relevancia, redundancia y costo-beneficio, y elige qué candidatos vale la pena pagar para citar y cuáles descartar. Solo los papers financiados avanzan.
4. **ask.** La respuesta se genera con la **Anthropic Citations API** [12] (una llamada por consulta), que garantiza a nivel de API que cada span citado es un substring literal de la fuente — no alucinado.
5. **guard.** Código local determinístico (`agent/verify.ts`) re-verifica que cada span citado realmente sea substring del paper: match exacto, o un parcial de alta cobertura marcado como tal. Solo los spans que sobreviven disparan pago.
6. **pay.** Por cada paper cuyos spans sostienen la respuesta, un nanopago a la billetera del autor vía **x402 [11] / Circle Gateway [13]**, con recibo on-chain (`testnet.arcscan.app`). El `payTo` es dinámico: la billetera del autor.

### Modo agente: cerrando el loop

El mismo riel x402 [11], al revés, convierte a OBOL en un servicio que cobra y paga sin humanos en el medio. Es la fuente de ingreso:

1. Un agente cliente externo pega al endpoint de consulta de OBOL y recibe **402 Payment Required** — el peaje, en USDC.
2. Firma una autorización **EIP-3009** [10] y paga el peaje al tesoro de OBOL, on-chain, vía Circle Gateway.
3. Recién entonces OBOL corre el loop, y del mismo riel paga a cada autor citado.
4. El agente recibe la respuesta más el desglose del flujo de dinero, en la misma llamada.

Toda la cadena de valor liquida en stablecoin, máquina-a-máquina, sin intervención humana: **agente → OBOL → autores**. (Sobre Arc testnet; el USDC no tiene valor real.)

---

## 4. El núcleo agéntico: asignación bajo presupuesto

El momento verdaderamente agéntico del sistema es uno solo, y está aislado en `decide.ts`. Dado el conjunto de candidatos de BM25, un presupuesto duro por consulta, y el precio de citar a cada autor, el agente LLM razona y prioriza: ¿qué papers aportan algo nuevo y relevante a esta pregunta, y cuáles son redundantes o marginales? No tiene que gastar todo el presupuesto, y habitualmente no lo hace.

El principio de diseño es una división estricta de responsabilidades:

> **El LLM razona y prioriza; el código determinístico hace cumplir, verifica y paga.**

Todo lo que es verificable es código. La siguiente tabla muestra quién decide qué:

| Decisión | Quién | Frecuencia | Costo |
| --- | --- | --- | --- |
| **Asignación** — qué candidatos vale la pena pagar para citar, bajo presupuesto | **Agente LLM** (`decide.ts`) — *el momento agéntico* | 1 por consulta | inferencia |
| Cumplimiento del presupuesto (`enforceBudget`) — el tope que el LLM no puede exceder | Código determinístico | siempre | gratis |
| Redacción de la respuesta fundamentada + qué spans citar | LLM (Claude + Citations API) | 1 por consulta | inferencia |
| Recuperación (BM25), guardián de substring, firma de la atestación, pago, anclaje on-chain | Código determinístico | siempre | gratis |

El presupuesto es un tope que el LLM **no puede** exceder: lo hace cumplir `enforceBudget`, código, no confianza. Y la decisión del agente queda comprometida criptográficamente antes de que se mueva un solo centavo: el agente **firma** su decisión en una atestación de wallet (`attest`) emitida *antes* del pago, y cada pago lleva adjunta la atestación firmada de la cita que lo justificó. La cadena pago → cita → atestación firmada es auditable de punta a punta.

---

## 5. Atribución verificable — y el límite honesto

La afirmación que OBOL hace, y la que **no** hace, son igual de importantes.

La generación corre sobre la **Anthropic Citations API** [12]: a nivel de API, cada span citado es un substring literal de la fuente provista. Encima, el **guardián** local (`agent/verify.ts`) re-verifica de forma determinística que cada span sea efectivamente substring del paper — un match exacto, o un parcial de alta cobertura explícitamente marcado como tal. Solo los spans que sobreviven a esa verificación disparan un pago. El resultado es **atribución verificable**: la respuesta está anclada a texto literal del paper, y se le paga al autor exactamente cuando su texto sostuvo la respuesta.

El límite honesto, que es parte de la identidad del proyecto y no se suaviza: OBOL prueba **atribución**, no **necesidad**. Demuestra que la respuesta está anclada a spans literales del paper; **no** demuestra que el paper fuera estrictamente indispensable — el modelo podría haber sabido ese dato de todas formas. Es **confianza minimizada, no ausencia de confianza**. Nombrar ese límite con precisión es parte del diseño, no una nota al pie.

---

## 6. Legalidad: basada en licencia, no en pago

OBOL **no** es Sci-Hub con un wallet pegado encima. La distinción es estructural:

**La legalidad viene 100% de la licencia, nunca del pago.** El pago es una capa ética encima del acceso legal, jamás un permiso de acceso. OBOL solo usa contenido de acceso abierto (CC0 / CC-BY / CC-BY-SA) o la versión legalmente auto-archivada por el propio autor, verificada vía Unpaywall [9]. Nunca aloja, cachea ni desbloquea papers bajo candado; nunca scrapea sitios de editoriales; nunca usa credenciales o proxies institucionales; nunca elude DRM. Cuando no existe una versión legal, **para**.

### La compuerta legal fuera de corpus

Para un paper pedido por DOI que no está en el corpus sembrado, un segundo guardián (`agent/unpaywall.ts`) decide servir o parar:

- **Licencia abierta o copia auto-archivada por el autor** (vía Unpaywall [9]) → busca la versión legal, responde sobre ella, y paga al autor — **nunca a la editorial**.
- **Bajo candado, sin versión legal disponible** → **para**. No piratea. Punto.

La diferencia con Sci-Hub no es de grado sino de naturaleza: Sci-Hub rompe el candado [1]; OBOL respeta el candado y le paga al autor solo cuando la licencia ya permitía el acceso.

---

## 7. Ingeniería de costo: cinco palancas

Para que un servicio que paga a autores con micropagos sea solvente, el costo de inferencia tiene que ser tan chico como el pago. OBOL aplica cinco palancas, en orden de impacto.

- **Palanca 0 — la agéntica.** El presupuesto acota el **contexto**, no solo el gasto. Financiar un subconjunto de los 8 candidatos significa que solo los papers financiados llegan a la costosa llamada `ask`. La misma decisión que limita el pago limita el costo de contexto. *El control de costo se desprende de la agencia.*
- **Palanca 1 — la grande: selección de pasajes** (`selectPassages`, `web/server/loop.ts`). En lugar de mandar papers enteros, se envía la **cabecera** de cada paper financiado (título / abstract / intro) más las **ventanas** con mayor solapamiento de términos de la consulta, con un tope de presupuesto de caracteres. La Citations API igual cita substrings literales de exactamente lo que se le mandó, así que el guardián de substring no se ve afectado. Resultado: tokens de entrada de **80.6k → 14.1k (−82%)**, costo de inferencia **−78%**, guardián sigue en **9/9**.
- **Palanca 2 — selección de modelo** (Opus 4.8 / Sonnet 4.6 / Haiku 4.5), una perilla por consulta en UI y API. El guardián es idéntico sin importar el modelo, así que es una perilla pura de costo/calidad con riesgo de corrección cero. Haiku sobre contexto troceado ($0.0189) es cerca de **17× más barato** que el baseline ingenuo de Sonnet con papers enteros ($0.3255).
- **Palanca 3 — caching de prompt** (`cache_control` en bloques de documento; `computeUsage` cobra input fresco 1×, escrituras de cache 1.25×, lecturas de cache 0.1×). Nota honesta: el beneficio es situacional. Las preguntas idénticas repetidas ya están cortocircuitadas por un cache en memoria (→ $0); los aciertos entre consultas distintas solo ocurren cuando dos preguntas diferentes financian los mismos papers dentro de la ventana de 5 minutos. Está implementado correctamente, pero **no es la palanca dominante**.
- **Palanca 4 — la compuerta de relevancia** (rechazos gratis). Las preguntas fuera de tema nunca llegan al LLM: cero tokens, cero gasto, cero pagos.

---

## 8. Evaluación

**Setup experimental.** Evaluamos sobre una **única consulta fija** — *"Why do LLM agents fail on long-horizon tasks?"* — bajo **tres configuraciones**: (i) Sonnet 4.6 enviando papers enteros (baseline), (ii) Sonnet 4.6 con selección de pasajes, y (iii) Haiku 4.5 con selección de pasajes. El costo de inferencia reportado cuenta **ambas** llamadas al LLM por consulta: la de `decide` y la de respuesta. Las corridas se ejecutaron sobre **Arc testnet** (el USDC no tiene valor real). La métrica de corrección es la fracción de citas que sobreviven al guardián de substring (citas verificadas).

| Config | Tokens de entrada | Costo de inferencia | Citas verificadas | vs baseline |
| --- | --- | --- | --- | --- |
| Sonnet 4.6 · papers enteros (baseline) | 80,571 | $0.3255 | 9/9 | — |
| Sonnet 4.6 · selección de pasajes | 14,128 | $0.0711 | 9/9 | −78% |
| Haiku 4.5 · selección de pasajes | 12,202 | $0.0189 | 6/6 | −94% |

**Discusión.** La selección de pasajes baja los tokens de entrada de 80.6k a 14.1k (−82%) y el costo de inferencia un 78% sin perder ni una cita verificada (9/9 → 9/9). Cambiar a Haiku 4.5 lleva el costo a $0.0189, un 94% por debajo del baseline (cerca de 17× más barato), manteniendo el guardián en **100%** (6/6) en esa corrida. El guardián se mantiene al 100% en toda configuración: el contexto más barato no compró ni una cita alucinada. Esa es la propiedad clave — abaratar el contexto no degrada la corrección, porque la corrección la hace cumplir el código, no el modelo.

**Honestidad metodológica (obligatoria).** Esto es una **demostración de una sola consulta y una sola corrida por configuración**, no un benchmark controlado. No hay múltiples consultas, ni repeticiones, ni intervalos de confianza, ni un conjunto de evaluación independiente. Los números muestran que el sistema funciona de punta a punta y que las palancas de costo no rompen la corrección en este caso; **no** sustentan una afirmación estadística general de rendimiento. Un benchmark controlado es trabajo futuro.

---

## 9. Economía del loop cerrado

El modo agente cerró el loop y, al hacerlo, expuso la economía unitaria real. Por consulta, el flujo de dinero es:

> agente paga peaje → OBOL paga a los autores citados → OBOL se queda el resto, menos el costo de inferencia.

Los pagos a autores son **reales y on-chain** (Circle Gateway sobre Arc testnet [13]). La inferencia, en cambio, es un costo real que OBOL liquida **off-chain** con el proveedor del modelo — y vale decirlo sin vueltas: no se puede pagar a Anthropic en USDC sobre Arc. El peaje de break-even es entonces **inferencia + pagos a autores**.

- **Haiku:** $0.0189 (inferencia) + ~$0.002 (autores) ≈ **$0.021**. El peaje del demo, $0.03, es **rentable** — margen ≈ **+$0.01 por consulta**.
- **Sonnet:** $0.0711 + ~$0.003 ≈ **$0.074**. Necesita un peaje de ~$0.08; al peaje de $0.03 del demo, **Sonnet corre a pérdida, por diseño**.

El demo viene por default con **Haiku a $0.03 de peaje** → margen positivo. Pasar a Sonnet u Opus pone el margen en negativo: esa es la perilla de costo/calidad hecha explícita y honesta. El loop cerrado no es un detalle de demo; es lo que sacó a la luz que la economía cierra solo bajo ciertas configuraciones, y cuáles. (Todos los montos son sobre Arc testnet; el USDC no tiene valor económico real todavía.)

---

## 10. Implementación y estado

**Stack.** Agente en TypeScript, sin framework de agentes (loop lineal). Modelo: Claude vía la Anthropic Citations API [12], una llamada por consulta. Identidad: ORCID [8] + OpenAlex [7] mapean cada autor a una billetera (el autor reclama una billetera probando propiedad de su ORCID). Pagos: forkeado de `circlefin/arc-nanopayments` — autorizaciones EIP-3009 [10] off-chain, agrupadas y liquidadas por Circle Gateway [13], de modo que una cita cuesta menos gas que el propio pago. Frontend: React + Vite, pantalla dividida (respuesta con citas en línea a la izquierda, libro mayor de autores en vivo a la derecha; links al explorador y un leaderboard de más citados). Corpus: 150 papers de acceso abierto sembrados con 893 billeteras de autor de testnet para que el loop corra de punta a punta hoy.

**Herramientas de Circle usadas:** Nanopayments, Circle Gateway, x402, USDC, EIP-3009.

**Arc testnet:** chain ID `5042002`; RPC `https://rpc.testnet.arc.network`; USDC ERC-20 `0x3600000000000000000000000000000000000000`; Gateway Wallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`; explorador `https://testnet.arcscan.app`. Todo el sistema corre sobre Arc **testnet**; el USDC no tiene valor económico real.

**Estado — hecho:**

- Corpus + metadata ORCID.
- Recuperación determinística (BM25) + generación con Citations API + guardián de substring.
- UI de pantalla dividida.
- Riel de pago funcionando de punta a punta en Arc testnet: EIP-3009 → Circle Gateway verifica y liquida; nanopago real agente → autor.
- Cada cita verificada paga a su autor on-chain sobre el corpus de 150 papers.
- Compuerta Unpaywall fuera de corpus.
- Modo agente, loop cerrado.
- Modelo seleccionable por consulta.

**Estado — próximo (no hecho):**

- Flujo de reclamo ORCID, para que autores reales aten su propia billetera.
- Deploy en vivo.

---

## 11. Discusión / Visión: Bitcoin para investigadores

El norte de OBOL se entiende mejor con una analogía precisa. Bitcoin [4] sacó al banco como intermediario: un protocolo reemplazó a la institución que cobraba peaje por mover valor. OBOL aplica la misma idea a la ciencia — un protocolo reemplaza a la **editorial** como la entidad que decide quién accede, quién cobra, y cuánto vale tu trabajo.

La consecuencia más interesante es que la **reputación se vuelve endógena**. Cada cita verificada es un pago, y la suma de pagos a un autor es una medida de cuánto se usó realmente su trabajo: un registro on-chain de "tu conocimiento se usó y alguien pagó por usarlo", no un índice-H inflable con autocitas. El leaderboard de más citados ya existe en la UI.

El salto fuerte es la **investigación agéntica**. Cuando los agentes no solo consultan papers sino que producen resultados que otros agentes citan y pagan, la reputación deja de ser una lista y pasa a ser un **grafo de citas-con-dinero** entre agentes y autores. El norte no es "una revista mejor": es que la unidad de valor científico deje de ser el paper-en-una-revista y pase a ser la **contribución citada-y-pagada**, peer-to-peer, sin editorial.

El encuadre honesto importa tanto como la visión. Bitcoin no reemplazó a los bancos de la noche a la mañana; lo que hizo fue sacar la **necesidad de pedir permiso**. OBOL saca la necesidad de pedirle permiso a la revista. No sobreprometemos: nadie acá "mata a Elsevier". La parte difícil y lenta — el onboarding de autores reales — es trabajo futuro, no un resultado.

---

## 12. Amenazas a la validez / Limitaciones

- **Atribución, no necesidad.** OBOL prueba que la respuesta está anclada a spans literales del paper, no que el paper fuera indispensable. Confianza minimizada, no sin confianza.
- **Inferencia off-chain.** El costo de inferencia se liquida off-chain con el proveedor del modelo: no se puede pagar a Anthropic en USDC sobre Arc. La economía cierra solo bajo configuraciones donde inferencia + pagos a autores quedan por debajo del peaje (por default, Haiku a $0.03).
- **Evaluación de una sola consulta.** Los números provienen de una única consulta fija y una sola corrida por configuración. Es una demostración de funcionamiento de punta a punta, **no** un benchmark controlado: sin repeticiones, sin múltiples consultas, sin intervalos de confianza. No sustentan una afirmación estadística general.
- **Onboarding de autores reales (sin resolver).** El corpus corre hoy con billeteras de testnet sembradas. El flujo de reclamo ORCID — que un autor real ate su propia billetera probando propiedad de su ORCID — está diseñado pero **no implementado**. Es el cuello de botella real, lento y humano, hacia adopción, y trabajo futuro.
- **Caching situacional.** El caching de prompt está implementado correctamente pero su beneficio es situacional y no domina el costo.
- **Solo testnet.** Todo corre sobre Arc testnet; el USDC manejado no tiene valor económico real todavía. No se implica mainnet.
- **Tamaño del corpus.** 150 papers de acceso abierto. Escalar el corpus y la compuerta Unpaywall fuera de corpus es trabajo futuro.
- **Deploy en vivo.** Pendiente.

---

## 13. Conclusión

OBOL muestra que el micropago académico legítimo, históricamente bloqueado por el piso de comisión y el costo mental de transacción del riel de pago, vuelve a ser viable cuando las transferencias de menos de un centavo son posibles. El sistema paga al autor on-chain exactamente cuando su texto literal sostuvo una respuesta generada por IA, con legalidad anclada en la licencia y atribución verificada por código, no por confianza en el modelo. La ingeniería de costo reduce los tokens de entrada un 82% y el costo de inferencia hasta un 94% sin degradar una sola cita verificada, y el análisis de loop cerrado muestra bajo qué configuraciones el servicio es solvente. Mantenemos explícitos los límites: atribución y no necesidad, una sola consulta de demostración y no un benchmark, solo testnet, y un onboarding de autores reales que sigue sin resolver. Nada acá reemplaza a la editorial de un día para el otro; lo que OBOL ataca es la causa económica que volvió a Sci-Hub la respuesta de facto, y deja en pie un mecanismo legal y verificable sobre el cual construir.

---

## Referencias

[1] Himmelstein, D. S., Romero, A. R., Levernier, J. G., Munro, T. A., McLaughlin, S. R., Greshake Tzovaras, B., & Greene, C. S. (2018). "Sci-Hub provides access to nearly all scholarly literature." *eLife*, 7, e32822. https://doi.org/10.7554/eLife.32822

[2] Piwowar, H., Priem, J., Larivière, V., Alperin, J. P., Matthias, L., Norlander, B., Farley, A., West, J., & Haustein, S. (2018). "The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles." *PeerJ*, 6, e4375. https://doi.org/10.7717/peerj.4375

[3] Szabo, N. (~1999). "Micropayments and Mental Transaction Costs." *2nd Berlin Internet Economics Workshop*. https://nakamotoinstitute.org/library/micropayments-and-mental-transaction-costs/

[4] Nakamoto, S. (2008). "Bitcoin: A Peer-to-Peer Electronic Cash System." https://bitcoin.org/bitcoin.pdf

[5] Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks." *NeurIPS* 33, 9459–9474. arXiv:2005.11401

[6] Robertson, S., & Zaragoza, H. (2009). "The Probabilistic Relevance Framework: BM25 and Beyond." *Foundations and Trends in Information Retrieval*, 3(4), 333–389. https://doi.org/10.1561/1500000019

[7] Priem, J., Piwowar, H., & Orr, R. (2022). "OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts." arXiv:2205.01833

[8] ORCID — Open Researcher and Contributor ID. https://orcid.org/

[9] Unpaywall, operado por OurResearch. https://unpaywall.org/

[10] Kim, P. J., Britz, K., & Knott, D. (2020). "ERC-3009: Transfer With Authorization." *Ethereum Improvement Proposal*. https://eips.ethereum.org/EIPS/eip-3009

[11] Coinbase (2025). "x402: un protocolo de pagos abierto sobre HTTP 402." https://github.com/coinbase/x402 . (HTTP 402 "Payment Required" está reservado en RFC 9110, *HTTP Semantics*, §15.5.3.)

[12] Anthropic (2025). "Citations" (feature de la API de Claude). https://platform.claude.com/docs/en/build-with-claude/citations

[13] Circle (2025). "Arc — una blockchain Layer-1 abierta para finanzas en stablecoin." Anunciada ago-2025; testnet público 28-oct-2025; mainnet beta planeada 2026. https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance

---

*OBOL — licencia Apache-2.0. El óbolo: la moneda mínima para el cruce. Preprint — junio 2026, construido para el Lepton Agents Hackathon (Canteen × Circle). Todo el sistema corre sobre Arc testnet; el USDC no tiene valor económico real.*
