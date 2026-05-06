import dotenv from "dotenv";
import path from "path";

// Load .env.test for integration tests
dotenv.config({ path: path.resolve(__dirname, "../.env.test") });
