# Promesa de Pago Digital — MVP Piloto

App web (PWA) para digitalizar la captura de promesas de pago en cobranza de campo.
Funciona 100% sin conexión, sin backend y sin instalación de nada: solo un navegador.

## Cómo ejecutarla localmente

Necesitas servirla por HTTP (los service workers no funcionan con doble clic al archivo).
Cualquiera de estas dos opciones, desde esta carpeta:

```bash
# Opción 1: con Python (ya viene en casi cualquier computadora)
python3 -m http.server 8080

# Opción 2: con Node
npx serve
```

Luego abre `http://localhost:8080` en el navegador.

## Cómo ponerla en internet (gratis)

1. Entra a https://app.netlify.com/drop
2. Arrastra esta carpeta completa
3. Te da un link público al instante (ese es el que abres en el celular para la demo)

## Guion de demo sugerido (5 a 8 minutos)

1. **Login**: elige "Soy Gestor" y entra como Laura Méndez.
2. **Por Cobrar Hoy**: la primera pestaña muestra lo que vence hoy y lo atrasado, con semáforo de días. Es la operación real del gestor en la calle.
3. **Contacto rápido**: toca "WhatsApp" en una tarjeta — se abre la conversación con el mensaje ya redactado. Un toque, cero tecleo.
4. **Captura en vivo**: llena el formulario (30 segundos), adjunta una foto del comprobante y guarda. Aparece el aviso verde.
5. **Edición**: abre una promesa capturada → "Editar datos" → cambia el monto → "Guardar Cambios". Demuestra flexibilidad ante el error humano.
6. **Cambiar de rol** → "Soy Supervisor": la promesa recién capturada ya está en el embudo y la tabla.
7. **KPIs**: TCE arriba de 85% (en verde) e ICC realista.
8. **Resumen WhatsApp**: un toque genera el resumen del día en texto listo para reenviar al director (los mandos medios leen WhatsApp, no PDFs).
9. **Exportar Reporte de Cierre**: descarga el Excel real y ábrelo frente a ellos.
10. **Momento estrella**: si un ejecutivo pregunta "¿y si quiero meter a otro cobrador?", regresa al login y da de alta al nuevo gestor en 15 segundos, frente a ellos.
11. **Cierre**: muestra el indicador de señal. Frase ganadora: *"Esto no interrumpe nada de lo que ya hacemos, y por primera vez veríamos el embudo de promesas antes del cierre del día."*

## Datos de demo

- 3 gestores ficticios y 15 promesas (8 cumplidas, 3 incumplidas, 4 capturadas).
- Los teléfonos de los deudores son números inventados solo para demostrar los botones de contacto rápido.
- Las fechas se calculan contra "hoy": la demo siempre se ve fresca.
- En el login hay enlaces discretos: "Agregar nuevo usuario" (alta de gestores/supervisores en vivo) y "Restablecer datos de demo".

## Funciones de la versión 2

- **Pestaña "Por Cobrar Hoy"**: promesas que vencen hoy o están atrasadas, con semáforo de días. La cobranza vive del seguimiento, no solo de la captura.
- **Contacto rápido**: botones de WhatsApp (mensaje pre-redactado) y llamada directa desde cada tarjeta.
- **Foto del comprobante**: se comprime en el propio teléfono antes de guardarse localmente (de ~3MB a ~100KB).
- **Edición de promesas capturadas**: corregir monto, fecha o canal sin borrar el registro.
- **Alta de usuarios en vivo**: nuevos gestores o supervisores desde el login.
- **Resumen WhatsApp del supervisor**: métricas del día en texto listo para reenviar.

## Funciones de la versión 3

- **Interruptor de datos de ejemplo**: en el login, "Cargar datos de ejemplo para demostración" muestra u oculta la info ficticia. Apagado = app limpia lista para capturar datos reales; encendido = demo llena para presentar.
- **Eliminar usuarios**: icono de basurita junto a cada gestor en el login (pide confirmación; sus promesas capturadas se conservan).
- **Aviso de vencimientos**: al entrar, el gestor ve de inmediato cuántas promesas tiene vencidas o por vencer hoy; un toque lo lleva directo a "Por Cobrar Hoy".
- **Barra fija de edición**: al corregir una promesa, los botones Cancelar / Guardar Cambios quedan fijos abajo, siempre al alcance del pulgar.
- **Copiar resumen**: desde el detalle de cada promesa, copia cliente, monto, fecha y teléfono al portapapeles para pegarlo donde se necesite.
- **Filtro por gestor (supervisor)**: la tabla del cierre se filtra por gestor y se combina con la búsqueda.

## Instalación en el celular (PWA)

Abriéndola por HTTPS (el link de Netlify), el navegador ofrece "Agregar a pantalla de inicio".
Queda como app con ícono propio y funciona sin señal.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Las 3 vistas: login, gestor y supervisor |
| `styles.css` | Estilos con la paleta corporativa |
| `app.js` | Lógica de pantallas, formulario, listas y panel |
| `db.js` | Guardado local (IndexedDB), sobrevive a recargas |
| `seed.js` | Datos de ejemplo precargados |
| `export.js` | Generación del Excel de cierre |
| `sw.js` + `manifest.webmanifest` | Instalable y funcional sin conexión |
| `vendor/xlsx.full.min.js` | SheetJS local (el Excel funciona sin internet) |

## Lo que NO hace esta versión (a propósito)

Sin GPS, sin OCR, sin IA, sin mapas, sin contraseñas reales y sin integración con
WhatsApp/SPEI/core bancario. Es la capa de captura y visibilidad, nada más.
