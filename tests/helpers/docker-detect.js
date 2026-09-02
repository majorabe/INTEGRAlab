/**
 * Helper para detectar si Docker está disponible
 * Usado por tests que requieren manipular contenedores (resiliencia, etc.)
 */

const { execSync } = require('child_process');

/**
 * Verifica si el comando 'docker' está disponible
 * @returns {boolean} true si docker está disponible
 */
function isDockerAvailable() {
  try {
    execSync('which docker', { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Verifica si estamos corriendo dentro de un contenedor
 * Busca evidencia de /.dockerenv o similar
 * @returns {boolean} true si estamos en un contenedor
 */
function isInContainer() {
  const fs = require('fs');
  // Archivo creado solo en contenedores Docker
  return fs.existsSync('/.dockerenv');
}

/**
 * Devuelve un skip message apropiado para tests que requieren Docker
 * @returns {Object} { skipped: true, detail: message }
 */
function skipIfNoDocker(testName) {
  if (!isDockerAvailable()) {
    const inContainer = isInContainer();
    const detail = inContainer
      ? `${testName} saltado: Docker no disponible dentro del contenedor dashboard. Ejecuta los tests desde el host: npm run test:seguridad`
      : `${testName} saltado: Docker no está instalado en el sistema`;

    return {
      passed: true, // Consideramos skip como "passed" para no romper la suite
      detail,
      skipped: true,
    };
  }
  return null;
}

module.exports = {
  isDockerAvailable,
  isInContainer,
  skipIfNoDocker,
};

