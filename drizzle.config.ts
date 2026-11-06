// drizzle.config.ts
import type { Config } from 'drizzle-kit'
export default {
        out: './migrations',
        schema: './src/schema.ts',
        dialect: 'sqlite',
} satisfies Config
