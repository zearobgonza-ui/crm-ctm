export function buildSequenceMessages({ name }) {

  const n = name || "Hola";

  return [

    {
      intent: "confirmacion",
      offsetHours: 0,
      text:
`Hola ${n} 👋

Te paso la información de *Cash Flow Master* 🔥

En este entrenamiento verás:

1️⃣ Cómo digitalizar cualquier idea
2️⃣ Cómo crear un negocio digital sin ser experto
3️⃣ Cómo atraer prospectos que quieran comprarte

¿Hoy estás buscando empezar desde cero o escalar algo que ya tienes?`
    },

    {
      intent: "valor_1",
      offsetHours: 18,
      text:
`Tip importante antes del webinar:

La mayoría intenta crear negocios digitales desde herramientas.

Pero el verdadero crecimiento viene de la *estructura del modelo*.

Eso es justo lo que veremos en Cash Flow Master.

¿Qué tipo de proyecto tienes en mente ahora mismo?`
    },

    {
      intent: "recordatorio",
      offsetHours: 36,
      text:
`Recordatorio rápido 🔔

Mañana es *Cash Flow Master*

8PM COL / PER / ECR  
10PM ARG / CHILE

Te recomiendo entrar 10 minutos antes.

¿Ya apartaste el espacio en tu agenda?`
    }

  ];

}