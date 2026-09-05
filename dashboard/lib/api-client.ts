/**
 * @deprecated El dashboard clínico usa `read-client.ts` (solo GET).
 * Este archivo no expone escrituras: reexporta el cliente de lectura
 * para no dejar un módulo `/sign` `/tx` importable desde la UI.
 */

export { ReadClient as APIClient, getReadClient as getAPIClient } from './read-client'
