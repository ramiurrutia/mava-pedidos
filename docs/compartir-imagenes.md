# Recibir imágenes desde WhatsApp

La PWA declara `share_target` en `/manifest.webmanifest`. Android/Chrome puede mostrar **MAVA Pedidos** en el menú del sistema al compartir imágenes, una vez instalada desde el sitio HTTPS. Safari/iOS no admite recibir archivos en una PWA con esta API.

Después de publicar la actualización, abrir la PWA con conexión para actualizar el service worker. La actualización del manifiesto de una instalación existente puede demorarse; si MAVA no aparece como destino, desinstalar y volver a instalar la PWA desde Chrome.

La recepción declara tipos MIME, extensiones y `application/octet-stream` para permitir fotos identificadas como archivos genéricos. El service worker identifica JPG, PNG, WebP y GIF por su cabecera y rechaza los demás formatos antes de guardarlos. Los límites de tamaño y cantidad se mantienen.

Si aparece «El navegador abrió MAVA Pedidos, pero no entregó ningún archivo», el POST llegó sin partes de archivo: no es un rechazo por formato de la foto. Tras publicar un cambio de `share_target`, actualizar el navegador y reinstalar la PWA permite probar con el registro nuevo del sistema; actualizar únicamente el service worker no garantiza actualizar ese registro. Si sigue ocurriendo, registrar teléfono, navegador y versión para investigar la entrega del archivo. La pantalla ofrece un selector local que envía las imágenes al mismo receptor y permite continuar con las dos acciones habituales. Esta alternativa no demuestra que el menú Compartir del sistema esté reparado.

## Flujo

1. En WhatsApp, seleccionar una o varias fotos y usar **Compartir**.
2. Elegir **MAVA Pedidos**.
3. Elegir **CREAR PEDIDO** o **SUBIR IMAGEN A PEDIDO**.
4. Completar el nuevo pedido o buscar uno activo por cliente/código. Agregar las notas de las imágenes y confirmar.
5. Al completar la subida, se abre el pedido.

Se admiten hasta 30 imágenes por envío, con el límite existente de 6 MB por archivo. Los archivos permanecen temporalmente en Cache Storage del dispositivo por hasta 24 horas, con un identificador distinto para cada envío. La lectura no los elimina; se descartan explícitamente o se eliminan al completar la operación. Los vencidos se eliminan al intentar abrirlos o al recibir otro envío. Actualizar el service worker no borra las imágenes pendientes.

El service worker intercepta `POST /compartir/recibir`, guarda los archivos localmente y redirige con 303 a `/compartir?share=…`. El endpoint de servidor devuelve un mensaje de actualización si el service worker no controla la recepción. No se suben archivos a Supabase hasta confirmar el destino.

Una vez creado el pedido, se conserva su ID antes de subir las imágenes. Se actualiza el borrador después de cada subida exitosa para reintentar solamente las pendientes. Se conservan el destino y las notas al recargar un borrador ya confirmado. Las notas editadas antes de confirmar no se guardan automáticamente.

## Verificación

Automática: `node --test lib/shared-images.test.mjs`, `npm run lint`, `npm run build`.

En un Android real, con la versión publicada e instalada:

- Compartir una foto con la app cerrada y crear un pedido; verificar cliente, notas y foto en el pedido.
- Compartir varias fotos, buscar un pedido activo y adjuntarlas. Verificar que no se creó otro pedido.
- Abrir dos envíos distintos y comprobar que sus imágenes no se mezclan.
- Recargar la pantalla recibida antes de confirmar; las fotos deben seguir disponibles.
- Interrumpir la conexión durante una subida, recuperarla y reintentar. Verificar que se mantiene el pedido creado y solamente se reenvían las fotos pendientes.
- Probar cancelar, compartir un archivo de más de 6 MB y abrir un envío ya completado.

El service worker se registra solamente en producción. Para simular la recepción localmente, ejecutar `npm run build` y `npm start`, abrir el sitio una vez y esperar a que el service worker controle la página. Se puede enviar un formulario multipart a `/compartir/recibir` con uno o varios archivos en el campo `images`. El menú real de WhatsApp requiere la comprobación en Android.

Referencia: https://developer.chrome.com/docs/capabilities/web-apis/web-share-target
