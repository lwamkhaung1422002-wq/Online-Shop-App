import jwt from "jsonwebtoken";

type JwtPayload = {
  userId: string;
  email: string;
};

const jwtSecret = process.env.JWT_SECRET ?? "";

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not defined.");
}

if (process.env.NODE_ENV === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long.");
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string): JwtPayload {
  const payload = jwt.verify(token, jwtSecret);

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.userId !== "string" ||
    typeof payload.email !== "string"
  ) {
    throw new Error("Invalid token payload.");
  }

  return {
    userId: payload.userId,
    email: payload.email,
  };
}
