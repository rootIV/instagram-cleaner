const DEFAULTS = Object.freeze({
  dryRun: false,
  headless: false,
  limit: 20,
  maxAttempts: 3,
});

export function parseArgs(args) {
  const config = { ...DEFAULTS };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--dry-run') {
      config.dryRun = true;
    } else if (argument === '--headless') {
      config.headless = true;
    } else if (argument === '--limit') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        throw new Error('O limite deve ser um numero inteiro entre 1 e 20.');
      }
      config.limit = value;
      index += 1;
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }

  return config;
}
