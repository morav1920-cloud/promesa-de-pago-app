/* ============================================================
   seed.js — Datos de ejemplo precargados para la demo
   - 3 gestores ficticios con zonas reales de operación
   - 15 promesas: 8 cumplidas, 3 incumplidas, 4 capturadas
   - Montos entre $500 y $25,000 MXN
   - Fechas calculadas contra HOY (la demo nunca se ve vieja)
   - Nombres y teléfonos de deudores 100% FICTICIOS
   ============================================================ */

const GESTORES_SEED = [
  { id: "g1", nombre: "Laura Méndez",        zona: "Iztapalapa Norte",   rol: "gestor", gestiones_con_acuerdo: 6 },
  { id: "g2", nombre: "Carlos Ramírez",      zona: "Tlalnepantla Centro", rol: "gestor", gestiones_con_acuerdo: 6 },
  { id: "g3", nombre: "José Antonio Torres", zona: "Guadalajara Sur",     rol: "gestor", gestiones_con_acuerdo: 5 },
];

/** Devuelve una fecha ISO (YYYY-MM-DD) desplazada N días desde hoy. */
function fechaRelativa(dias) {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** Devuelve una marca de tiempo de hoy a una hora dada (formato ISO). */
function hoyALas(horas, minutos) {
  const f = new Date();
  f.setHours(horas, minutos, 0, 0);
  return f.toISOString();
}

/**
 * Construye las 15 promesas de ejemplo.
 * Distribución: 8 cumplidas / 3 incumplidas / 4 capturadas.
 * El ICC (cobrado / prometido) queda alrededor del 68-70%,
 * un número creíble para la conversación con ejecutivos.
 * Teléfonos: números inventados SOLO para demostrar los
 * botones de contacto rápido; no pertenecen a nadie real.
 */
function generarPromesasSeed() {
  // [gestor, deudor, teléfono, monto, días hasta fecha pago, canal, estado, hora captura, notas]
  const filas = [
    // --- Laura Méndez (g1): 3 cumplidas, 1 incumplida, 1 capturada vencida ---
    ["g1", "María López Hernández",   "5540012801",  3200,  -1, "WhatsApp",            "cumplida",    [8, 15],  "Pagó por transferencia, quedó al corriente."],
    ["g1", "Juan Hernández Cruz",     "5540012802",  5800,  -3, "Visita domiciliaria", "cumplida",    [8, 40],  ""],
    ["g1", "Guadalupe Torres Vega",   "5540012803",  4000,  -5, "Llamada",             "incumplida",  [9, 5],   "Dijo que le pagaban el viernes y no cayó."],
    ["g1", "Pedro Sánchez Ríos",      "5540012804",  1200,   0, "WhatsApp",            "cumplida",    [9, 30],  "Abona en la tarde después del trabajo."],
    ["g1", "Rosa María Jiménez",      "5540012805",  1800,  -2, "SMS",                 "capturada",   [10, 10], "Reagendó para esta semana, dar seguimiento."],

    // --- Carlos Ramírez (g2): 3 cumplidas, 1 incumplida, 1 capturada (vence HOY) ---
    ["g2", "Francisco Morales Díaz",  "5540012806",  7500,  -2, "Visita domiciliaria", "cumplida",    [8, 50],  "Pagó completo en efectivo."],
    ["g2", "Ana Patricia González",   "5540012807",  2100,   0, "WhatsApp",            "cumplida",    [9, 20],  ""],
    ["g2", "Miguel Ángel Ortiz",      "5540012808",  5000,  -4, "Llamada",             "incumplida",  [10, 0],  "Se comprometió el lunes y no respondió."],
    ["g2", "Carmen Ruiz Salazar",     "5540012809",  9800,  -1, "Visita domiciliaria", "cumplida",    [11, 15], "Liquidó con el aguinaldo adelantado."],
    ["g2", "Jorge Luis Castillo",     "5540012810",  3000,   0, "WhatsApp",            "capturada",   [11, 45], "Dice que hoy cobra y paga en la tarde."],

    // --- José Antonio Torres (g3): 2 cumplidas, 1 incumplida, 2 capturadas ---
    ["g3", "Verónica Delgado Mora",   "5540012811",  4500,   0, "Llamada",             "cumplida",    [9, 10],  "Abonó por la mañana, falta la mitad."],
    ["g3", "Roberto Navarro Peña",    "5540012812",  2800,  -6, "SMS",                 "incumplida",  [9, 35],  "Tercer compromiso sin cumplir, escalar."],
    ["g3", "Leticia Vargas Solís",    "5540012813", 18000,  -2, "Visita domiciliaria", "cumplida",    [10, 25], "Liquidación total del crédito."],
    ["g3", "Héctor Aguilar Núñez",    "5540012814",   750,   0, "WhatsApp",            "capturada",   [12, 5],  "Abono chico para no perder el hábito, vence hoy."],
    ["g3", "Silvia Moreno Campos",    "5540012815",  6200,   9, "Llamada",             "capturada",   [12, 40], "Paga con la quincena del día 15."],
  ];

  return filas.map((fila, i) => {
    const [gestor_id, nombre_deudor, telefono, monto, diasPago, canal, estado, hora, notas] = fila;
    return {
      id: "seed-" + (i + 1),
      gestor_id,
      nombre_deudor,
      telefono,                                     // ficticio, solo demo
      monto_prometido: monto,
      fecha_pago: fechaRelativa(diasPago),
      canal_contacto: canal,
      notas: notas || "",
      foto: null,                                   // sin evidencia en el seed
      estado,                                       // capturada | cumplida | incumplida
      monto_cobrado: estado === "cumplida" ? monto : 0,
      fecha_captura: hoyALas(hora[0], hora[1]),     // todas capturadas hoy
      sync_pending: false,                          // el seed ya viene "enviado"
      es_seed: true,
    };
  });
}

/** Siembra la base si está vacía. Devuelve true si sembró. */
async function sembrarSiVacia() {
  const total = await DB.contarPromesas();
  if (total > 0) return false;
  await restablecerDemo();
  return true;
}

/** Limpia todo y vuelve a sembrar (botón "Restablecer datos de demo"). */
async function restablecerDemo() {
  await DB.limpiarTodo();
  await DB.guardarGestores(GESTORES_SEED);
  const promesas = generarPromesasSeed();
  for (const p of promesas) {
    await DB.agregarPromesa(p);
  }
}
