// Temario del bloque Estudio: la parte técnica de la guía «Plan de crecimiento y guía técnica» (27-10-2026).
// Cada lección = definición en una frase + explicación + analogía + dónde la usa él + flujo para la vista gráfica.
// Sin datos de clientes: los ejemplos hablan de «el chatbot de la tienda», «el ERP», «el bot», nunca de empresas.

export interface Leccion {
  id: string;
  tema: string;
  titulo: string;
  frase: string; // definición en una línea
  explicacion: string;
  analogia: string;
  enTusApps: string;
  paraCliente: string; // cómo decirlo en una reunión
  flujo: string[]; // pasos para la vista gráfica
  relacionadas: string[]; // ids
  fuentes?: string[]; // enlaces de donde sale (lecciones creadas con «Ampliar»)
}

export const TEMAS = ["Cómo piensa la IA", "Buscar con IA (RAG)", "Agentes", "Cómo están hechas tus apps", "Seguridad y ley", "Negocio"] as const;

export const TEMARIO: Leccion[] = [
  // ── Cómo piensa la IA ──
  {
    id: "llm", tema: "Cómo piensa la IA", titulo: "LLM (modelo de lenguaje)",
    frase: "Un programa entrenado con muchísimo texto que predice la siguiente palabra más probable.",
    explicacion: "No «sabe» cosas como una base de datos: ha aprendido patrones del lenguaje. Por eso escribe muy bien, razona bastante bien y, si no tiene el dato delante, puede rellenar el hueco con algo que suena bien aunque sea falso.",
    analogia: "Un becario brillante que ha leído media biblioteca pero no ha visto tus archivos: escribe de maravilla, pero si no le das tus datos, se los imagina.",
    enTusApps: "GPT-5 en el bot, en el ERP (El Maikel) y en el chatbot de la tienda; Claude en Claude Code.",
    paraCliente: "«Es un modelo que entiende y escribe texto; nosotros le damos tus datos para que no se invente nada.»",
    flujo: ["Tu texto (prompt)", "Se trocea en tokens", "El modelo predice token a token", "Respuesta"],
    relacionadas: ["tokens", "alucinacion", "prompt"],
  },
  {
    id: "tokens", tema: "Cómo piensa la IA", titulo: "Tokens y ventana de contexto",
    frase: "Un token es un trozo de palabra (unos 4 caracteres); la ventana de contexto es cuántos caben de una vez.",
    explicacion: "Los modelos no leen letras ni palabras, leen tokens. Se paga por tokens de entrada (lo que le mandas) y de salida (lo que responde). La ventana de contexto es su memoria de trabajo: todo lo que no quepa ahí, para el modelo no existe.",
    analogia: "La mesa de trabajo: solo puede mirar los papeles que caben encima. Si la conversación es muy larga, los primeros papeles se caen al suelo.",
    enTusApps: "El coste de OpenAI que se agotó una vez; por eso el chatbot manda solo los productos relevantes y no el catálogo entero.",
    paraCliente: "«El coste de la IA va por volumen de texto; en una pyme suelen ser pocos euros al mes.»",
    flujo: ["Prompt de sistema", "Historial", "Datos buscados", "Pregunta", "Todo cabe en la ventana"],
    relacionadas: ["llm", "rag"],
  },
  {
    id: "prompt", tema: "Cómo piensa la IA", titulo: "Prompt, prompt de sistema y few-shot",
    frase: "El prompt son las instrucciones; el de sistema son las reglas fijas; few-shot es dar ejemplos para que imite el formato.",
    explicacion: "El prompt de sistema va delante de cada conversación y marca el carácter y los límites («nunca mandes correos», «precios solo de la tienda»). Few-shot significa poner 2 o 3 ejemplos de entrada y salida para que copie el estilo. La temperatura controla cuánto se arriesga: baja para datos, más alta para textos creativos.",
    analogia: "El manual de bienvenida de un empleado nuevo (sistema), la tarea del día (prompt) y dos trabajos bien hechos para que vea cómo se hace (few-shot).",
    enTusApps: "Las reglas del multiagente de Juanky, las de El Maikel y los comentarios de Instagram con ejemplos.",
    paraCliente: "«Le damos unas normas de la casa que no se salta, igual que a un empleado.»",
    flujo: ["Reglas fijas (sistema)", "Ejemplos (few-shot)", "Pregunta del usuario", "Respuesta con ese estilo"],
    relacionadas: ["llm", "guardrails"],
  },
  {
    id: "alucinacion", tema: "Cómo piensa la IA", titulo: "Alucinación",
    frase: "Cuando el modelo se inventa un dato con total seguridad.",
    explicacion: "Pasa porque el modelo siempre intenta dar la respuesta más probable, aunque no tenga el dato. Se combate dándole la información real (RAG), pidiéndole que diga «no lo sé», obligándole a citar la fuente y comprobando los números con código, no con la IA.",
    analogia: "El cuñado que nunca dice «no lo sé».",
    enTusApps: "Por eso el precio del chatbot sale de la tabla de la tienda y no del modelo, y la agenda del parte la monta el código y no la IA.",
    paraCliente: "«No responde de memoria: consulta tus datos reales y, si no lo encuentra, lo dice.»",
    flujo: ["Pregunta sin datos", "El modelo rellena el hueco", "Dato inventado", "Solución: darle la fuente"],
    relacionadas: ["rag", "evals"],
  },
  {
    id: "multimodal", tema: "Cómo piensa la IA", titulo: "Multimodal y OCR",
    frase: "Multimodal = entiende imágenes, audio y texto; OCR = sacar el texto de una imagen.",
    explicacion: "Los modelos multimodales miran una foto de un ticket o un plano y entienden qué es cada cosa, no solo las letras. El OCR clásico solo lee letras; la IA multimodal además entiende que «Total» es el importe a pagar. Se combina con salida estructurada para que devuelva campos fijos.",
    analogia: "OCR es alguien que copia letra a letra sin entender; multimodal es un administrativo que mira la factura y sabe dónde está cada dato.",
    enTusApps: "Facturas por foto en Juanky, gastos por foto en el ERP, presupuesto desde plano y Refuerzo Educativo.",
    paraCliente: "«Haces una foto y el programa sabe qué es cada dato y dónde va.»",
    flujo: ["Foto o PDF", "Modelo multimodal", "JSON con los campos", "Tu programa lo guarda"],
    relacionadas: ["json", "llm"],
  },
  // ── RAG ──
  {
    id: "embeddings", tema: "Buscar con IA (RAG)", titulo: "Embeddings y búsqueda semántica",
    frase: "Convertir un texto en una lista de números que representa su significado, para buscar por sentido y no por palabras.",
    explicacion: "Dos frases que dicen lo mismo con palabras distintas acaban con números parecidos. Así «tornillo largo de métrica 12» encuentra «perno M12x100». Esos números se guardan en una base de datos vectorial (por ejemplo pgvector dentro de Postgres) que busca los más cercanos en milisegundos.",
    analogia: "Un mapa donde cada frase es un punto: las que significan lo mismo están en el mismo barrio.",
    enTusApps: "Base de los buscadores con significado (catálogos, FundaLex). La búsqueda fuzzy de Compras Vidal es otra cosa: tolera faltas de ortografía, no entiende significado.",
    paraCliente: "«Tus clientes buscan como hablan y el sistema encuentra la referencia aunque no usen el nombre exacto.»",
    flujo: ["Texto", "Modelo de embeddings", "Vector (números)", "Base vectorial", "Los más parecidos"],
    relacionadas: ["rag", "chunking"],
  },
  {
    id: "rag", tema: "Buscar con IA (RAG)", titulo: "RAG",
    frase: "Antes de responder, buscar la información relevante y dársela al modelo.",
    explicacion: "Retrieval-Augmented Generation: recuperar y luego generar. El usuario pregunta, el sistema busca en tus documentos o catálogo los trozos útiles, los mete en el prompt y el modelo responde usando SOLO eso. Es la forma estándar de que la IA hable de tu empresa sin reentrenarla.",
    analogia: "Un examen a libro abierto: el alumno no se lo sabe de memoria, pero busca la página correcta antes de contestar.",
    enTusApps: "El chatbot de la tienda (busca productos y precios reales antes de responder) y FundaLex (busca resoluciones antes de contestar).",
    paraCliente: "«Antes de contestar, consulta tu catálogo y tus documentos; por eso no se inventa nada.»",
    flujo: ["Pregunta", "Buscar en tus datos", "Trozos relevantes", "Modelo + trozos", "Respuesta con fuente"],
    relacionadas: ["embeddings", "chunking", "finetuning"],
  },
  {
    id: "chunking", tema: "Buscar con IA (RAG)", titulo: "Chunking",
    frase: "Trocear documentos largos en fragmentos para poder indexarlos y buscarlos.",
    explicacion: "Un manual de 200 páginas no cabe ni conviene mandarlo entero. Se corta en trozos (por ejemplo de 500 a 1.000 tokens, a veces solapados) y cada trozo se convierte en embedding. Trozos demasiado grandes mezclan temas; demasiado pequeños pierden contexto.",
    analogia: "Partir un libro en fichas temáticas para encontrar rápido la que necesitas.",
    enTusApps: "Lo que harías en el «buscador interno de tu empresa» con manuales y fichas técnicas.",
    paraCliente: "«Organizamos tus manuales en fichas para que encuentre la respuesta exacta.»",
    flujo: ["Documento largo", "Cortar en trozos", "Embedding de cada trozo", "Índice listo para buscar"],
    relacionadas: ["embeddings", "rag"],
  },
  {
    id: "finetuning", tema: "Buscar con IA (RAG)", titulo: "Fine-tuning (y por qué casi nunca hace falta)",
    frase: "Reentrenar un modelo con tus ejemplos para cambiar su forma de responder.",
    explicacion: "El fine-tuning enseña ESTILO o FORMATO, no hechos que cambian. Para que conozca tus precios o tu catálogo es mejor RAG: se actualiza al momento y cita la fuente. Fine-tuning compensa con mucho volumen y una tarea muy repetitiva.",
    analogia: "Fine-tuning es mandar al empleado a un curso; RAG es darle acceso al archivo. Para saber el precio de hoy, mejor el archivo.",
    enTusApps: "No lo usas, y es correcto: todo tu conocimiento de empresa va por RAG o por consultas a la base de datos.",
    paraCliente: "«No hace falta entrenar una IA propia: conectamos la IA a tus datos, que es más barato y siempre está al día.»",
    flujo: ["¿Hechos que cambian?", "Sí → RAG", "¿Estilo fijo y mucho volumen?", "Sí → fine-tuning"],
    relacionadas: ["rag"],
  },
  // ── Agentes ──
  {
    id: "tools", tema: "Agentes", titulo: "Tool calling (llamada a funciones)",
    frase: "El modelo no hace la acción: pide que tu código ejecute una función con unos parámetros.",
    explicacion: "Le describes al modelo qué funciones existen (añadir al carrito, guardar gasto, buscar en agenda). Cuando hace falta, responde con «llama a guardarGasto con importe 23,50». Tu código lo ejecuta, le devuelve el resultado y el modelo sigue. El control lo tiene siempre tu código.",
    analogia: "Un jefe que da órdenes por escrito: el modelo escribe la orden, tu sistema la cumple.",
    enTusApps: "Las tools del multiagente de Juanky (Ingresos, Gastos, Buscar todo…), el carrito del chatbot y las acciones de El Maikel.",
    paraCliente: "«La IA propone la acción y el programa la ejecuta con tus reglas.»",
    flujo: ["Pregunta", "Modelo elige herramienta", "Tu código la ejecuta", "Resultado al modelo", "Respuesta final"],
    relacionadas: ["agente", "hitl", "json"],
  },
  {
    id: "agente", tema: "Agentes", titulo: "Agente y multiagente",
    frase: "Un agente es una IA que decide pasos y usa herramientas en bucle hasta cumplir un objetivo; multiagente son varios especialistas coordinados.",
    explicacion: "Un chatbot responde; un agente actúa: piensa qué hacer, usa una herramienta, mira el resultado y decide el siguiente paso. En un sistema multiagente un orquestador (router) reparte el trabajo entre agentes especializados, cada uno con sus herramientas y su prompt.",
    analogia: "Un encargado de taller (orquestador) que reparte cada trabajo al operario que sabe hacerlo.",
    enTusApps: "Juanky es multiagente: el router manda gastos, vinos, facturas o visitas a su especialista.",
    paraCliente: "«No solo contesta: hace tareas completas, como dar de alta un pedido, siguiendo tus reglas.»",
    flujo: ["Objetivo", "Pensar", "Usar herramienta", "Mirar resultado", "¿Hecho? Si no, repetir"],
    relacionadas: ["tools", "mcp", "hitl"],
  },
  {
    id: "mcp", tema: "Agentes", titulo: "MCP (Model Context Protocol)",
    frase: "Un estándar para conectar una IA a herramientas y datos externos, como un enchufe universal.",
    explicacion: "Antes, cada conexión entre una IA y un programa (GitHub, Gmail, una base de datos) se hacía a mano. Con MCP, el programa publica un «servidor MCP» con sus herramientas y cualquier IA compatible las puede usar. Es uno de los términos más de moda.",
    analogia: "El USB de la IA: un mismo conector para muchos aparatos.",
    enTusApps: "Claude Code usa servidores MCP de GitHub, n8n, Vercel y Gmail para trabajar en tus proyectos.",
    paraCliente: "«Conectamos la IA a tus programas por un estándar abierto, sin depender de un solo proveedor.»",
    flujo: ["IA (cliente MCP)", "Servidor MCP", "Herramientas del programa", "Datos o acciones"],
    relacionadas: ["tools", "agente", "api"],
  },
  {
    id: "hitl", tema: "Agentes", titulo: "Human-in-the-loop y guardrails",
    frase: "Una persona aprueba antes de que la IA actúe (human-in-the-loop); los guardrails son límites que no puede saltarse.",
    explicacion: "Para acciones con consecuencias (enviar, borrar, pagar) la IA propone y una persona confirma. Los guardrails son reglas en el código o en el prompt que bloquean lo peligroso: no mandar correos, no tocar precios, no hablar de ciertos temas.",
    analogia: "El becario prepara el correo, el jefe le da a enviar. Y hay cosas que el becario no puede hacer nunca.",
    enTusApps: "Acciones confirmables de El Maikel, botones ✅ de los borradores de factura en Juanky y «el chat nunca manda correos».",
    paraCliente: "«Nada se envía ni se borra sin tu visto bueno.»",
    flujo: ["IA propone", "Comprobación de reglas", "Persona confirma", "Se ejecuta"],
    relacionadas: ["agente", "prompt"],
  },
  {
    id: "json", tema: "Agentes", titulo: "Salida estructurada (JSON)",
    frase: "Obligar al modelo a responder con un formato fijo que tu código puede leer sin errores.",
    explicacion: "En vez de texto libre, el modelo devuelve campos concretos (proveedor, fecha, total) en JSON, a veces con un esquema que lo obliga. Así el resultado entra directo en una base de datos o en una hoja.",
    analogia: "Un formulario con casillas en vez de una carta: no hay que interpretar nada.",
    enTusApps: "Lectura de facturas, presupuesto desde plano y las visitas de Juanky (json_schema).",
    paraCliente: "«La IA rellena los campos de tu programa directamente.»",
    flujo: ["Documento o pregunta", "Modelo con esquema", "JSON con campos", "Base de datos"],
    relacionadas: ["multimodal", "tools"],
  },
  {
    id: "evals", tema: "Agentes", titulo: "Evals (baterías de pruebas)",
    frase: "Un conjunto de preguntas con su respuesta correcta para medir si la IA funciona bien.",
    explicacion: "Como la IA no responde siempre igual, no basta con probar una vez. Se prepara una batería (por ejemplo 50 preguntas reales) y se mide cuántas acierta antes y después de cada cambio. Así sabes si una mejora mejora de verdad.",
    analogia: "El examen que repites cada vez que cambias el temario.",
    enTusApps: "La auditoría del chatbot de la tienda que comparó precios con la tabla real.",
    paraCliente: "«Antes de entregarlo lo sometemos a una batería de preguntas reales y medimos los aciertos.»",
    flujo: ["Preguntas reales", "Respuestas correctas", "Pasar la IA", "% de aciertos", "Mejorar y repetir"],
    relacionadas: ["alucinacion"],
  },
  // ── Cómo están hechas tus apps ──
  {
    id: "capas", tema: "Cómo están hechas tus apps", titulo: "Las 5 capas de una app",
    frase: "Pantalla (frontend), servidor (backend), base de datos, IA y automatización.",
    explicacion: "El frontend es lo que se ve (Next.js y React). El backend son las rutas /api que corren en el servidor y guardan las claves. La base de datos (Postgres en Supabase o Neon) recuerda. La IA razona. La automatización (n8n) conecta servicios por webhooks y horarios. La pantalla nunca habla directamente con la IA: todo pasa por el backend.",
    analogia: "Un restaurante: la sala (frontend), la cocina (backend), la despensa (base de datos), el chef estrella (IA) y el repartidor (automatización).",
    enTusApps: "Todas: el ERP, el chatbot, la app de Juanky, el panel SEO.",
    paraCliente: "«Tu equipo usa una pantalla sencilla; por detrás, el servidor guarda los datos seguros y usa la IA solo donde aporta.»",
    flujo: ["Frontend", "Backend /api", "Base de datos + IA", "Automatización n8n"],
    relacionadas: ["api", "serverless", "rls"],
  },
  {
    id: "api", tema: "Cómo están hechas tus apps", titulo: "API, endpoint, REST, JSON y webhook",
    frase: "Una API es la puerta para que un programa hable con otro; un webhook es cuando el otro te avisa a ti.",
    explicacion: "Cada URL de una API es un endpoint (por ejemplo /api/auditoria). REST es la forma estándar de pedir cosas por HTTP (GET leer, POST crear…) y JSON el formato de los datos. Con un webhook es al revés: das una URL y el servicio la llama cuando pasa algo, como Telegram cuando le escribes al bot.",
    analogia: "API = tú llamas a la tienda para preguntar; webhook = la tienda te llama cuando llega tu pedido.",
    enTusApps: "Telegram → webhook de n8n; el PUENTE con x-app-key; la API de Instagram para publicar reels.",
    paraCliente: "«Si tu programa tiene API, lo conectamos directamente; si no, valoramos cómo adaptarlo.»",
    flujo: ["Programa A", "Petición HTTP (JSON)", "Endpoint de B", "Respuesta JSON"],
    relacionadas: ["capas", "mcp"],
  },
  {
    id: "serverless", tema: "Cómo están hechas tus apps", titulo: "Serverless, variables de entorno y CI/CD",
    frase: "Serverless = código que se enciende solo cuando lo llaman; variables de entorno = claves fuera del código; CI/CD = publicar solo al hacer push.",
    explicacion: "En Vercel no gestionas un servidor: cada ruta /api se ejecuta al recibir una petición y se apaga después (pagas por uso). Las claves (OPENAI_API_KEY…) viven en variables de entorno, nunca en el código ni en el navegador. Con CI/CD, cada push a GitHub construye y publica la app.",
    analogia: "Un taxi en vez de un coche propio: lo usas cuando lo necesitas y no te ocupas del mantenimiento.",
    enTusApps: "Todas tus apps en Vercel; push a main = producción en el ERP del taller y en esta app.",
    paraCliente: "«Está alojado en servidores profesionales que escalan solos; tú no mantienes nada.»",
    flujo: ["Push a GitHub", "Vercel construye", "Despliegue", "Funciones se encienden al llamarlas"],
    relacionadas: ["capas"],
  },
  {
    id: "rls", tema: "Cómo están hechas tus apps", titulo: "Multi-tenant y RLS",
    frase: "Multi-tenant = varias empresas en la misma app; RLS = reglas dentro de la base de datos que impiden ver filas de otra empresa.",
    explicacion: "Cada fila lleva su empresa_id. Row Level Security es una regla de Postgres que filtra siempre por el usuario conectado, aunque el código tenga un fallo. La clave anon va al navegador y respeta RLS; la service_role se la salta y solo puede vivir en el servidor.",
    analogia: "Un edificio de oficinas: el portal es común, pero cada llave abre solo su oficina.",
    enTusApps: "El ERP multiempresa (y el pendiente de cerrar el acceso anon en el ERP del taller).",
    paraCliente: "«Tus datos están separados de los de cualquier otra empresa a nivel de base de datos.»",
    flujo: ["Usuario inicia sesión", "Petición con su identidad", "Postgres aplica RLS", "Solo sus filas"],
    relacionadas: ["capas", "auth"],
  },
  {
    id: "auth", tema: "Seguridad y ley", titulo: "Autenticación vs autorización",
    frase: "Autenticación = quién eres (login); autorización = qué puedes hacer (permisos).",
    explicacion: "Primero se comprueba la identidad (contraseña, enlace mágico, cabecera secreta). Después se decide qué puede ver o tocar (roles, RLS). Una API key en una cabecera, como x-app-key, es autenticación entre programas.",
    analogia: "El DNI en la entrada (autenticación) y la pulsera VIP que dice a qué zonas puedes pasar (autorización).",
    enTusApps: "Login con APP_PASSWORD de esta app, x-app-key del PUENTE, roles del ERP.",
    paraCliente: "«Cada usuario entra con su acceso y solo ve lo que le toca.»",
    flujo: ["¿Quién eres? (login)", "Identidad verificada", "¿Qué puedes hacer? (permisos)", "Acceso concedido o denegado"],
    relacionadas: ["rls"],
  },
  {
    id: "ley", tema: "Seguridad y ley", titulo: "RGPD y AI Act",
    frase: "RGPD protege los datos personales; el AI Act europeo regula la IA por niveles de riesgo y obliga a avisar cuando hablas con una IA.",
    explicacion: "Con el RGPD: datos mínimos, finalidad clara, servidores en la UE cuando se puede y derecho a borrar. Con el AI Act: los chatbots y asistentes de voz deben decir que son IA, el contenido generado (como voces sintéticas) debe identificarse, y los usos de alto riesgo (selección de personal, crédito…) tienen obligaciones fuertes.",
    analogia: "El RGPD es el candado de los datos; el AI Act es la etiqueta obligatoria en el producto.",
    enTusApps: "Avisos del chatbot, etiqueta de IA en los reels con voz sintética, datos en Neon en Fráncfort.",
    paraCliente: "«Cumple el RGPD y el usuario sabe siempre que habla con un asistente de IA, como exige la normativa europea.»",
    flujo: ["¿Datos personales?", "RGPD: mínimo, UE, borrado", "¿Persona habla con IA?", "AI Act: avisarlo"],
    relacionadas: ["auth"],
  },
  // ── Negocio ──
  {
    id: "saas", tema: "Negocio", titulo: "SaaS, MRR y cuota mensual",
    frase: "SaaS = software que se alquila por suscripción; MRR = ingresos recurrentes de cada mes.",
    explicacion: "El valor de un negocio de software está en lo recurrente: 20 clientes a 69 €/mes son 1.380 € de MRR que llegan cada mes sin vender de nuevo. Por eso cada producto debería llevar cuota (mantenimiento, consumo de IA, mejoras) además del montaje.",
    analogia: "Un alquiler en vez de una venta: menos de golpe, pero cada mes.",
    enTusApps: "IndunexIA Gestión (planes 59/69/89 €/mes), cuotas de asistentes y automatizaciones.",
    paraCliente: "«La cuota incluye servidores, consumo de IA, copias de seguridad, actualizaciones y que lo vigilemos.»",
    flujo: ["Montaje (pago único)", "Cuota mensual", "Más clientes", "MRR crece"],
    relacionadas: ["capas"],
  },
];

export const leccion = (id: string) => TEMARIO.find((l) => l.id === id);
