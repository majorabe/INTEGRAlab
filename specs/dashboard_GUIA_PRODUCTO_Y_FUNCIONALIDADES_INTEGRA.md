# GUÍA DE PRODUCTO Y FUNCIONALIDADES: PLATAFORMA INTEGRA

---

## 0. ¿Qué es INTEGRA, en una frase — y qué NO es?

> **INTEGRA es un prototipo funcional de alta fidelidad (MVP)** diseñado para demostrar de forma visual e interactiva cómo funcionaría un sistema digital transparente para el monitoreo y custodia de órganos donantes.  
> **NO es un sistema desplegado en producción en hospitales ni está conectado actualmente a contenedores físicos o redes de comunicación reales.**

---

### Transparencia de Prototipo: ¿Qué es real y qué es simulado en la versión actual?

Para una comprensión correcta del sistema durante las demostraciones, a continuación se resume el estado de cada componente de la plataforma:

* 🔴 **Simulado por Software (No hay hardware ni red física):**
  * **Telemetría de sensores:** Las lecturas de temperatura, carga de batería y posición GPS son generadas automáticamente por un motor de simulación para que el usuario pueda ver el comportamiento del sistema sin tener que esperar horas reales de viaje.
  * **Red Blockchain:** La inmutabilidad y la cadena de custodia se demuestran mediante un registro encadenado en la memoria del navegador; no existe una red de servidores *Hyperledger Fabric* desplegada físicamente.
  * **Certificados e Identidad (PKI/mTLS):** Los escudos de seguridad, firmas y credenciales son representaciones de diseño para la demostración, no una infraestructura de identidad institucional real.
  * **Base de Datos:** La información del caso vive e incrementa en la memoria del navegador mientras la aplicación está abierta; no se escribe ni lee de una base de datos MySQL en la nube.
* 🟢 **100% Real y Funcional:**
  * **El Modelo de Inteligencia Artificial:** La predicción de riesgo es procesada por un **modelo real de Machine Learning (Random Forest)** que corre en un microservicio activo.
* 🟡 **Mezcla (Cálculo real con datos de prueba):**
  * **El Diagnóstico de IA:** El algoritmo y el cálculo probabilístico de la IA son **completamente reales**, pero las 16 variables que recibe como entrada para diagnosticar son **datos simulados**.

---

### 🎛️ Barra de Control de Simulación y Cambio de Roles (Herramienta de Demo)

Dado que este sistema es un **prototipo funcional interactivo**, la parte superior de la pantalla incluye una **Barra de Control de Simulación** especialmente diseñada para que un jurado, evaluador o usuario pueda probar el sistema de punta a punta en pocos minutos:

1. **Selector de Rol Activo en Vivo:**  
   Permite cambiar instantáneamente la vista de la pantalla entre los 6 roles (**Coordinador INCUCAI, Hospital Receptor, Auditor Externo, Transportador Operativo, Proveedor IT y Dispositivo IoT**) mediante un menú desplegable en la cabecera, sin necesidad de cerrar sesión ni ingresar claves. Esto permite experimentar en vivo cómo se adapta la pantalla y los permisos según quién esté mirando.
2. **Control de Velocidad Temporal (60x a 3600x):**  
   Permite acelerar el paso del tiempo simulado (a 3600x, un segundo real equivale a una hora del viaje) o pausar la simulación para examinar un dato. Así, un traslado de 28 horas reales se puede observar y evaluar por completo en una presentación de 3 a 5 minutos.
3. **Salto Temporal Directo (Jump to T+X):**  
   Permite saltar inmediatamente a momentos clave de la historia (por ejemplo, inicio a $T+0\text{h}$, momento crítico a $T+12\text{h}$ o arribo al hospital a $T+28\text{h}$).
4. **Inyección de Escenarios de Contingencia:**  
   Permite seleccionar escenarios predeterminados (**Traslado Normal, Advertencia de Temperatura, Ataque de Ransomware o Desconexión de Red**) para demostrar cómo reacciona la interfaz y el modelo de IA ante situaciones de emergencia.

---

## 1. ¿Qué problema resuelve el sistema?

*(El problema de negocio es 100% real; la solución presentada es un prototipo demostrativo).*

En el transporte de órganos para trasplantes (como un riñón, un corazón o un hígado), **cada minuto cuenta y la seguridad biológica es vital**. Cuando un órgano viaja entre hospitales a cientos de kilómetros, surgen tres grandes riesgos:

1. **La cadena de frío puede romperse:** Si la temperatura interna del contenedor térmico se altera, el órgano se deteriora y el trasplante puede fracasar.
2. **Falta de visibilidad y confianza entre instituciones:** La autoridad sanitaria nacional (INCUCAI), los cirujanos receptores y los auditores necesitan saber por dónde viaja el órgano y tener certeza de que nadie abrió el contenedor en el camino.
3. **Imposibilidad de reaccionar a tiempo:** Si ocurre un imprevisto en la ruta, se necesitan alertas inmediatas para tomar decisiones médicas y logísticas urgentes.

**INTEGRA** demuestra cómo una plataforma inteligente puede actuar como una "caja negra transparente" digital, entregando a cada participante la información exacta que necesita según su rol para salvar vidas.

---

## 2. Los 6 roles del sistema — qué puede hacer cada uno

La plataforma aplica el principio de **"cada usuario ve únicamente lo necesario para su función"**. A continuación se describen los 6 actores del sistema y el alcance real de sus funcionalidades en este prototipo:

---

### 2.1. Coordinador Nacional (INCUCAI)
* **Quién es en la vida real:** El profesional de la autoridad sanitaria nacional responsable de gestionar las asignaciones de órganos a nivel nacional.
* **Qué puede VER en su pantalla:** El estado general del caso (órgano, origen, destino y avance simulado en mapa), el estado del contrato de asignación y las métricas de custodia.
* **Qué puede HACER:**
  * Aprobar y emitir la **Autorización Criptográfica** del contrato ingresando un PIN de seguridad de 6 dígitos.
  * Manejar la simulación: Iniciar, pausar, acelerar la velocidad del reloj (hasta 3600x) o cambiar el escenario de prueba (traslado normal, alerta de temperatura, ransomware o desconexión).
* **Qué NO puede hacer:** No puede modificar manualmente las lecturas registradas en la simulación.
* 💡 **Nota de Prototipo:** *Los datos de temperatura y ubicación GPS que ve este rol son generados por el simulador por software. El control de velocidad e inyección de escenarios es una herramienta de demo incorporada para facilitar la evaluación.*

---

### 2.2. Hospital Receptor
* **Quién es en la vida real:** El equipo médico y quirúrgico del hospital donde el paciente espera la llegada del órgano para la cirugía.
* **Qué puede VER en su pantalla:** El tiempo estimado de llegada, los minutos restantes de la ventana de isquemia tolerable y el gráfico de temperatura del contenedor.
* **Qué puede HACER:**
  * Firmar su contraparte del **Contrato de Asignación** para confirmar la preparación del quirófano.
  * Presionar el botón **"Confirmar Recepción Física"** cuando la simulación indica que el contenedor ha llegado a la puerta del hospital.
* **Qué NO puede hacer:** No puede autorizar la asignación del órgano en nombre de INCUCAI ni alterar la ruta asignada.
* 💡 **Nota de Prototipo:** *El usuario puede usar el selector de roles en el encabezado para pasar a la vista del Hospital Receptor y comprobar cómo el reloj de isquemia se descuenta de forma acelerada según la velocidad seleccionada.*

---

### 2.3. Auditor Externo
* **Quién es en la vida real:** Un inspector independiente sanitario o judicial que verifica el cumplimiento de las normativas.
* **Qué puede VER en su pantalla:** La línea de tiempo inalterable con todos los eventos del caso, el Expediente Forense de Caso Cerrado y el gráfico histórico de temperatura.
* **Qué puede HACER:** Filtrar y explorar el historial de eventos por categoría (alertas, firmas, traslados, incidentes).
* **Qué NO puede hacer:** **Tiene 0% de capacidad de escritura.** No posee botones para firmar, alterar alertas o cambiar estados.
* 💡 **Nota de Prototipo:** *Al alternar al rol de Auditor en la demo, la interfaz deshabilita automáticamente todo botón interactivo de mutación, demostrando el principio de lectura 100% pasiva para auditoría.*

---

### 2.4. Transportador Operativo
* **Quién es en la vida real:** El chofer de la ambulancia o agente logístico a cargo del traslado físico del contenedor.
* **Qué puede VER en su pantalla:** Panel simplificado con temperatura actual, nivel de batería del sensor y alertas de custodia activas en el vehículo.
* **Qué puede HACER:** Resolver alertas operativas mediante el botón **"Resolver Alerta"**, seleccionando la acción de mitigación realizada (ej. *"Se conectó la nevera a la toma auxiliar de la ambulancia"*).
* **Qué NO puede hacer:** No tiene acceso a la información médica del paciente donante o receptor.
* 💡 **Nota de Prototipo:** *Para probar la resolución de alertas en la demo, el usuario puede seleccionar el escenario "Alerta de Temperatura" en la barra de simulación y luego cambiar al rol de Transportador para presionar el botón "Resolver".*

---

### 2.5. Dispositivo IoT (Contenedor Inteligente)
* **Quién es en la vida real:** Los sensores integrados en la nevera térmica de transporte.
* **Qué puede VER en su pantalla:** Muestra un panel de estado de emisión de datos del contenedor.
* **Qué puede HACER:** Emitir lecturas periódicas de temperatura interna, ambiental, batería, sello de seguridad y coordenadas GPS.
* **Qué NO puede hacer:** No puede "ocultar" una lectura que supere el límite de seguridad.
* 💡 **Nota de Prototipo:** *Este actor es 100% simulado por código dentro de la aplicación web; las lecturas de los sensores varían automáticamente con el avance del reloj de simulación.*

---

### 2.6. Proveedor IT (Mantenimiento de Infraestructura)
* **Quién es en la vida real:** El técnico informático responsable de la infraestructura de servidores y redes.
* **Qué puede VER en su pantalla:** Salud de la red de servidores y una terminal de mantenimiento grabada en vivo.
* **Qué puede HACER:** Solicitar acceso temporal de mantenimiento técnico (PAM) para pruebas de red.
* **Qué NO puede hacer:** **Restricción de Privacidad (PoLP):** No puede ver temperaturas, datos de órganos ni información clínica.
* 💡 **Nota de Prototipo:** *Al cambiar al rol de Proveedor IT en la demo, la interfaz bloquea por completo la visualización de datos clínicos y de custodia, mostrando únicamente los componentes de red y logs de la consola.*

---

## 3. El viaje completo de un caso, paso a paso

A continuación se narra la secuencia de un traslado desde Buenos Aires hacia Córdoba, detallando qué ocurre en la historia y cómo se interactúa con el simulador:

```
[ PASO 1: Creación del Caso ] ──> [ PASO 2: Firma de Asignación ] ──> [ PASO 3: Inicio del Traslado ]
                                                                                   │
                                                                                   ▼
[ PASO 6: Cierre de Expediente ] <── [ PASO 5: Confirmación ] <── [ PASO 4: Monitoreo & Alertas ]
```

1. **Paso 1: Creación del Caso (Hora T+00h00m)**
   * *La historia:* Se confirma el órgano donante y se asigna el contenedor inteligente con una ventana de isquemia de 36 horas.
   * *Verificación de prototipo:* El caso se inicializa en estado "Preparado". El usuario puede ver la barra de simulación en $T+00\text{h}00\text{m}$.

2. **Paso 2: Firma del Contrato Digital de Asignación (Hora T+01h00m)**
   * *La historia:* INCUCAI y el Hospital Receptor aprueban el traslado mediante sus credenciales de seguridad.
   * *Verificación de prototipo:* *(Firma simbólica en la demo)*: El evaluador selecciona el rol "INCUCAI", firma con el PIN `123456`, y luego conmuta al rol "Hospital Receptor" con el selector superior para completar la segunda firma.

3. **Paso 3: Inicio del Traslado Físico (Hora T+01h30m)**
   * *La historia:* El contenedor se ubica en la ambulancia con el sello de seguridad cerrado y se inicia el recorrido.
   * *Verificación de prototipo:* *(Avance acelerado)*: Al presionar el botón "Play" en la barra de control y ajustar la velocidad a $360\text{x}$, el marcador de la ambulancia avanza gradualmente en el mapa interactivo.

4. **Paso 4: Monitoreo en Ruta e Incidentes (Hora T+12h00m)**
   * *La historia:* La temperatura ambiental externa sube y el contenedor registra $6.5^\circ\text{C}$, activando una alerta preventiva.
   * *Verificación de prototipo:* *(Salto temporal + Consulta de IA real)*: El evaluador puede presionar el botón de salto directo a $T+12\text{h}$ o seleccionar el escenario "Advertencia de Temperatura". Al presionar "Consultar IA", **el modelo real de Machine Learning en Python procesa los datos del instante simulado** y despliega la tarjeta de riesgo en pantalla.

5. **Paso 5: Arribo y Confirmación de Recepción (Hora T+28h00m)**
   * *La historia:* La ambulancia llega al hospital. El médico verifica que el sello está intacto y confirma la recepción física.
   * *Verificación de prototipo:* Al saltar a $T+28\text{h}$, el mapa muestra la llegada a Córdoba. El evaluador conmuta al rol "Hospital Receptor" y presiona "Confirmar Recepción Física".

6. **Paso 6: Cierre del Caso y Expediente Forense (Hora T+28h30m)**
   * *La historia:* El trasplante se realiza con éxito y el caso se archiva para auditoría.
   * *Verificación de prototipo:* *(Auditoría final)*: El evaluador conmuta al rol "Auditor Externo" y revisa el Expediente Forense consolidado de toda la simulación.

---

## 4. Las alertas y qué significan para el usuario

*(Aclaración de prototipo: Las situaciones de alerta se pueden inyectar interactivamente durante la demo usando el menú de escenarios en la barra superior).*

| Situación de Alerta | Severidad Visual | Lo que ve el usuario en pantalla | Acción esperada en el prototipo |
| :--- | :---: | :--- | :--- |
| **Advertencia de Temperatura** ($>6^\circ\text{C}$) | 🟡 Ámbar | *"Temperatura elevada en contenedor (6.2°C)"* | El usuario conmuta al rol de Transportador, presiona "Resolver Alerta" y selecciona una acción de mitigación simulada. |
| **Cadena de Frío Rota** ($>8^\circ\text{C}$) | 🔴 Rojo | *"Alerta Crítica: Rango de seguridad superado"* | En la vista de INCUCAI, se presiona "Consultar IA" para evaluar el diagnóstico de viabilidad del órgano. |
| **Batería Baja** ($<20\%$) | 🟡 Ámbar | *"Batería de Dispositivo IoT Baja (15%)"* | En la vista de Transportador, se prueba la acción de conectar el cargador auxiliar. |
| **Desconexión / Modo Offline** | 🟡 Ámbar | *"Dispositivo en Modo Offline — Guardando en memoria"* | La interfaz muestra cómo los registros se conservan localmente hasta presionar "Sincronizar". |
| **Ataque de Ransomware** | 🔴 Rojo | *"Nodo de Hospital Aislado por Actividad Sospechosa"* | Al seleccionar el escenario "Ransomware", la vista del Proveedor IT muestra la consola de aislamiento del servidor afectado. |

---

## 5. El asistente de IA — qué le aporta al usuario

> **DISTINCIÓN CLAVE DE ESTA SECCIÓN:**  
> **El modelo de Inteligencia Artificial y el cálculo de la predicción son REALES** (un algoritmo de Machine Learning entrenado responde de verdad a través de un servicio en ejecución), **pero el dato de entrada que recibe hoy proviene del SIMULADOR**.

---

### ¿Qué pregunta responde la Inteligencia Artificial?
El copiloto de IA analiza 16 variables del estado del traslado y responde en tiempo real a la pregunta:

> **"Con los datos actuales de la ruta, ¿qué tan arriesgado es este traslado y cuál es la probabilidad de que el órgano llegue en estado viable?"**

---

### ¿Cómo interactúa el usuario y qué significan los resultados?

1. **Consulta con un Clic:** El usuario presiona el botón **"Consultar Predicción de IA"** en su dashboard.
2. **Inferencia Real:** La aplicación web envía los datos de la pantalla al servicio de IA en Python. El modelo procesa la información y devuelve el resultado matemático real.
3. **Lectura del Diagnóstico:**
   * 🟢 **Riesgo BAJO:** Las condiciones actuales garantizan una alta probabilidad de éxito.
   * 🟡 **Riesgo MEDIO:** Existen fluctuaciones de temperatura o retrasos que requieren atención preventiva.
   * 🔴 **Riesgo ALTO:** Combinación crítica de factores (isquemia avanzada, temperatura fuera de rango). Requiere acción logística urgente.
4. **Porcentaje de Confianza:** La tarjeta muestra un porcentaje (ej. *94.5%*), que representa la certeza matemática calculada por el modelo Random Forest.

---

## 6. Estado actual del sistema: ¿Qué está listo hoy vs. qué falta para producción?

La siguiente tabla resume con total honestidad qué partes de la experiencia visual están listas hoy y qué conexión de infraestructura requiere cada módulo para operar en un entorno real:

| Módulo del Sistema | Estado Hoy en el MVP (Demostración) | Qué se mantendría IGUAL al ir a producción | Qué tendría que REEMPLAZARSE para producción real |
| :--- | :--- | :--- | :--- |
| **Interfaz de Usuario y Roles (RBAC)** | 🟢 100% Funcional e interactiva en el navegador. | Todos los dashboards, botones, mapas, modales, selector de roles y permisos. | Nada en el diseño visual; solo conectar los botones a la base de datos real. |
| **Motor de Inteligencia Artificial** | 🟡 **Cálculo REAL** / Dato de entrada simulado. | El código de la API de inferencia, la integración con FastAPI y el modelo entrenado. | Reemplazar la entrada de datos del simulador por el flujo de telemetría real del sensor. |
| **Barra de Simulación y Velocidad** | 🟡 Herramienta exclusiva para presentaciones y demo. | Útil para entornos de prueba, staging y capacitación de usuarios. | Se oculta en el entorno de producción real, donde el tiempo corre según el reloj astronómico real. |
| **Sensores y Telemetría IoT** | 🔴 100% Simulado por software. | El formato de visualización en pantalla de temperatura, batería y GPS. | Reemplazar el simulador por un servidor Broker (MQTT) que reciba datos de neveras físicas (ESP32/Teltonika). |
| **Cadena de Custodia (Blockchain)** | 🔴 Simulado con hashes en memoria local. | La interfaz del feed de trazabilidad, el buscador de eventos y la vista del auditor. | Reemplazar la función de hash en memoria por el SDK oficial conectado a una red real de *Hyperledger Fabric*. |
| **Autenticación e Identidad (PKI)** | 🔴 Demostración visual con PIN/TOTP. | La experiencia de usuario de ingresar un código de verificación para autorizar traslados. | Conectar los formularios a un servidor de autoridad de certificación real (X.509 / mTLS) y un proveedor SSO. |
| **Base de Datos y Persistencia** | 🔴 Todo corre en la memoria del navegador. | El esquema de tablas relacionales (`schema.prisma`) ya está diseñado. | Instanciar el cliente de Prisma para escribir y leer de un servidor MySQL real en la nube. |
