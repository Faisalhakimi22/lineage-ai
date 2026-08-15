---
name: Zod File/Blob types need "dom" lib
description: An OpenAPI multipart/binary schema generates zod.instanceof(File), which fails to typecheck without the DOM lib.
---

When an OpenAPI schema has a `type: string, format: binary` property (used for multipart file upload bodies), Orval's zod codegen emits `zod.instanceof(File)`. TypeScript errors with `Cannot find name 'File'` (and similarly `Blob` in the matching TS type) unless the package's `tsconfig.json` includes the DOM lib.

**Why:** The monorepo's shared `tsconfig.base.json` only sets `"lib": ["es2022"]`. `lib/api-client-react` already had `"lib": ["dom", "es2022"]` for this reason, but `lib/api-zod` didn't, because it previously had no binary-typed schemas.

**How to apply:** Whenever a new OpenAPI binary/file schema is introduced and codegen output fails to typecheck with a `File`/`Blob` "cannot find name" error, add `"lib": ["dom", "es2022"]` to that specific package's `tsconfig.json` (don't change the shared base — keep it scoped).
