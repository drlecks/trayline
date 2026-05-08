# Trayline — Plan N2: Gestión de Skills y MCPs

> Mejoras sobre el plan MVP. Dos áreas nuevas: (1) una gestión de skills globales más rica, con instalación desde URL directa además del buscador, y (2) un sistema completo de gestión de MCPs paralelo al de skills, con detección de credenciales faltantes y configuración guiada.

---

## 1. Resumen de cambios

El plan original ya contemplaba skills globales con un Skill Finder que consulta un índice JSON en GitHub. N2 amplía esto en dos ejes:

**Skills (mejora):** convertir la pantalla de skills en una sección de primer nivel con una lista clara de instalados, un botón "Añadir" que ofrece dos caminos (buscar en el catálogo o pegar una URL directa), y validación real de que lo que se descarga es un skill funcional antes de aceptarlo.

**MCPs (nuevo):** introducir los MCPs como un concepto paralelo a los skills. Se gestionan globalmente igual que los skills, se asignan por worker igual que los skills, y muchos de los más usados (Gmail, Google Calendar, Google Drive, navegación web, GitHub, Slack) vienen pre-listados aunque no instalados. Cuando un MCP requiere credenciales, la UI lo señala claramente y guía al usuario en la configuración paso a paso.

**Por qué importa:** los MCPs son el puente entre los workflows de Trayline y el mundo real (correo, calendarios, documentos, APIs). Sin ellos, los workers solo pueden manipular ficheros locales. Tratarlos como ciudadanos de primera —no como un detalle escondido en la config de un skill— es lo que abre la puerta a casos de uso reales como "lee mi email cada hora y triagea los leads".

---

## 2. Vocabulario añadido

| Término | Significado |
|---|---|
| **MCP** | Model Context Protocol server — un proceso que expone herramientas (tools) y recursos a un agente de IA. Trayline los gestiona como dependencias instalables y configurables. |
| **MCP Catalog** | El listado curado de MCPs conocidos que Trayline muestra por defecto, aunque no estén instalados. |
| **MCP Registry** | Igual que el Skill Index pero para MCPs: un JSON público en GitHub con MCPs descubribles más allá del catálogo curado. |
| **Credential Set** | Las credenciales (OAuth tokens, API keys, etc.) que un MCP necesita para funcionar. Almacenadas en el keychain del SO, nunca en JSON plano. |
| **Setup Wizard** | El flujo guiado paso a paso que un MCP define para configurarse (p.ej. abrir el navegador para OAuth, pegar una API key). |
| **Skill Source** | El origen de un skill instalado: `catalog` (del índice oficial), `url` (instalado pegando una URL), `system` (skill del sistema), `local` (creado a mano por el usuario). |

---

## 3. Cambios en estructura de carpetas

```
~/Documents/Trayline/
│
├── app-data/
│   ├── settings.json
│   ├── skills-index-cache.json
│   ├── mcps-index-cache.json          ← NUEVO
│   ├── mcps-catalog.json              ← NUEVO (curado, embebido en la app, copiado en primer arranque)
│   └── audit.db
│
├── skills/                            ← (sin cambios estructurales)
│   ├── pdf-reader/
│   ├── _system/
│   └── ...
│
├── mcps/                              ← NUEVO bloque entero
│   ├── gmail/
│   │   ├── mcp.json                   # id, version, descripción, comando, schema de credenciales, setup steps
│   │   ├── README.md                  # Documentación visible al usuario
│   │   └── state/
│   │       ├── status.json            # { "configured": true, "last_health_check": "...", "last_error": null }
│   │       └── logs/                  # Logs de arranque/errores del proceso del MCP
│   ├── google-calendar/
│   ├── google-drive/
│   ├── web-browse/
│   └── ...
│
└── projects/
    └── client-onboarding/
        └── workflows/
            └── new-client-intake/
                └── steps/
                    └── 02-extract/
                        └── step.json   # ahora incluye además: "mcps": ["gmail", "google-calendar"]
```

**Las credenciales NO viven en `mcps/<id>/`.** Viven en el keychain del sistema operativo (Keychain en macOS, Credential Manager en Windows, libsecret en Linux), accedido vía la librería `keytar`. El fichero `mcp.json` solo declara qué credenciales hace falta, no las contiene. `state/status.json` solo guarda flags de estado (`configured: true/false`), nunca el secreto en sí.

Esto es importante por dos razones: (a) si el usuario hace zip de su carpeta Trayline para hacer backup, no está exportando sus tokens de Gmail a un fichero plano; (b) cuando exporte un proyecto para compartirlo, las credenciales nunca viajan con el zip — el destinatario tiene que reconfigurar sus propias credenciales.

---

## 4. Skills — Mejoras detalladas

### 4.1 Pantalla de Skills (rediseño)

Pasa de ser una sub-pestaña en Settings a una **sección de primer nivel** accesible desde el top bar (icono de bloques apilados, junto a Settings y Notifications). Mantiene la idea pero con más respiración visual.

```
┌──────────────────────────────────────────────────────────────────┐
│ [≡] Trayline · Skills                          [⚙] [🔔] [👤]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Skills                                       [+ Add skill]      │
│  Reusable capabilities your workers can use.                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  🔍  Search installed skills...                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Installed (7)                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 📄  PDF Reader                              v1.2.0   ⋯     │ │
│  │     Extract text and tables from PDF files                  │ │
│  │     From catalog · Used in 3 workers                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✉️   Email Sender                            v0.8.1   ⋯     │ │
│  │     Send emails via SMTP                                    │ │
│  │     From URL · github.com/... · Used in 1 worker            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🔧  trayline-author                          system   ⋯     │ │
│  │     System skill — generates workflows from descriptions   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Cada tarjeta de skill muestra: icono, nombre, versión, descripción de una línea, fuente (`From catalog` / `From URL` / `system` / `local`), y cuántos workers la usan actualmente (link clicable que filtra los workers). El menú `⋯` ofrece **Update** (si la fuente lo soporta), **Reinstall**, **View files** (abre la carpeta del skill en Finder/Explorer), **Uninstall** (deshabilitada con tooltip explicativo si está en uso).

### 4.2 El botón "Add skill" — dos caminos

Al pulsar **+ Add skill** se abre un modal con dos pestañas:

**Pestaña "Browse catalog"**
- Es el Skill Finder original: caja de búsqueda, lista de skills del índice remoto, botón Install por skill.
- Cada resultado muestra: nombre, descripción corta, autor, versión, tags, estrellas/popularidad si el índice las trae.
- Se mantiene el caché local para que funcione offline.

**Pestaña "From URL"** (la nueva)
- Un campo de texto único: *"Paste a URL to a skill repository or zip..."*
- Acepta tres formatos:
  - **GitHub repo:** `https://github.com/user/my-skill` o `https://github.com/user/my-skill/tree/main/skills/foo` (subcarpeta)
  - **Zip directo:** `https://example.com/my-skill.zip`
  - **Raw skill.json:** `https://raw.githubusercontent.com/.../skill.json` (Trayline resuelve los ficheros hermanos del mismo directorio)
- Al pegar y pulsar **Install**, arranca la **validación** (siguiente sección).

### 4.3 Validación de un skill instalado desde URL

Antes de aceptar el skill, Trayline verifica:

1. **Descarga reproducible** — clona el repo a un directorio temporal o descarga y descomprime el zip. Si la URL falla, error claro: *"Couldn't reach this URL. Check the link and your connection."*
2. **`skill.json` presente y válido** — debe existir en la raíz, parsear como JSON, y validar contra un schema zod (campos requeridos: `id`, `name`, `version`, `description`; opcionales: `tools`, `tags`, `author`, `homepage`, `license`).
3. **`skill.md` presente y no vacío** — el contenido inyectado en los prompts.
4. **ID no colisiona** — si ya hay un skill con ese `id` instalado, el modal pregunta: *"A skill with id `pdf-reader` is already installed (v1.2.0). Replace it with this version (v1.3.0)?"* con opción de cancelar.
5. **Sanity check de contenido** — si `skill.md` está completamente vacío o solo tiene whitespace, se rechaza con mensaje *"This skill's instructions file is empty. It probably won't work."*
6. **Tamaño razonable** — rechazar skills con `skill.md` > 500KB o con la carpeta total > 10MB. Esto previene zips maliciosos o accidentales.
7. **No ejecutables ni scripts arbitrarios** — el contenido permitido es solo: `skill.json`, ficheros markdown, ficheros de texto plano dentro de `templates/`, imágenes pequeñas (<1MB cada una). Si la carpeta contiene `.exe`, `.sh`, `.bat`, `.dll`, `.so`, binarios o scripts ejecutables, se rechaza con un mensaje claro: *"This skill contains executable files, which Trayline doesn't allow. Skills are instructions only."*

Durante la validación se muestra una secuencia de checks visibles al usuario:

```
Validating skill from github.com/user/my-skill...

  ✓  Downloaded
  ✓  skill.json found and valid
  ✓  skill.md found (2.3 KB)
  ✓  No executable content
  ⚠  A skill with id "pdf-reader" already exists

  [Cancel]  [Replace existing v1.2.0]
```

Si todo pasa limpio, la última pantalla es un confirm con el resumen del skill (nombre, versión, descripción, tools que declara) y un botón final **Install**. Solo entonces se copia a `~/Documents/Trayline/skills/<id>/`.

### 4.4 Trazabilidad de la fuente

El `skill.json` instalado se enriquece con un bloque `_trayline` (que la app gestiona, no el autor del skill):

```json
{
  "id": "pdf-reader",
  "name": "PDF Reader",
  "version": "1.2.0",
  "description": "...",
  "_trayline": {
    "source": "url",
    "source_url": "https://github.com/user/pdf-reader",
    "installed_at": "2026-05-08T10:14:22Z",
    "installed_from_commit": "a3f9c12"
  }
}
```

Esto permite mostrar la fuente en la UI, ofrecer **Update** para skills instalados por URL (re-clona y revalida), y dar transparencia total — el usuario siempre puede saber de dónde salió cada skill.

---

## 5. MCPs — Sistema completo nuevo

### 5.1 Qué es un MCP en Trayline

Un MCP en Trayline es una pieza instalable globalmente (igual que un skill) que un worker puede activar (igual que un skill). La diferencia clave con un skill: **un MCP es un proceso real que se ejecuta**, mientras que un skill es texto inyectado en un prompt. Un skill le dice al agente *cómo* hacer algo; un MCP le da *el poder* de hacerlo.

Cuando un worker se ejecuta y tiene MCPs activados, el AI Terminal Adapter levanta los procesos MCP correspondientes (o reutiliza ya activos) y los conecta a la sesión del agente vía stdio o HTTP/SSE — el adaptador maneja los detalles. El worker se entera de qué herramientas tiene disponibles porque el MCP las anuncia automáticamente al agente al conectar.

### 5.2 El catálogo curado por defecto

Trayline embebe un catálogo de MCPs reconocidos que se muestran al usuario aunque no los tenga instalados. Esto da el momento "ah, esto puede leer mi correo" sin tener que buscar nada.

Catálogo inicial propuesto:
- **Gmail** — leer, buscar, enviar emails
- **Google Calendar** — leer eventos, crear eventos, modificar
- **Google Drive** — listar, leer, crear, editar ficheros
- **Web Browse** — navegación web headless con extracción de contenido
- **GitHub** — issues, PRs, repos, archivos
- **Slack** — leer canales, postear mensajes
- **Notion** — leer y editar páginas y bases de datos
- **Filesystem** — leer/escribir ficheros del sistema (con scope configurable)
- **Fetch** — peticiones HTTP arbitrarias
- **Memory** — almacén persistente clave-valor para el agente

Cada entrada del catálogo es una definición declarativa que vive en `app-data/mcps-catalog.json` (semilla embebida en la app). La definición incluye: `id`, `name`, `description`, `icon`, `install_method` (`npm`, `binary`, `docker`...), `command_template`, `credentials_schema` (qué credenciales necesita y de qué tipo: oauth, api_key, none), `setup_steps` (los pasos del wizard), `homepage`.

Mostrar un MCP en el catálogo no significa que esté instalado — significa que Trayline sabe cómo instalarlo y configurarlo cuando el usuario lo pida.

### 5.3 Pantalla de MCPs

Hermana de la pantalla de Skills, accesible desde el top bar. Misma filosofía visual.

```
┌──────────────────────────────────────────────────────────────────┐
│ [≡] Trayline · MCPs                            [⚙] [🔔] [👤]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MCPs                                          [+ Add MCP]       │
│  Connect your workers to real-world services.                   │
│                                                                  │
│  Installed (3)                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✉️   Gmail                                  ✓ Ready    ⋯   │ │
│  │     Read, search and send Gmail messages                    │ │
│  │     Connected as alice@example.com · Used in 2 workers      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 📅  Google Calendar                  ⚠ Setup needed   ⋯   │ │
│  │     Read and modify calendar events                         │ │
│  │     Credentials missing · [Set up now ›]                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🌐  Web Browse                              ✓ Ready    ⋯   │ │
│  │     Browse websites and extract content                     │ │
│  │     No credentials required · Used in 1 worker              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Available (not installed)                                      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 📁  Google Drive                              [Install]    │ │
│  │     Access and modify files in Google Drive                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 💬  Slack                                     [Install]    │ │
│  │     Read channels and post messages                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ... (resto del catálogo)                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Dos secciones claras: **Installed** (los que el usuario ya instaló) y **Available** (el catálogo curado, atenuados visualmente para señalar que aún no están). El usuario puede instalar uno del catálogo con un clic; lo más probable es que tras instalar haga falta configurar credenciales, así que el flujo encadena automáticamente al setup wizard.

### 5.4 Indicador de estado por MCP

Cada MCP instalado tiene uno de estos estados, mostrado claramente en su tarjeta:

- **✓ Ready** (verde suave) — instalado, configurado, último health check OK.
- **⚠ Setup needed** (ámbar) — instalado, pero faltan credenciales o configuración. Click en *"Set up now"* arranca el wizard.
- **⚠ Auth expired** (ámbar) — credenciales caducadas (típico de OAuth). *"Reconnect"* relanza el flujo OAuth.
- **✗ Error** (rojo desaturado) — el último intento de health check falló. Tooltip muestra el error; el menú `⋯` ofrece **View logs** y **Run health check**.
- **⏸ Disabled** (gris) — el usuario lo deshabilitó manualmente. No se levantará en runs aunque algún worker lo tenga marcado.

El estado se actualiza en tres momentos: al instalar, al volver de un setup wizard, y de forma reactiva cada vez que un run usa el MCP (el adaptador reporta éxito/fallo). Hay también un **Run health check** manual en el menú `⋯` que el usuario puede pulsar cuando dude.

Crucial: **si un worker tiene un MCP marcado pero ese MCP no está en estado Ready, la UI del worker lo señala antes de que el usuario intente correrlo.** En la tarjeta del worker en el rail izquierdo aparece un pequeño triángulo ámbar con tooltip *"Calendar MCP needs setup"*, y al abrir el worker la pestaña Skills & Context muestra el MCP en rojo con un botón inline *"Configure now"*. Ningún run "falla en silencio por credenciales" — siempre se previene antes.

### 5.5 El Setup Wizard

Cuando un MCP requiere configuración, el wizard es un modal lineal (next / back / cancel) cuyos pasos vienen declarados en el `mcp.json` del MCP. Trayline solo provee los componentes UI estándar; el MCP elige qué pasos pedir.

Tipos de paso soportados en MVP:
- **`oauth`** — abre el navegador del SO en una URL del proveedor, levanta un servidor local efímero en `http://localhost:<puerto>` para capturar el callback, almacena los tokens en el keychain. Mientras espera el callback, el modal muestra *"Waiting for you to authorize Gmail in your browser..."* con un botón **Cancel**.
- **`api_key`** — un campo de texto con label, descripción, link a "Where do I find this?", y validación opcional (regex). El valor se guarda en el keychain.
- **`text_field`** — un campo no-secreto (p.ej. URL del workspace), guardado en el `state/` del MCP.
- **`select`** — opciones en un dropdown (p.ej. región).
- **`info`** — solo informativo, con texto y opcionalmente links externos.
- **`test_connection`** — Trayline lanza el proceso del MCP con las credenciales recién introducidas y comprueba que arranca y responde a un ping. Si falla, el wizard muestra el error y deja al usuario volver atrás.

Ejemplo de `setup_steps` en el `mcp.json` de Gmail:

```json
"setup_steps": [
  {
    "id": "intro",
    "type": "info",
    "title": "Connect Gmail",
    "body": "Trayline will open your browser so you can sign in to Google and grant read/send access. Your credentials are stored in your system keychain — never in plain files."
  },
  {
    "id": "oauth",
    "type": "oauth",
    "provider": "google",
    "scopes": ["gmail.readonly", "gmail.send"],
    "credential_id": "google_oauth_token"
  },
  {
    "id": "verify",
    "type": "test_connection",
    "title": "Verifying connection..."
  }
]
```

Cualquier paso puede ser cancelado y se restaura el estado anterior — si el wizard se aborta a mitad, el MCP queda como estaba (probablemente *Setup needed*) y nada se persiste a medias.

### 5.6 Ejecución: cómo el worker usa MCPs

En el `step.json` de un worker se añade el campo `mcps` al lado del existente `skills`:

```json
{
  "id": "02-extract",
  "kind": "worker",
  "name": "Extract & Validate",
  "skills": ["pdf-reader", "csv-parser"],
  "mcps": ["gmail", "google-calendar"],
  "context_packs": ["company-info.md"],
  "execution": { "command": "claude", ... },
  ...
}
```

En el AI Terminal Adapter, cuando se llama a `spawn()`, el motor:

1. Resuelve cada MCP id contra `~/Documents/Trayline/mcps/`. Si alguno no está instalado o no está en estado Ready, **el run aborta antes de empezar** y la UI muestra qué MCP falla — no se entra al estado *Running*. (Esta validación previa al spawn es la que respalda la promesa de la sección 5.4.)
2. Para cada MCP listo, prepara la configuración que el agente CLI necesita para conocerlo. La forma exacta depende del adaptador (Claude Code, por ejemplo, acepta un fichero de config MCP via flag); el adaptador es el que sabe traducirlo. Las credenciales se leen del keychain en este momento y se inyectan como variables de entorno o se pasan al MCP por stdin según declara su `mcp.json`.
3. Lanza el agente. Los procesos MCP arrancan en sus propios subprocesos hijos del agente (no de Trayline directamente), siguiendo el modelo estándar de MCP.
4. Al terminar el run, los procesos MCP se cierran junto con el agente.

Trayline registra en `runs/<run_id>/meta.json` qué MCPs estuvieron activos durante el run, así la pantalla de Run History puede mostrar *"Used: Gmail, Calendar"* y para auditoría queda claro qué herramientas reales se usaron en cada ejecución.

### 5.7 Asignación de MCPs en la UI del worker

La pestaña **Skills & Context** del worker pasa a llamarse **Skills, MCPs & Context** y tiene tres bloques visualmente separados:

```
┌──────────────────────────────────────────────────────────────┐
│  Skills                                                       │
│  ───────────────────────────────────                         │
│  ☑ PDF Reader                                                │
│  ☑ CSV Parser                                                │
│  ☐ Email Sender                                              │
│  ☐ Web Scraper                                               │
│                                                              │
│  MCPs                                                         │
│  ───────────────────────────────────                         │
│  ☑ Gmail                              ✓ Ready                │
│  ☑ Google Calendar           ⚠ Setup needed [Configure ›]    │
│  ☐ Google Drive                                              │
│  ☐ Web Browse                         ✓ Ready                │
│                                                              │
│  Context Packs                                                │
│  ───────────────────────────────────                         │
│  ☑ company-info.md                                           │
│  ☐ brand-voice.md                                            │
└──────────────────────────────────────────────────────────────┘
```

Cada MCP muestra su estado a la derecha. Si está marcado pero en *Setup needed*, se ve un botón inline para arrancar el wizard sin salir de la pantalla del worker. Si el usuario marca un MCP que no está instalado (porque lo hace desde el catálogo dentro del propio picker), se ofrece instalarlo con un clic, encadenando setup si hace falta.

### 5.8 Añadir MCPs fuera del catálogo

El botón **+ Add MCP** ofrece tres caminos, paralelos a los de skills:

- **Browse catalog** — el catálogo curado embebido (filtrar los ya instalados).
- **Browse registry** — un índice JSON remoto con MCPs descubribles más allá del catálogo curado, alojado igual que el de skills (`https://raw.githubusercontent.com/[org]/trayline-mcps/main/index.json`).
- **From URL** — pegar URL a un repo o zip que contenga un `mcp.json` válido.

Las reglas de validación al instalar desde URL son análogas a las de skills (sección 4.3), con extras propios de MCPs:

- `mcp.json` válido contra schema zod (campos: `id`, `name`, `version`, `description`, `install_method`, `command_template`, `credentials_schema`, `setup_steps`).
- Si `install_method` es `npm`, el paquete se instala en una carpeta aislada bajo el MCP (no global, no contamina el `node_modules` del usuario).
- Si `install_method` es `binary`, se descarga el binario al directorio del MCP y se le hace `chmod +x` en Unix. Trayline verifica un checksum SHA-256 declarado en `mcp.json` antes de marcarlo instalado.
- Si `install_method` es `docker`, se valida que Docker está en el PATH; si no, error claro: *"This MCP requires Docker. Install Docker Desktop first."*
- **Confirmación explícita** — instalar un MCP arbitrario por URL ejecuta código en la máquina del usuario. La pantalla de confirmación final dice claramente: *"This will install and run code on your computer. Only install MCPs from sources you trust."* con la URL bien visible y un checkbox que el usuario debe marcar antes de que **Install** se active. Esto no es paranoia decorativa — es la diferencia con un skill, que es solo texto.

### 5.9 Salud y observabilidad

Cada MCP instalado tiene un panel de detalle (clic en su tarjeta):

- **Status** — el estado actual con timestamp del último check.
- **Credentials** — qué credenciales tiene configuradas, con opción de **Reset** (que abre el wizard de nuevo). Los valores nunca se muestran, solo el hecho de que existen (*"API key: configured ✓"*).
- **Logs** — las últimas N líneas de stdout/stderr del proceso del MCP en sus últimos arranques. Útil para depurar.
- **Used in workers** — lista clicable de workers que lo tienen activado.
- **Run health check** — botón que lanza el MCP en modo test y comprueba que responde.
- **Uninstall** — borra la carpeta y elimina las credenciales del keychain. Si está en uso por workers, el botón está deshabilitado con tooltip explicativo.

---

## 6. Cambios en otras áreas del plan

### 6.1 Top bar
Pasa de tener `[⚙] [🔔] [👤]` a tener `[⚙] [Skills] [MCPs] [🔔] [👤]`, con Skills y MCPs como iconos diferenciados (lucide: `blocks` para skills, `plug` para MCPs). El usuario llega a estas pantallas en un clic desde cualquier lugar de la app.

### 6.2 Workflow Author
El system skill `trayline-author` se enriquece para que, al diseñar un workflow, recomiende MCPs y no solo skills. Si la descripción del usuario menciona "email", el plan generado incluye `gmail` en los MCPs del worker correspondiente. Si Gmail no está instalado, el scaffold no falla — crea el worker con el MCP marcado pero la UI muestra *"Setup needed"* y guía al usuario al wizard tras el aterrizaje en el proyecto.

Esto cambia el primer mensaje post-scaffold: si el plan referencia MCPs no configurados, el banner cambia de *"Here's a starting point for you. Edit anything you want."* a *"Here's a starting point. To run it, set up Gmail and Calendar — click any worker with a ⚠ to start."*

### 6.3 Import / Export
- **Export:** el `manifest.json` del zip ahora lista también los MCPs requeridos con sus IDs y versiones, paralelo a los skills. Las credenciales **nunca** se exportan.
- **Import:** el diálogo de "missing dependencies" agrupa skills y MCPs por separado:
  *"This project needs 2 skills and 1 MCP you don't have. Install them now?"*
  Tras instalar el MCP, si requiere setup, se encadena el wizard automáticamente para cada uno antes de aterrizar en el proyecto.

### 6.4 Audit log
Se añaden eventos: `mcp_installed`, `mcp_uninstalled`, `mcp_configured`, `mcp_credentials_reset`, `mcp_health_check_failed`, `run_aborted_mcp_not_ready`. Esto permite que la pantalla global de History sirva también para auditar configuración de integraciones — útil en entornos de empresa.

### 6.5 Out of scope para N2
- MCPs con UI propia embebida (más allá del setup wizard estándar).
- Compartir credenciales entre instalaciones de Trayline en distintas máquinas.
- MCPs remotos (HTTP/SSE) además de los locales — el adaptador podría soportarlo a futuro pero N2 se limita a stdio.
- Catálogo/registry editable por el usuario (cambiar la URL del registry sí es configurable; curar el catálogo no).

---

## 7. Plan de implementación N2

Asume el plan original ya completado o muy avanzado. Las fases que siguen se intercalan con las del plan principal cuando tenga sentido (por ejemplo, la fase de skills mejorada solo necesita estar lista antes de la beta, no antes que workers).

### Fase N2.1 — Skills mejorados (1 semana)
- Refactor de la pantalla de skills a sección de primer nivel (top bar).
- Tarjetas con fuente y conteo de uso ("Used in N workers" calculado escaneando los `step.json`).
- Modal **+ Add skill** con pestañas Browse / From URL.
- Pipeline de validación al instalar desde URL: descarga, schema check, content sanity, executable scan, tamaño, colisión de id.
- Bloque `_trayline` enriquecido en el `skill.json` instalado.
- **Update / Reinstall** para skills cuya fuente lo permita (re-clona/re-descarga y revalida).
- Tests: instalar desde URL válida, URL inválida, repo sin `skill.json`, repo con `skill.md` vacío, repo con ejecutables, colisión de id.

### Fase N2.2 — Fundamentos de MCPs (1 semana)
- Crear estructura `~/Documents/Trayline/mcps/` en el bootstrap (extender Phase 1 del plan original).
- Embeber `mcps-catalog.json` con el catálogo curado inicial.
- Definir el schema zod de `mcp.json` y el validador.
- Implementar el `MCPRegistry` (servicio): listar instalados, listar catálogo, listar registry remoto, leer estado, calcular salud.
- Integración con `keytar` para guardar/leer credenciales del keychain del SO (con fallback documentado en Linux si no hay libsecret).
- Eventos de audit log para MCPs.

### Fase N2.3 — UI de MCPs (5 días)
- Pantalla de MCPs (Installed / Available).
- Tarjetas con estado y badges.
- Vista de detalle de un MCP: status, credentials (sin mostrar valores), logs, used in workers, health check, uninstall.
- Botón **+ Add MCP** con las tres pestañas (catálogo / registry / URL).
- Toda la UI sin tocar todavía el sistema de ejecución — los MCPs se pueden instalar y configurar pero aún no participan en runs.

### Fase N2.4 — Setup Wizard (1 semana)
- Componente genérico de wizard lineal con next/back/cancel y barra de progreso.
- Componentes para los tipos de paso: `info`, `text_field`, `api_key`, `select`, `oauth`, `test_connection`.
- Para `oauth`: levantar servidor local efímero, abrir navegador del SO, capturar callback, intercambiar code por tokens, guardar en keychain. Soportar al menos Google (provider `google`) y un genérico OAuth 2.0 con PKCE.
- Para `test_connection`: spawn del MCP en modo dry-run, ping, captura del resultado.
- Integración: tras instalar un MCP del catálogo que tiene `setup_steps`, encadenar el wizard automáticamente.
- Re-ejecutar el wizard desde **Reset credentials** o desde *Set up now* en cualquier punto donde se vea el MCP.

### Fase N2.5 — Integración con el worker engine (1 semana)
- Añadir el campo `mcps: []` al schema de `step.json` para workers.
- En la pestaña Skills, MCPs & Context del worker: render del bloque MCPs con estado por MCP y botones inline para configurar.
- Validación en el rail izquierdo: triángulo ámbar en workers con MCPs no listos, con tooltip.
- Extensión del **AI Terminal Adapter**: añadir al método `spawn()` la entrada `mcps: MCPDefinition[]`, y en el `claude-code` adapter implementar la traducción a la config MCP que el CLI espera.
- Pre-flight: antes de arrancar un run, verificar que todos los MCPs del worker están en estado Ready. Si no, abortar con `run_aborted_mcp_not_ready` y mostrar el bloqueo en la UI antes de tocar el estado *Running*.
- Persistencia en `runs/<id>/meta.json` de los MCPs activos durante el run.
- Mock adapter actualizado para tests: simula MCPs sin levantar procesos reales.

### Fase N2.6 — MCPs del catálogo iniciales (1.5 semanas, paralelizable)
Implementar y validar end-to-end al menos cuatro MCPs del catálogo, suficientes para casos de uso reales y para probar todos los tipos de credenciales:

- **Filesystem** — sin credenciales, sirve para probar la ruta más simple.
- **Web Browse** — sin credenciales pero con proceso real (validación de spawn).
- **Gmail** — OAuth Google, valida el flujo completo del wizard OAuth.
- **Google Calendar** — comparte credenciales OAuth con Gmail (mismo flujo, scope distinto).

Cada uno: definición en `mcps-catalog.json`, instalación funcional, wizard completo, ejecución real desde un worker, error handling cuando algo falla.

Los demás (Google Drive, GitHub, Slack, Notion, Fetch, Memory) pueden quedar definidos en el catálogo pero implementarse después de la beta — el sistema ya los soporta, solo falta probarlos uno a uno.

### Fase N2.7 — Workflow Author actualizado (3 días)
- Editar el prompt de `trayline-author` para que recomiende MCPs apropiados según la descripción del usuario.
- `trayline-scaffold` añade el campo `mcps` a los workers que lo necesiten.
- Banner post-scaffold adaptativo: si hay MCPs no configurados, el mensaje guía hacia configurarlos.
- Update de los example chips para incluir casos que aprovechen MCPs ("Read incoming sales emails and qualify leads" ahora realmente puede leer emails).

### Fase N2.8 — Import/Export y polish (4 días)
- `manifest.json` extendido con bloque `mcps`.
- Diálogo de import agrupando dependencias faltantes por tipo (skills, MCPs).
- Encadenado de wizards al importar un proyecto que requiere MCPs nuevos.
- Confirmación de seguridad ("This will install and run code...") al instalar MCPs por URL, con UI rigurosa (checkbox de confirmación, URL prominente).
- Empty states de las pantallas de Skills y MCPs.
- Tour onboarding actualizado para mencionar MCPs como capacidad clave.

**Total N2 estimado: ~6–7 semanas para un desarrollador full-time.** La parte que más riesgo concentra es N2.4 (OAuth en Electron tiene siempre detalles del SO) y N2.5 (la integración limpia con el adaptador del CLI). El resto es mecánica directa sobre patrones que ya están establecidos en el plan original.

---

## 8. Por qué esto cierra el círculo

El plan original deja a Trayline como un orquestador local muy elegante pero limitado a lo que el agente CLI puede hacer "desde cero" más algunos prompts en markdown. Con N2, los workers tienen acceso real al mundo del usuario: su correo, su calendario, sus documentos, la web. Eso transforma el tipo de workflows que se pueden construir — de "procesa este PDF que dejé en una carpeta" a "lee mis emails de las últimas 24h, identifica los que son leads de ventas, métele un evento en mi calendario para cada uno, y déjame los borradores de respuesta para revisar".

Y todo manteniendo la promesa central: ficheros en disco, sin nube, sin cuentas en Trayline. Las credenciales viven en el keychain del SO igual que cualquier otra app del usuario; los MCPs son procesos locales bajo su control; el zip de un proyecto sigue siendo portable porque las credenciales nunca viajan con él.

La promesa de que un departamento de IT pueda aprobar Trayline sigue intacta — quizás más fuerte aún, porque cada integración con servicios externos pasa por un MCP auditable, instalado explícitamente por el usuario, con las herramientas que expone visibles en el log de cada run.
