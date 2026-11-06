/* ============================================================
   export.js — Exportación del Reporte de Cierre a Excel (.xlsx)
   Usa SheetJS (cargado local desde vendor/) — funciona sin conexión.

   Este botón es el corazón de la demo ante ejecutivos:
   elimina el doble reporte. El gestor captura una vez,
   el supervisor exporta y firma.
   ============================================================ */

/**
 * Genera y descarga el reporte de cierre en formato .xlsx
 * con el formato habitual del supervisor.
 * @param {Array}  promesas - Lista completa de promesas.
 * @param {Array}  gestores - Catálogo de gestores (para nombre y zona).
 */
function exportarReporteCierre(promesas, gestores) {
  const gestorPorId = Object.fromEntries(gestores.map((g) => [g.id, g]));

  // Mismo orden que la tabla del panel: fecha de compromiso ascendente
  const ordenadas = [...promesas].sort((a, b) => a.fecha_pago.localeCompare(b.fecha_pago));

  const filas = ordenadas.map((p) => {
    const gestor = gestorPorId[p.gestor_id] || { nombre: "—", zona: "—" };
    return {
      "Gestor": gestor.nombre,
      "Zona": gestor.zona,
      "Deudor": p.nombre_deudor,
      "Monto Prometido": p.monto_prometido,
      "Fecha Compromiso": formatearFechaCorta(p.fecha_pago),
      "Canal": p.canal_contacto,
      "Estado": p.estado.charAt(0).toUpperCase() + p.estado.slice(1),
      "Fecha de Captura": formatearFechaHora(p.fecha_captura),
    };
  });

  // Hoja "Promesas" con las columnas habituales del reporte nocturno
  const hoja = XLSX.utils.json_to_sheet(filas, {
    header: ["Gestor", "Zona", "Deudor", "Monto Prometido", "Fecha Compromiso", "Canal", "Estado", "Fecha de Captura"],
  });

  // Anchos de columna legibles al abrir en Excel
  hoja["!cols"] = [
    { wch: 22 }, // Gestor
    { wch: 20 }, // Zona
    { wch: 26 }, // Deudor
    { wch: 16 }, // Monto Prometido
    { wch: 18 }, // Fecha Compromiso
    { wch: 18 }, // Canal
    { wch: 12 }, // Estado
    { wch: 20 }, // Fecha de Captura
  ];

  // Formato de moneda para la columna de montos (columna D, desde la fila 2)
  filas.forEach((_, i) => {
    const celda = hoja["D" + (i + 2)];
    if (celda) celda.z = '"$"#,##0.00';
  });

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Promesas");

  const hoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `reporte_promesas_${hoy}.xlsx`);

  return filas.length;
}

/** "2026-11-06" → "06/11/2026" */
function formatearFechaCorta(iso) {
  if (!iso) return "—";
  const [anio, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

/** ISO → "06/11/2026 09:30" */
function formatearFechaHora(iso) {
  if (!iso) return "—";
  const f = new Date(iso);
  const dia = String(f.getDate()).padStart(2, "0");
  const mes = String(f.getMonth() + 1).padStart(2, "0");
  const horas = String(f.getHours()).padStart(2, "0");
  const minutos = String(f.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${f.getFullYear()} ${horas}:${minutos}`;
}
