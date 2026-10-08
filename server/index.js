require('dotenv/config');

const { createApp, validateEnvironment } = require('./app');

const config = validateEnvironment();
const app = createApp(config);
const port = Number(process.env.PORT || 4000);

app.listen(port, '0.0.0.0', () => {
  console.info(JSON.stringify({
    level: 'info',
    message: 'Ask Ambernath API started',
    port,
    environment: config.environment,
    databaseConfigured: config.databaseConfigured,
  }));
});
