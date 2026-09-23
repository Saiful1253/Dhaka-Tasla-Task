import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

app.listen(config.port, () => {
  console.log(`🚗 Dhaka Tesla Pool API → http://localhost:${config.port}`);
});
