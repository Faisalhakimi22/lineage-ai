/**
 * Express 5 types route params as `string | string[]`, since a param can repeat.
 * Every id in this API is single-valued, so collapse it once here rather than
 * scattering casts through the routes.
 */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}
