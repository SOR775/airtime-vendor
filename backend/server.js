const app = require("./src/app");
const config = require("./src/config/env");
const logger = require("./src/utils/logger");

app.listen(config.port, () => {
  logger.info(`Airtime vendor backend listening on port ${config.port} (${config.nodeEnv})`);
});
