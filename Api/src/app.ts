import cors from "cors";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { errorHandler } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { categoriesRouter } from "./routes/categories.routes.js";
import { customersRouter } from "./routes/customers.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { expensesRouter } from "./routes/expenses.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { inventoryRouter } from "./routes/inventory.routes.js";
import { ordersRouter } from "./routes/orders.routes.js";
import { paymentsRouter } from "./routes/payments.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { shopSettingsRouter } from "./routes/shop-settings.routes.js";
import { shopsRouter } from "./routes/shops.routes.js";

export const app = express();

const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const localOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? configuredOrigins
    : [...configuredOrigins, ...localOrigins];

function isAllowedDevelopmentOrigin(origin: string | undefined) {
  return Boolean(
    origin &&
      process.env.NODE_ENV !== "production" &&
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin),
  );
}

app.use(helmet());
app.use(pinoHttp());
app.use(compression());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || isAllowedDevelopmentOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS."));
    },
  }),
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Commerce API is running" });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/shops", shopsRouter);
app.use("/shops", shopSettingsRouter);
app.use("/shops", customersRouter);
app.use("/shops", categoriesRouter);
app.use("/shops", productsRouter);
app.use("/shops", inventoryRouter);
app.use("/shops", ordersRouter);
app.use("/shops", paymentsRouter);
app.use("/shops", expensesRouter);
app.use("/shops", dashboardRouter);

app.use(errorHandler);
