export const config = {
  port: parseInt(process.env.APP_PORT || '3000', 10),
  prefix: process.env.APP_PREFIX || '/api/v1',
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET environment variable is required');
      return secret;
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
};
