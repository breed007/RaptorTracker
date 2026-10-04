// Startup checks for production. Each one guards against a configuration that
// would boot successfully while leaving the install open: a missing or
// copy-pasted session secret, or a placeholder admin password that ships in
// the example files and the docs.

// Values that appear in .env.example, docker-compose.yml, or older docs.
const PLACEHOLDER = /changeme|replace[-_ ]?me|your[-_ ]?(secret|password)|example/i;

const GENERATE_SECRET = `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`;

/**
 * Returns a list of problems that should stop a production start. Empty when
 * the configuration is safe. `usingBootstrapPassword` tells us whether the
 * .env password still matters — once a password is set in the app, the hash
 * in the database wins and ADMIN_PASSWORD is ignored.
 */
function productionProblems(env, { usingBootstrapPassword } = {}) {
  const problems = [];

  const secret = env.SESSION_SECRET || '';
  if (!secret) {
    problems.push(`SESSION_SECRET is not set. Generate one with:\n    ${GENERATE_SECRET}`);
  } else if (PLACEHOLDER.test(secret)) {
    problems.push(`SESSION_SECRET is still a placeholder value. Generate a real one with:\n    ${GENERATE_SECRET}`);
  } else if (secret.length < 32) {
    problems.push(`SESSION_SECRET is only ${secret.length} characters; use at least 32. Generate one with:\n    ${GENERATE_SECRET}`);
  }

  if (usingBootstrapPassword) {
    const pass = env.ADMIN_PASSWORD || '';
    if (!pass) {
      problems.push('ADMIN_PASSWORD is not set, and no password has been set in the app yet.');
    } else if (PLACEHOLDER.test(pass)) {
      problems.push('ADMIN_PASSWORD is still a placeholder value from the example files. Set a real one in .env, ' +
        'sign in, then change it under Settings -> Account.');
    }
  }

  return problems;
}

module.exports = { productionProblems, PLACEHOLDER };
